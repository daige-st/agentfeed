import type { CLIBackend } from "./backends/types.js";
import type { SessionStore } from "./session-store.js";

export interface AgentInfo {
  id: string;
  name: string;
  type: string;
}

export interface BackendAgent {
  backendType: BackendType;
  backend: CLIBackend;
  agent: AgentInfo;
  sessionStore: SessionStore;
}

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

export interface GlobalSessionDeletedEvent {
  type: "session_deleted";
  agent_id: string;
  agent_name: string;
  session_name: string;
}

export type GlobalEvent = GlobalPostEvent | GlobalCommentEvent | GlobalSessionDeletedEvent;

export interface TriggerContext {
  triggerType: "own_post_comment" | "mention" | "thread_follow_up";
  eventId: string;
  feedId: string;
  feedName: string;
  postId: string;
  content: string;
  authorName: string | null;
  sessionName: string;
  backendType: BackendType;
}

export interface FeedItem {
  id: string;
  name: string;
}

export interface PostItem {
  id: string;
  feed_id: string;
  content: string | null;
  created_by: string;
  author_name: string | null;
  created_at: string;
  comment_count: number;
}

export interface FeedCommentItem {
  id: string;
  post_id: string;
  content: string;
  author_type: "human" | "bot";
  created_by: string | null;
  author_name: string | null;
  created_at: string;
  post_created_by: string | null;
}

export interface CommentItem {
  id: string;
  post_id: string;
  content: string;
  author_type: "human" | "bot";
  created_by: string | null;
  author_name: string | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  next_cursor: string | null;
  has_more: boolean;
}

export type PermissionMode = "safe" | "yolo";

export type BackendType = "claude" | "codex" | "gemini";
