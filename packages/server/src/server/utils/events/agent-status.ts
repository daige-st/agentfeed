import { emitGlobalEvent } from "./global.ts";

// Per-feed agent status events
export interface AgentStatusEvent {
  event: "agent_typing" | "agent_idle";
  agent_id: string;
  agent_name: string;
  agent_type?: string | null;
  feed_id: string;
  post_id: string;
}

interface AgentStatusEntry {
  data: AgentStatusEvent;
  timestamp: number;
}

type AgentStatusListener = (data: AgentStatusEvent) => void;

const feedAgentStatusListeners = new Map<string, Set<AgentStatusListener>>();

const AGENT_STATUS_TTL_MS = 120000; // 2 minutes

// In-memory: feedId → Map<agentId, AgentStatusEntry>
const activeAgentStatuses = new Map<string, Map<string, AgentStatusEntry>>();

// Periodic cleanup of stale agent statuses
setInterval(() => {
  const now = Date.now();
  for (const [feedId, agents] of activeAgentStatuses) {
    for (const [agentId, entry] of agents) {
      if (now - entry.timestamp > AGENT_STATUS_TTL_MS) {
        agents.delete(agentId);
      }
    }
    if (agents.size === 0) {
      activeAgentStatuses.delete(feedId);
    }
  }
}, 30000);

export function onFeedAgentStatus(
  feedId: string,
  listener: AgentStatusListener
): () => void {
  if (!feedAgentStatusListeners.has(feedId)) {
    feedAgentStatusListeners.set(feedId, new Set());
  }
  feedAgentStatusListeners.get(feedId)!.add(listener);

  return () => {
    const listeners = feedAgentStatusListeners.get(feedId);
    listeners?.delete(listener);
    if (listeners?.size === 0) {
      feedAgentStatusListeners.delete(feedId);
    }
  };
}

export function emitFeedAgentStatus(data: AgentStatusEvent): void {
  const { feed_id, agent_id, event } = data;

  // Update in-memory store
  if (event === "agent_typing") {
    if (!activeAgentStatuses.has(feed_id)) {
      activeAgentStatuses.set(feed_id, new Map());
    }
    activeAgentStatuses.get(feed_id)!.set(agent_id, { data, timestamp: Date.now() });
  } else {
    activeAgentStatuses.get(feed_id)?.delete(agent_id);
    if (activeAgentStatuses.get(feed_id)?.size === 0) {
      activeAgentStatuses.delete(feed_id);
    }
  }

  feedAgentStatusListeners.get(feed_id)?.forEach((listener) => listener(data));

  // Also emit as global event for frontend global SSE
  emitGlobalEvent({
    type: event === "agent_typing" ? "agent_typing" : "agent_idle",
    agent_id,
    agent_name: data.agent_name,
    agent_type: data.agent_type,
    feed_id,
    post_id: data.post_id,
  });
}

export function getAgentStatuses(feedId: string): AgentStatusEvent[] {
  const map = activeAgentStatuses.get(feedId);
  if (!map) return [];
  const now = Date.now();
  const result: AgentStatusEvent[] = [];
  for (const [, entry] of map) {
    if (now - entry.timestamp <= AGENT_STATUS_TTL_MS) {
      result.push(entry.data);
    }
  }
  return result;
}

export function getAllActiveAgents(): AgentStatusEvent[] {
  const now = Date.now();
  const result: AgentStatusEvent[] = [];
  for (const [, agents] of activeAgentStatuses) {
    for (const [, entry] of agents) {
      if (now - entry.timestamp <= AGENT_STATUS_TTL_MS) {
        result.push(entry.data);
      }
    }
  }
  return result;
}
