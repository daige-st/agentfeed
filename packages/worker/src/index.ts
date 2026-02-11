import * as readline from "node:readline";
import { AgentFeedClient } from "./api-client.js";
import { connectSSE } from "./sse-client.js";
import { detectTrigger } from "./trigger.js";
import { invokeAgent } from "./invoker.js";
import { scanUnprocessed } from "./scanner.js";
import { SessionStore } from "./session-store.js";
import { FollowStore } from "./follow-store.js";
import { QueueStore } from "./queue-store.js";
import type { AgentInfo, GlobalEvent, TriggerContext, PermissionMode } from "./types.js";

const MAX_WAKE_ATTEMPTS = 3;
const MAX_CRASH_RETRIES = 3;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function parsePermissionMode(): PermissionMode {
  const idx = process.argv.indexOf("--permission");
  if (idx === -1) return "safe";

  const value = process.argv[idx + 1];
  if (value === "yolo") return "yolo";
  if (value === "safe") return "safe";

  console.error(`Unknown permission mode: "${value}". Use "safe" (default) or "yolo".`);
  process.exit(1);
}

function parseAllowedTools(): string[] {
  const tools: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === "--allowed-tools") {
      // Collect all following args until the next flag (starts with --)
      for (let j = i + 1; j < process.argv.length; j++) {
        if (process.argv[j]!.startsWith("--")) break;
        tools.push(process.argv[j]!);
      }
      break;
    }
  }
  return tools;
}

function confirmYolo(): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    console.log("");
    console.log("  \x1b[33m⚠️  YOLO mode enabled. The agent can do literally anything.\x1b[0m");
    console.log("  \x1b[33m   No prompt sandboxing. No trust boundaries.\x1b[0m");
    console.log("  \x1b[33m   Prompt injection? Not your problem today.\x1b[0m");
    console.log("");
    rl.question("  Continue? (y/N): ", (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

const serverUrl = getRequiredEnv("AGENTFEED_URL");
const apiKey = getRequiredEnv("AGENTFEED_API_KEY");
const permissionMode = parsePermissionMode();
const extraAllowedTools = parseAllowedTools();

const client = new AgentFeedClient(serverUrl, apiKey);

let isRunning = false;
let sseConnection: ReturnType<typeof connectSSE> | null = null;
const wakeAttempts = new Map<string, number>();
const sessionStore = new SessionStore(process.env.AGENTFEED_SESSION_FILE);
const followStore = new FollowStore(process.env.AGENTFEED_FOLLOW_FILE);
const queueStore = new QueueStore(process.env.AGENTFEED_QUEUE_FILE);

function shutdown() {
  console.log("\nShutting down...");
  sseConnection?.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main(): Promise<void> {
  // Confirm yolo mode
  if (permissionMode === "yolo") {
    const confirmed = await confirmYolo();
    if (!confirmed) {
      console.log("Cancelled. Run without --permission yolo for safe mode.");
      process.exit(0);
    }
  }

  const toolsInfo = extraAllowedTools.length > 0
    ? ` + ${extraAllowedTools.join(", ")}`
    : "";
  console.log(`AgentFeed Worker starting... (permission: ${permissionMode}${toolsInfo})`);

  // Step 0: Initialize
  const agent = await client.getMe();
  console.log(`Agent: ${agent.name} (${agent.id})`);

  const skillMd = await client.getSkillMd();
  console.log("Skill document cached.");

  // Step 1: Startup scan for unprocessed items
  console.log("Scanning for unprocessed items...");
  const unprocessed = await scanUnprocessed(client, agent, followStore);
  if (unprocessed.length > 0) {
    console.log(`Found ${unprocessed.length} unprocessed item(s)`);
    await handleTriggers(unprocessed, agent, skillMd);
  } else {
    console.log("No unprocessed items found.");
  }

  // Step 2: Connect to global SSE stream
  const sseUrl = `${serverUrl}/api/events/stream?author_type=human`;
  console.log("Connecting to global event stream...");

  sseConnection = connectSSE(sseUrl, apiKey, (rawEvent) => {
    if (rawEvent.type === "heartbeat") return;

    try {
      const event: GlobalEvent = JSON.parse(rawEvent.data);
      const trigger = detectTrigger(event, agent, followStore);
      if (trigger) {
        handleTriggers([trigger], agent, skillMd);
      }
    } catch (err) {
      console.error("Failed to parse event:", err);
    }
  }, (err) => {
    console.error("SSE error, reconnecting...", err.message);
  });

  console.log("Worker ready. Listening for events...");
}

async function handleTriggers(
  triggers: TriggerContext[],
  agent: AgentInfo,
  skillMd: string
): Promise<void> {
  // Queue all incoming triggers (persisted to disk)
  for (const t of triggers) {
    queueStore.push(t);
    console.log(`Queued trigger: ${t.triggerType} on ${t.postId} (queue size: ${queueStore.size})`);
  }

  if (isRunning) return;

  // Process queue until empty
  await processQueue(agent, skillMd);
}

async function processQueue(
  agent: AgentInfo,
  skillMd: string
): Promise<void> {
  while (true) {
    const queued = queueStore.drain();
    if (queued.length === 0) break;

    // Filter by wake attempt limit
    const eligible = queued.filter((t) => {
      const attempts = wakeAttempts.get(t.eventId) ?? 0;
      if (attempts >= MAX_WAKE_ATTEMPTS) {
        console.log(`Skipping ${t.eventId}: max wake attempts reached`);
        return false;
      }
      return true;
    });

    if (eligible.length === 0) break;

    isRunning = true;
    const trigger = eligible[0]!;

    // Re-queue remaining items
    for (const t of eligible.slice(1)) {
      queueStore.push(t);
    }

    wakeAttempts.set(trigger.eventId, (wakeAttempts.get(trigger.eventId) ?? 0) + 1);

    // Auto-follow thread on mention (so future comments trigger without re-mention)
    if (trigger.triggerType === "mention") {
      followStore.add(trigger.postId);
      console.log(`Following thread: ${trigger.postId}`);
    }

    // Fetch recent context for the prompt
    const recentContext = await fetchContext(trigger);

    console.log(`Waking agent for: ${trigger.triggerType} on ${trigger.postId}`);

    // Report thinking status
    await client.setAgentStatus({
      status: "thinking",
      feed_id: trigger.feedId,
      post_id: trigger.postId,
    });

    let retries = 0;
    let success = false;
    try {
      while (retries < MAX_CRASH_RETRIES) {
        try {
          const result = await invokeAgent({
            agent,
            trigger,
            skillMd,
            apiKey,
            serverUrl,
            recentContext,
            permissionMode,
            extraAllowedTools,
            sessionId: sessionStore.get(trigger.postId),
          });

          if (result.sessionId) {
            sessionStore.set(trigger.postId, result.sessionId);
          }

          if (result.exitCode === 0) {
            success = true;
            break;
          }

          // If resume failed (stale session), clear it and retry as new session
          if (result.exitCode !== 0 && sessionStore.get(trigger.postId)) {
            console.log("Session may be stale, clearing and retrying as new session...");
            sessionStore.delete(trigger.postId);
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
      // Always report idle when done
      await client.setAgentStatus({
        status: "idle",
        feed_id: trigger.feedId,
        post_id: trigger.postId,
      });
    }

    isRunning = false;

    // Post-completion: re-scan for items that arrived during execution and add to queue
    try {
      const agent2 = await client.getMe();
      const newUnprocessed = await scanUnprocessed(client, agent2, followStore);
      for (const t of newUnprocessed) {
        queueStore.push(t);
      }
      if (newUnprocessed.length > 0) {
        console.log(`Post-completion scan: ${newUnprocessed.length} item(s) added to queue`);
      }
    } catch (err) {
      console.error("Post-completion scan error:", err);
    }

    // Loop continues to process next item in queue
  }
}

async function fetchContext(trigger: TriggerContext): Promise<string> {
  try {
    const comments = await client.getPostComments(trigger.postId, { limit: 10 });
    return comments.data
      .map((c) => `[${c.author_type}${c.author_name ? ` (${c.author_name})` : ""}] ${c.content}`)
      .join("\n");
  } catch {
    return "";
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
