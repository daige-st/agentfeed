import * as path from "node:path";
import * as readline from "node:readline";
import { execFileSync } from "node:child_process";
import { existsSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { AgentFeedClient } from "./api-client.js";
import { connectSSE } from "./sse-client.js";
import { detectTriggers } from "./trigger.js";
import { invokeAgent } from "./invoker.js";
import { scanUnprocessed } from "./scanner.js";
import { SessionStore } from "./session-store.js";
import { FollowStore } from "./follow-store.js";
import { QueueStore } from "./queue-store.js";
import { PostSessionStore } from "./post-session-store.js";
import { AgentRegistryStore } from "./agent-registry-store.js";
import { createBackend } from "./backends/index.js";
import type { GlobalEvent, TriggerContext, PermissionMode, BackendType, BackendAgent } from "./types.js";

const MAX_WAKE_ATTEMPTS = 3;
const MAX_CRASH_RETRIES = 3;
const ALL_BACKEND_TYPES: BackendType[] = ["claude", "codex", "gemini"];

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

function detectInstalledBackends(): BackendType[] {
  return ALL_BACKEND_TYPES.filter((type) => {
    const backend = createBackend(type);
    try {
      execFileSync("which", [backend.binaryName], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });
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

function migrateSessionFile(backendType: BackendType): void {
  const dir = path.join(homedir(), ".agentfeed");
  const legacyPath = path.join(dir, "sessions.json");
  const newPath = path.join(dir, `sessions-${backendType}.json`);
  if (!existsSync(newPath) && existsSync(legacyPath)) {
    try {
      copyFileSync(legacyPath, newPath);
      console.log(`Migrated sessions.json → sessions-${backendType}.json`);
    } catch (err) {
      console.warn(`Failed to migrate session file:`, err);
    }
  }
}

const serverUrl = getRequiredEnv("AGENTFEED_URL");
const apiKey = getRequiredEnv("AGENTFEED_API_KEY");
const permissionMode = parsePermissionMode();
const extraAllowedTools = parseAllowedTools();
const baseName = process.env.AGENTFEED_AGENT_NAME ?? path.basename(process.cwd());

const client = new AgentFeedClient(serverUrl, apiKey);

let sseConnection: ReturnType<typeof connectSSE> | null = null;
const wakeAttempts = new Map<string, number>();
const runningKeys = new Set<string>();

function triggerKey(t: TriggerContext): string {
  return `${t.backendType}:${t.sessionName}`;
}
const followStore = new FollowStore(process.env.AGENTFEED_FOLLOW_FILE);
const queueStore = new QueueStore(process.env.AGENTFEED_QUEUE_FILE);
const postSessionStore = new PostSessionStore(process.env.AGENTFEED_POST_SESSION_FILE);
const agentRegistry = new AgentRegistryStore(process.env.AGENTFEED_AGENT_REGISTRY_FILE);

// Populated during init
const backendAgentMap = new Map<BackendType, BackendAgent>();
let backendAgents: BackendAgent[] = [];

function shutdown() {
  console.log("\nShutting down...");
  sseConnection?.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function isNamedSession(sessionName: string): boolean {
  // Named Sessions are explicitly created via @bot/session-name mentions.
  // PostId-based sessions (ps_xxx) are internal CLI session tracking — not separate agents.
  return sessionName !== "default" && !sessionName.startsWith("ps_");
}

async function ensureSessionAgent(sessionName: string, agentName: string, backendType: BackendType): Promise<string> {
  // Only Named Sessions get their own agent identity
  if (!isNamedSession(sessionName)) {
    const ba = backendAgentMap.get(backendType);
    return ba?.agent.id ?? client.agentId!;
  }

  const fullName = `${agentName}/${sessionName}`;

  // Check registry first
  const cachedId = agentRegistry.get(fullName);
  if (cachedId) return cachedId;

  // Register a new session-agent
  console.log(`Registering session agent: ${fullName}`);
  const sessionAgent = await client.registerAgent(fullName, backendType);
  agentRegistry.set(fullName, sessionAgent.id);
  return sessionAgent.id;
}

async function main(): Promise<void> {
  // Confirm yolo mode
  if (permissionMode === "yolo") {
    const confirmed = await confirmYolo();
    if (!confirmed) {
      console.log("Cancelled. Run without --permission yolo for safe mode.");
      process.exit(0);
    }
  }

  // Auto-detect installed backends
  const installedBackends = detectInstalledBackends();
  if (installedBackends.length === 0) {
    console.error("No supported CLI backends found. Install one of: claude, codex, gemini");
    process.exit(1);
  }

  const toolsInfo = extraAllowedTools.length > 0
    ? ` + ${extraAllowedTools.join(", ")}`
    : "";
  console.log(`AgentFeed Worker starting... (backends: ${installedBackends.join(", ")}, permission: ${permissionMode}${toolsInfo})`);

  // Register an agent for each detected backend
  for (const type of installedBackends) {
    // Migrate legacy session file for first backend (usually claude)
    migrateSessionFile(type);

    const backend = createBackend(type);
    const agentName = `${baseName}/${type}`;
    const agent = await client.register(agentName, type);
    const sessionStore = new SessionStore(
      path.join(homedir(), ".agentfeed", `sessions-${type}.json`)
    );
    const ba: BackendAgent = { backendType: type, backend, agent, sessionStore };
    backendAgentMap.set(type, ba);
    agentRegistry.set(agentName, agent.id);
    console.log(`Agent: ${agent.name} (${agent.id}) [${type}]`);
  }

  backendAgents = Array.from(backendAgentMap.values());

  // Register Named Session agents for all backends
  for (const ba of backendAgents) {
    const namedSessions = ba.sessionStore.keys().filter(isNamedSession);
    for (const sessionName of namedSessions) {
      try {
        await ensureSessionAgent(sessionName, ba.agent.name, ba.backendType);
      } catch (err) {
        console.warn(`Failed to register session agent ${ba.agent.name}/${sessionName}:`, err);
      }
    }
    if (namedSessions.length > 0) {
      console.log(`Registered ${namedSessions.length} named session agent(s) for ${ba.backendType}`);
    }
  }

  // Step 1: Startup scan for unprocessed items
  console.log("Scanning for unprocessed items...");
  const ownAgentIds = agentRegistry.getAllIds();
  const unprocessed = await scanUnprocessed(client, backendAgents, followStore, postSessionStore, ownAgentIds);
  if (unprocessed.length > 0) {
    console.log(`Found ${unprocessed.length} unprocessed item(s)`);
    handleTriggers(unprocessed);
  } else {
    console.log("No unprocessed items found.");
  }

  // Step 2: Connect to global SSE stream
  const sseUrl = `${serverUrl}/api/events/stream`;
  console.log("Connecting to global event stream...");

  sseConnection = connectSSE(sseUrl, apiKey, client.agentId, (rawEvent) => {
    if (rawEvent.type === "heartbeat") return;

    // Handle session_deleted events directly
    if (rawEvent.type === "session_deleted") {
      try {
        const data = JSON.parse(rawEvent.data) as { agent_id: string; session_name: string };
        const allIds = agentRegistry.getAllIds();
        if (allIds.has(data.agent_id)) {
          // Delete from all backend session stores
          for (const ba of backendAgents) {
            ba.sessionStore.delete(data.session_name);
          }
          postSessionStore.removeBySessionName(data.session_name);
          console.log(`Session deleted: ${data.session_name}`);
        }
      } catch (err) {
        console.error("Failed to handle session_deleted event:", err);
      }
      return;
    }

    try {
      const event: GlobalEvent = JSON.parse(rawEvent.data);
      const currentOwnIds = agentRegistry.getAllIds();
      const triggers = detectTriggers(event, backendAgents, followStore, postSessionStore, currentOwnIds);
      if (triggers.length > 0) {
        handleTriggers(triggers);
      }
    } catch (err) {
      console.error("Failed to parse event:", err);
    }
  }, (err) => {
    console.error("SSE error, reconnecting...", err.message);
  });

  console.log("Worker ready. Listening for events...");
}

function handleTriggers(triggers: TriggerContext[]): void {
  for (const t of triggers) {
    queueStore.push(t);
    console.log(`Queued trigger: ${t.triggerType} on ${t.postId} [${t.backendType}] (queue size: ${queueStore.size})`);
  }
  scheduleQueue();
}

function scheduleQueue(): void {
  const queued = queueStore.drain();
  if (queued.length === 0) return;

  const toRun: TriggerContext[] = [];

  for (const t of queued) {
    const attempts = wakeAttempts.get(t.eventId) ?? 0;
    if (attempts >= MAX_WAKE_ATTEMPTS) {
      console.log(`Skipping ${t.eventId}: max wake attempts reached`);
      continue;
    }

    const key = triggerKey(t);
    if (runningKeys.has(key)) {
      // Same backend+session already running — re-queue
      queueStore.push(t);
    } else {
      toRun.push(t);
      runningKeys.add(key);
    }
  }

  for (const trigger of toRun) {
    processItem(trigger).catch((err) => {
      console.error(`Error processing ${trigger.postId}:`, err);
    });
  }
}

async function processItem(trigger: TriggerContext): Promise<void> {
  const key = triggerKey(trigger);
  wakeAttempts.set(trigger.eventId, (wakeAttempts.get(trigger.eventId) ?? 0) + 1);

  const ba = backendAgentMap.get(trigger.backendType);
  if (!ba) {
    console.warn(`No backend for ${trigger.backendType}, skipping`);
    runningKeys.delete(key);
    scheduleQueue();
    return;
  }

  // Auto-follow thread on mention
  if (trigger.triggerType === "mention") {
    followStore.add(trigger.postId);
    console.log(`Following thread: ${trigger.postId}`);
  }

  const sessionAgentId = await ensureSessionAgent(trigger.sessionName, ba.agent.name, ba.backendType);
  const recentContext = await fetchContext(trigger);

  console.log(`Waking agent for: ${trigger.triggerType} on ${trigger.postId} [${trigger.backendType}] (session: ${trigger.sessionName}, agentId: ${sessionAgentId})`);

  await client.setAgentStatus({
    status: "thinking",
    feed_id: trigger.feedId,
    post_id: trigger.postId,
  }, sessionAgentId);

  let retries = 0;
  let success = false;
  try {
    while (retries < MAX_CRASH_RETRIES) {
      try {
        const result = await invokeAgent(ba.backend, {
          agent: ba.agent,
          trigger,
          apiKey,
          serverUrl,
          recentContext,
          permissionMode,
          extraAllowedTools,
          sessionId: ba.sessionStore.get(trigger.sessionName),
          agentId: sessionAgentId,
        });

        if (result.sessionId) {
          ba.sessionStore.set(trigger.sessionName, result.sessionId);
          postSessionStore.set(trigger.postId, trigger.backendType, trigger.sessionName);
          await client.reportSession(trigger.sessionName, result.sessionId, sessionAgentId).catch((err) => {
            console.warn("Failed to report session:", err);
          });
        }

        if (result.exitCode === 0) {
          success = true;
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
    await client.setAgentStatus({
      status: "idle",
      feed_id: trigger.feedId,
      post_id: trigger.postId,
    }, sessionAgentId);
  }

  runningKeys.delete(key);

  // Post-completion: re-scan for items that arrived during execution
  try {
    const currentOwnIds = agentRegistry.getAllIds();
    const newUnprocessed = await scanUnprocessed(client, backendAgents, followStore, postSessionStore, currentOwnIds);
    for (const t of newUnprocessed) {
      queueStore.push(t);
    }
    if (newUnprocessed.length > 0) {
      console.log(`Post-completion scan: ${newUnprocessed.length} item(s) added to queue`);
    }
  } catch (err) {
    console.error("Post-completion scan error:", err);
  }

  // Schedule next items (may have been re-queued or newly added)
  scheduleQueue();
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
