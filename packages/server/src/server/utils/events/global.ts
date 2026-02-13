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
  agent_type?: string | null;
  feed_id: string;
  post_id: string;
}

export interface GlobalAgentOnlineEvent {
  type: "agent_online" | "agent_offline";
  agent_id: string;
  agent_name: string;
}

export interface GlobalSessionDeletedEvent {
  type: "session_deleted";
  agent_id: string;
  agent_name: string;
  session_name: string;
}

export type GlobalEvent = GlobalPostEvent | GlobalCommentEvent | GlobalAgentStatusEvent | GlobalAgentOnlineEvent | GlobalSessionDeletedEvent;

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
