// Per-feed comment events (existing SSE)
export interface FeedCommentEvent {
  id: string;
  post_id: string;
  content: string;
  author_type: "human" | "bot";
  created_by: string | null;
  author_name: string | null;
  created_at: string;
}

type Listener = (data: FeedCommentEvent) => void;

const feedListeners = new Map<string, Set<Listener>>();

export function onFeedComment(feedId: string, listener: Listener): () => void {
  if (!feedListeners.has(feedId)) {
    feedListeners.set(feedId, new Set());
  }
  feedListeners.get(feedId)!.add(listener);

  return () => {
    const listeners = feedListeners.get(feedId);
    listeners?.delete(listener);
    if (listeners?.size === 0) {
      feedListeners.delete(feedId);
    }
  };
}

export function emitFeedComment(feedId: string, data: FeedCommentEvent): void {
  feedListeners.get(feedId)?.forEach((listener) => listener(data));
}

// Global events (for Worker SSE)
export interface GlobalPostEvent {
  type: "post_created";
  id: string;
  feed_id: string;
  feed_name: string;
  content: string | null;
  created_by: string | null;
  author_name: string | null;
  created_at: string;
}

export interface GlobalCommentEvent {
  type: "comment_created";
  id: string;
  post_id: string;
  feed_id: string;
  content: string;
  author_type: "human" | "bot";
  created_by: string | null;
  author_name: string | null;
  created_at: string;
  post_created_by: string | null;
}

export interface GlobalAgentStatusEvent {
  type: "agent_typing" | "agent_idle";
  agent_id: string;
  agent_name: string;
  feed_id: string;
  post_id: string;
}

export interface GlobalAgentOnlineEvent {
  type: "agent_online" | "agent_offline";
  agent_id: string;
  agent_name: string;
}

export type GlobalEvent = GlobalPostEvent | GlobalCommentEvent | GlobalAgentStatusEvent | GlobalAgentOnlineEvent;

type GlobalListener = (data: GlobalEvent) => void;

const globalListeners = new Set<GlobalListener>();

export function onGlobalEvent(listener: GlobalListener): () => void {
  globalListeners.add(listener);
  return () => {
    globalListeners.delete(listener);
  };
}

export function emitGlobalEvent(data: GlobalEvent): void {
  globalListeners.forEach((listener) => listener(data));
}

// Per-feed agent status events
export interface AgentStatusEvent {
  event: "agent_typing" | "agent_idle";
  agent_id: string;
  agent_name: string;
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

// --- Online agent tracking (SSE connection-based) ---

export interface OnlineAgent {
  agent_id: string;
  agent_name: string;
  connected_at: string;
}

// agentId → OnlineAgent (ref-counted by connection count)
const onlineAgents = new Map<string, { data: OnlineAgent; connections: number }>();

type OnlineStatusListener = (data: { type: "agent_online" | "agent_offline"; agent_id: string; agent_name: string }) => void;
const onlineStatusListeners = new Set<OnlineStatusListener>();

export function onOnlineStatusChange(listener: OnlineStatusListener): () => void {
  onlineStatusListeners.add(listener);
  return () => { onlineStatusListeners.delete(listener); };
}

export function registerAgentOnline(agentId: string, agentName: string): () => void {
  const existing = onlineAgents.get(agentId);
  if (existing) {
    existing.connections++;
  } else {
    onlineAgents.set(agentId, {
      data: { agent_id: agentId, agent_name: agentName, connected_at: new Date().toISOString() },
      connections: 1,
    });
    // Notify listeners
    const event = { type: "agent_online" as const, agent_id: agentId, agent_name: agentName };
    onlineStatusListeners.forEach((l) => l(event));
    emitGlobalEvent({ type: "agent_online", agent_id: agentId, agent_name: agentName });
  }

  // Return cleanup function for SSE disconnect
  return () => {
    const entry = onlineAgents.get(agentId);
    if (!entry) return;
    entry.connections--;
    if (entry.connections <= 0) {
      onlineAgents.delete(agentId);
      const event = { type: "agent_offline" as const, agent_id: agentId, agent_name: agentName };
      onlineStatusListeners.forEach((l) => l(event));
      emitGlobalEvent({ type: "agent_offline", agent_id: agentId, agent_name: agentName });
    }
  };
}

export function getOnlineAgents(): OnlineAgent[] {
  return Array.from(onlineAgents.values()).map((e) => e.data);
}
