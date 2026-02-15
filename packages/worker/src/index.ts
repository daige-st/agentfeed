import * as path from "node:path";
import { homedir } from "node:os";
import { AgentFeedClient } from "./api-client.js";
import { connectSSE } from "./sse-client.js";
import { detectTriggers } from "./trigger.js";
import { scanUnprocessed } from "./scanner.js";
import { SessionStore } from "./session-store.js";
import { FollowStore } from "./follow-store.js";
import { QueueStore } from "./queue-store.js";
import { PostSessionStore } from "./post-session-store.js";
import { AgentRegistryStore } from "./agent-registry-store.js";
import { createBackend } from "./backends/index.js";
import { handleTriggers, loadSettings, type ProcessorDeps } from "./processor.js";
import {
  getRequiredEnv,
  parsePermissionMode,
  parseAllowedTools,
  detectInstalledBackends,
  probeBackend,
  confirmYolo,
  migrateSessionFile,
} from "./cli.js";
import type { GlobalEvent, BackendType, BackendAgent } from "./types.js";

const serverUrl = getRequiredEnv("AGENTFEED_URL");
const apiKey = getRequiredEnv("AGENTFEED_API_KEY");
const permissionMode = parsePermissionMode();
const extraAllowedTools = parseAllowedTools();
const baseName = process.env.AGENTFEED_AGENT_NAME ?? path.basename(process.cwd());

const client = new AgentFeedClient(serverUrl, apiKey);

let sseConnection: ReturnType<typeof connectSSE> | null = null;

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

function getProcessorDeps(): ProcessorDeps {
  return {
    client,
    apiKey,
    serverUrl,
    permissionMode,
    extraAllowedTools,
    backendAgentMap,
    backendAgents,
    followStore,
    queueStore,
    postSessionStore,
    agentRegistry,
    ensureSessionAgent,
  };
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

  // Auto-detect installed backends and probe auth
  const installedBackends = detectInstalledBackends();
  if (installedBackends.length === 0) {
    console.error("No supported CLI backends found. Install one of: claude, codex, gemini");
    process.exit(1);
  }

  console.log(`Installed backends: ${installedBackends.join(", ")}. Probing auth...`);
  const availableBackends: BackendType[] = [];
  for (const type of installedBackends) {
    const ok = await probeBackend(type);
    if (ok) {
      availableBackends.push(type);
      console.log(`  ${type}: ✓ authenticated`);
    } else {
      console.log(`  ${type}: ✗ not authenticated, skipping`);
    }
  }

  if (availableBackends.length === 0) {
    console.error("No authenticated backends found. Please log in to at least one CLI.");
    process.exit(1);
  }

  const toolsInfo = extraAllowedTools.length > 0
    ? ` + ${extraAllowedTools.join(", ")}`
    : "";
  console.log(`AgentFeed Worker starting... (backends: ${availableBackends.join(", ")}, permission: ${permissionMode}${toolsInfo})`);

  // Register an agent for each available backend
  for (const type of availableBackends) {
    // Migrate legacy session file for first backend (usually claude)
    migrateSessionFile(type);

    const backend = createBackend(type);
    const agentName = `${baseName}/${type}`;
    const agent = await client.registerAgent(agentName, type);
    if (!client.agentId) client.setDefaultAgentId(agent.id);
    const sessionStore = new SessionStore(
      path.join(homedir(), ".agentfeed", `sessions-${type}.json`)
    );
    const ba: BackendAgent = { backendType: type, backend, agent, sessionStore };

    // Fetch per-agent config from server (permission_mode, allowed_tools)
    try {
      const config = await client.getAgentConfig(agent.id);
      ba.config = config;
      const modelLabel = config.model ? `, model: ${config.model}` : "";
      console.log(`Agent: ${agent.name} (${agent.id}) [${type}] (server config: ${config.permission_mode}, tools: ${config.allowed_tools.length}${modelLabel})`);
    } catch {
      console.log(`Agent: ${agent.name} (${agent.id}) [${type}] (using CLI defaults)`);
    }

    backendAgentMap.set(type, ba);
    agentRegistry.set(agentName, agent.id);
  }

  backendAgents = Array.from(backendAgentMap.values());

  // Server config yolo is pre-authorized by admin — no confirmation needed
  // Only confirm if CLI explicitly requests yolo via --permission flag
  if (permissionMode !== "yolo") {
    const hasServerYolo = backendAgents.some((ba) => ba.config?.permission_mode === "yolo");
    if (hasServerYolo) {
      console.log("\nServer config has yolo permission for one or more agents (auto-confirmed by server settings).");
    }
  }

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

  const deps = getProcessorDeps();

  // Load bot mention limit settings from server
  await loadSettings(client);

  // Refresh settings every 5 minutes
  setInterval(async () => {
    await loadSettings(client);
  }, 5 * 60 * 1000);

  // Step 1: Startup scan for unprocessed items
  console.log("Scanning for unprocessed items...");
  const ownAgentIds = agentRegistry.getAllIds();
  const unprocessed = await scanUnprocessed(client, backendAgents, followStore, postSessionStore, ownAgentIds);
  if (unprocessed.length > 0) {
    console.log(`Found ${unprocessed.length} unprocessed item(s)`);
    handleTriggers(unprocessed, deps);
  } else {
    console.log("No unprocessed items found.");
  }

  // Step 2: Connect to global SSE stream
  const sseUrl = `${serverUrl}/api/events/stream`;
  console.log("Connecting to global event stream...");

  // Collect all backend agent IDs for online tracking via single SSE connection
  const allAgentIds = backendAgents.map((ba) => ba.agent.id);

  sseConnection = connectSSE(sseUrl, apiKey, allAgentIds, (rawEvent) => {
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
        handleTriggers(triggers, deps);
      }
    } catch (err) {
      console.error("Failed to parse event:", err);
    }
  }, (err) => {
    console.error("SSE error, reconnecting...", err.message);
  });

  console.log("Worker ready. Listening for events...");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
