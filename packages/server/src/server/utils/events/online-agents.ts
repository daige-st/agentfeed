import { emitGlobalEvent } from "./global.ts";

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
