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
  getActiveAgents() {
    return this.request<{ data: ActiveAgent[] }>("/api/agents/active");
  }

  getOnlineAgents() {
    return this.request<{ data: OnlineAgent[] }>("/api/agents/online");
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
}
