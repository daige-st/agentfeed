import { AgentFeedClient } from "./api-client.js";
import { invokeAgent } from "./invoker.js";
import { scanUnprocessed } from "./scanner.js";
import { FollowStore } from "./follow-store.js";
import { QueueStore } from "./queue-store.js";
import { PostSessionStore } from "./post-session-store.js";
import { AgentRegistryStore } from "./agent-registry-store.js";
import type { TriggerContext, PermissionMode, BackendType, BackendAgent } from "./types.js";

const MAX_WAKE_ATTEMPTS = 3;
const MAX_CRASH_RETRIES = 3;
const AGENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CONCURRENT = 5;
const MAX_BOT_MENTIONS_PER_POST = 4;

export interface ProcessorDeps {
  client: AgentFeedClient;
  apiKey: string;
  serverUrl: string;
  permissionMode: PermissionMode;
  extraAllowedTools: string[];
  backendAgentMap: Map<BackendType, BackendAgent>;
  backendAgents: BackendAgent[];
  followStore: FollowStore;
  queueStore: QueueStore;
  postSessionStore: PostSessionStore;
  agentRegistry: AgentRegistryStore;
  ensureSessionAgent: (sessionName: string, agentName: string, backendType: BackendType) => Promise<string>;
}

const wakeAttempts = new Map<string, number>();
const botMentionCounts = new Map<string, number>();
const runningKeys = new Set<string>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const RETRY_DELAY_MS = 3000;

// Periodic cleanup to prevent memory growth
setInterval(() => { wakeAttempts.clear(); botMentionCounts.clear(); }, 10 * 60 * 1000);

function triggerKey(t: TriggerContext): string {
  return `${t.backendType}:${t.sessionName}`;
}

export function handleTriggers(triggers: TriggerContext[], deps: ProcessorDeps): void {
  for (const t of triggers) {
    // Prevent bot-to-bot mention loops
    if (t.authorIsBot && t.triggerType === "mention") {
      const count = botMentionCounts.get(t.postId) ?? 0;
      if (count >= MAX_BOT_MENTIONS_PER_POST) {
        console.log(`Skipping bot mention on ${t.postId}: loop limit (${MAX_BOT_MENTIONS_PER_POST}) reached`);
        continue;
      }
      botMentionCounts.set(t.postId, count + 1);
    }
    deps.queueStore.push(t);
    console.log(`Queued trigger: ${t.triggerType} on ${t.postId} [${t.backendType}] (queue size: ${deps.queueStore.size})`);
  }
  scheduleQueue(deps);
}

function scheduleQueue(deps: ProcessorDeps): void {
  const queued = deps.queueStore.drain();
  if (queued.length === 0) return;

  const toRun: TriggerContext[] = [];

  let hasRequeued = false;

  for (const t of queued) {
    const attempts = wakeAttempts.get(t.eventId) ?? 0;
    if (attempts >= MAX_WAKE_ATTEMPTS) {
      console.log(`Skipping ${t.eventId}: max wake attempts reached`);
      continue;
    }

    const key = triggerKey(t);
    if (runningKeys.size >= MAX_CONCURRENT || runningKeys.has(key)) {
      // Same backend+session already running — re-queue
      deps.queueStore.push(t);
      hasRequeued = true;
    } else {
      toRun.push(t);
      runningKeys.add(key);
    }
  }

  // Schedule retry for re-queued items so they don't wait for next SSE event
  if (hasRequeued) {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      scheduleQueue(deps);
    }, RETRY_DELAY_MS);
  }

  for (const trigger of toRun) {
    processItem(trigger, deps).catch((err) => {
      console.error(`Error processing ${trigger.postId}:`, err);
    });
  }
}

async function processItem(trigger: TriggerContext, deps: ProcessorDeps): Promise<void> {
  const key = triggerKey(trigger);
  wakeAttempts.set(trigger.eventId, (wakeAttempts.get(trigger.eventId) ?? 0) + 1);

  const ba = deps.backendAgentMap.get(trigger.backendType);
  if (!ba) {
    console.warn(`No backend for ${trigger.backendType}, skipping`);
    runningKeys.delete(key);
    scheduleQueue(deps);
    return;
  }

  try {
    // Auto-follow thread on mention
    if (trigger.triggerType === "mention") {
      deps.followStore.add(trigger.postId);
      console.log(`Following thread: ${trigger.postId}`);
    }

    const sessionAgentId = await deps.ensureSessionAgent(trigger.sessionName, ba.agent.name, ba.backendType);
    const recentContext = await fetchContext(trigger, deps);

    console.log(`Waking agent for: ${trigger.triggerType} on ${trigger.postId} [${trigger.backendType}] (session: ${trigger.sessionName}, agentId: ${sessionAgentId})`);

    await deps.client.setAgentStatus({
      status: "thinking",
      feed_id: trigger.feedId,
      post_id: trigger.postId,
    }, sessionAgentId);

    // Server config overrides CLI args
    const effectivePermission = ba.config?.permission_mode ?? deps.permissionMode;
    const effectiveTools = ba.config?.allowed_tools?.length
      ? ba.config.allowed_tools
      : deps.extraAllowedTools;
    const effectiveModel = ba.config?.model;
    const effectiveChrome = ba.config?.chrome ?? false;

    let retries = 0;
    let success = false;
    try {
      while (retries < MAX_CRASH_RETRIES) {
        try {
          const result = await invokeAgent(ba.backend, {
            agent: ba.agent,
            trigger,
            apiKey: deps.apiKey,
            serverUrl: deps.serverUrl,
            recentContext,
            permissionMode: effectivePermission,
            extraAllowedTools: effectiveTools,
            model: effectiveModel ?? undefined,
            chrome: effectiveChrome,
            sessionId: ba.sessionStore.get(trigger.sessionName),
            agentId: sessionAgentId,
            timeoutMs: AGENT_TIMEOUT_MS,
          });

          if (result.sessionId) {
            ba.sessionStore.set(trigger.sessionName, result.sessionId);
            deps.postSessionStore.set(trigger.postId, trigger.backendType, trigger.sessionName);
            await deps.client.reportSession(trigger.sessionName, result.sessionId, sessionAgentId).catch((err) => {
              console.warn("Failed to report session:", err);
            });
          }

          if (result.exitCode === 0) {
            success = true;
            break;
          }

          if (result.timedOut) {
            console.warn("Agent timed out, skipping retry");
            break;
          }

          if (result.exitCode !== 0 && ba.sessionStore.get(trigger.sessionName)) {
            console.log("Session may be stale, clearing and retrying as new session...");
            ba.sessionStore.delete(trigger.sessionName);
          }

          console.error(`Agent exited with code ${result.exitCode}, retry ${retries + 1}/${MAX_CRASH_RETRIES}`);
        } catch (err) {
          console.error("Agent invocation error:", err);
        }
        retries++;
      }

      if (!success) {
        console.error(`Agent failed after ${MAX_CRASH_RETRIES} retries`);
      }
    } finally {
      await deps.client.setAgentStatus({
        status: "idle",
        feed_id: trigger.feedId,
        post_id: trigger.postId,
      }, sessionAgentId);
    }
  } finally {
    runningKeys.delete(key);

    // Post-completion: re-scan for items that arrived during execution
    try {
      const currentOwnIds = deps.agentRegistry.getAllIds();
      const newUnprocessed = await scanUnprocessed(deps.client, deps.backendAgents, deps.followStore, deps.postSessionStore, currentOwnIds);
      for (const t of newUnprocessed) {
        deps.queueStore.push(t);
      }
      if (newUnprocessed.length > 0) {
        console.log(`Post-completion scan: ${newUnprocessed.length} item(s) added to queue`);
      }
    } catch (err) {
      console.error("Post-completion scan error:", err);
    }

    scheduleQueue(deps);
  }
}

async function fetchContext(trigger: TriggerContext, deps: ProcessorDeps): Promise<string> {
  try {
    const comments = await deps.client.getPostComments(trigger.postId, { limit: 10 });
    return comments.data
      .map((c) => `[${c.author_type}${c.author_name ? ` (${c.author_name})` : ""}] ${c.content}`)
      .join("\n");
  } catch {
    return "";
  }
}
