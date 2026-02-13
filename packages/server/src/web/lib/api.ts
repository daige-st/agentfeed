interface ApiError {
  error: { code: string; message: string };
}

class ApiClient {
  private async request<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const body = (await res.json()) as ApiError;
      throw new Error(body.error?.message ?? "Request failed");
    }

    return res.json() as Promise<T>;
  }

  // Auth
  getAuthStatus() {
    return this.request<{ setupCompleted: boolean }>("/api/auth/status");
  }

  setup(password: string) {
    return this.request<{ ok: boolean }>("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  }

  login(password: string) {
    return this.request<{ ok: boolean }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
  }

  logout() {
    return this.request<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
    });
  }

  // API Keys
  getKeys() {
    return this.request<ApiKeyItem[]>("/api/keys");
  }

  createKey(name: string) {
    return this.request<ApiKeyItem & { key: string }>("/api/keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  deleteKey(id: string) {
    return this.request<{ ok: boolean }>(`/api/keys/${id}`, {
      method: "DELETE",
    });
  }

  // Feeds
  getFeeds() {
    return this.request<FeedItem[]>("/api/feeds");
  }

  getFeed(id: string) {
    return this.request<FeedItem>(`/api/feeds/${id}`);
  }

  createFeed(name: string) {
    return this.request<FeedItem>("/api/feeds", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  updateFeed(id: string, data: { name?: string }) {
    return this.request<FeedItem>(`/api/feeds/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  deleteFeed(id: string) {
    return this.request<{ ok: boolean }>(`/api/feeds/${id}`, {
      method: "DELETE",
    });
  }

  reorderFeeds(order: string[]) {
    return this.request<{ ok: boolean }>("/api/feeds/reorder", {
      method: "PUT",
      body: JSON.stringify({ order }),
    });
  }

  markFeedViewed(feedId: string) {
    return this.request<{ ok: boolean }>(`/api/feeds/${feedId}/view`, {
      method: "POST",
    });
  }

  // Posts
  getPosts(feedId: string, cursor?: string, limit = 10) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return this.request<PostListResponse>(
      `/api/feeds/${feedId}/posts?${params}`
    );
  }

  getPost(id: string) {
    return this.request<PostItem>(`/api/posts/${id}`);
  }

  createPost(
    feedId: string,
    data: { content: string }
  ) {
    return this.request<PostItem>(`/api/feeds/${feedId}/posts`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  updatePost(id: string, data: { content: string }) {
    return this.request<PostItem>(`/api/posts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  deletePost(id: string) {
    return this.request<{ ok: boolean }>(`/api/posts/${id}`, {
      method: "DELETE",
    });
  }

  // Inbox
  getInbox(cursor?: string, limit = 20, mode: "unread" | "all" = "unread") {
    const params = new URLSearchParams({ limit: String(limit), mode });
    if (cursor) params.set("cursor", cursor);
    return this.request<InboxListResponse>(`/api/inbox?${params}`);
  }

  markPostViewed(postId: string) {
    return this.request<{ ok: boolean }>(`/api/posts/${postId}/view`, {
      method: "POST",
    });
  }

  markAllRead() {
    return this.request<{ ok: boolean }>("/api/inbox/mark-all-read", {
      method: "POST",
    });
  }

  // Comments
  getComments(
    postId: string,
    options?: {
      cursor?: string;
      limit?: number;
      since?: string;
      author_type?: "human" | "bot";
    }
  ) {
    const { cursor, limit = 20, since, author_type } = options ?? {};
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    if (since) params.set("since", since);
    if (author_type) params.set("author_type", author_type);
    return this.request<CommentListResponse>(
      `/api/posts/${postId}/comments?${params}`
    );
  }

  createComment(postId: string, data: { content: string }) {
    return this.request<CommentItem>(`/api/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  updateComment(id: string, data: { content: string }) {
    return this.request<CommentItem>(`/api/comments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  deleteComment(id: string) {
    return this.request<{ ok: boolean }>(`/api/comments/${id}`, {
      method: "DELETE",
    });
  }

  // Feed participants
  getFeedParticipants(feedId: string) {
    return this.request<{ data: FeedParticipant[] }>(
      `/api/feeds/${feedId}/participants`
    );
  }

  // Agents
  getAgents() {
    return this.request<{ data: AgentItem[] }>("/api/agents");
  }

  deleteAgent(id: string) {
    return this.request<{ ok: boolean }>(`/api/agents/${id}`, {
      method: "DELETE",
    });
  }

  getActiveAgents() {
    return this.request<{ data: ActiveAgent[] }>("/api/agents/active");
  }

  getOnlineAgents() {
    return this.request<{ data: OnlineAgent[] }>("/api/agents/online");
  }

  getAgent(id: string) {
    return this.request<AgentDetail>(`/api/agents/${id}`);
  }

  updateAgentPermissions(id: string, permissions: AgentPermissions) {
    return this.request<{ ok: boolean }>(`/api/agents/${id}/permissions`, {
      method: "PUT",
      body: JSON.stringify(permissions),
    });
  }

  // Agent Sessions
  getAgentSessions() {
    return this.request<{ data: AgentSessionItem[] }>("/api/agents/sessions");
  }

  deleteAgentSession(agentId: string, sessionName: string) {
    return this.request<{ ok: boolean }>(
      `/api/agents/sessions/${encodeURIComponent(sessionName)}?agent_id=${encodeURIComponent(agentId)}`,
      { method: "DELETE" }
    );
  }

  clearAgentSessions(agentId: string) {
    return this.request<{ ok: boolean; deleted: number }>(
      `/api/agents/${agentId}/sessions`,
      { method: "DELETE" }
    );
  }

  // Uploads
  async uploadFile(file: File): Promise<UploadResult> {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/uploads", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const body = (await res.json()) as ApiError;
      throw new Error(body.error?.message ?? "Upload failed");
    }

    return res.json() as Promise<UploadResult>;
  }
}

export const api = new ApiClient();

// Types
export interface ApiKeyItem {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
}

export interface FeedItem {
  id: string;
  name: string;
  position: number;
  has_updates: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface PostItem {
  id: string;
  feed_id: string;
  content: string | null;
  author_type: "human" | "bot";
  created_by: string | null;
  author_name: string | null;
  comment_count: number;
  recent_commenters: string | null;
  created_at: string;
}

export interface ListResponse<T> {
  data: T[];
  next_cursor: string | null;
  has_more: boolean;
}

export type PostListResponse = ListResponse<PostItem>;

export interface InboxItem extends PostItem {
  feed_name: string;
  new_comment_count: number;
  is_new_post: 0 | 1;
  latest_activity: string;
}

export type InboxListResponse = ListResponse<InboxItem>;

export interface CommentItem {
  id: string;
  post_id: string;
  content: string;
  author_type: "human" | "bot";
  created_by: string | null;
  author_name: string | null;
  created_at: string;
}

export type CommentListResponse = ListResponse<CommentItem>;

export interface ActiveAgent {
  event: "agent_typing" | "agent_idle";
  agent_id: string;
  agent_name: string;
  feed_id: string;
  post_id: string;
}

export interface OnlineAgent {
  agent_id: string;
  agent_name: string;
  connected_at: string;
}

export interface FeedParticipant {
  agent_id: string;
  agent_name: string;
  agent_type: string | null;
}

export interface AgentItem {
  id: string;
  name: string;
  api_key_id: string;
  parent_name: string | null;
  type: string | null;
  key_name: string;
  created_at: string;
}

export interface AgentDetail extends AgentItem {
  permission_mode: string;
  allowed_tools: string[];
  last_active_at: string | null;
  cwd: string | null;
}

export interface AgentPermissions {
  permission_mode: string;
  allowed_tools: string;
}

export interface AgentSessionItem {
  agent_id: string;
  agent_name: string;
  session_name: string;
  claude_session_id: string | null;
  created_at: string;
  last_used_at: string;
}

export interface UploadResult {
  id: string;
  filename: string;
  url: string;
  mime_type: string;
  size: number;
}
