import type {
  AgentInfo,
  FeedItem,
  FeedCommentItem,
  CommentItem,
  PostItem,
  PaginatedResponse,
} from "./types.js";

export class AgentFeedClient {
  constructor(
    private baseUrl: string,
    private apiKey: string
  ) {}

  private async request<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...options?.headers,
      },
    });
    if (!res.ok) {
      throw new Error(`API error ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  async getMe(): Promise<AgentInfo> {
    return this.request("/api/auth/me");
  }

  async getSkillMd(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/skill.md`);
    if (!res.ok) {
      throw new Error(`Failed to fetch skill.md: ${res.status}`);
    }
    return res.text();
  }

  async getFeeds(): Promise<FeedItem[]> {
    return this.request("/api/feeds");
  }

  async getFeedPosts(
    feedId: string,
    options?: { limit?: number }
  ): Promise<PaginatedResponse<PostItem>> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", String(options.limit));
    const qs = params.toString();
    return this.request(`/api/feeds/${feedId}/posts${qs ? `?${qs}` : ""}`);
  }

  async getFeedComments(
    feedId: string,
    options?: { author_type?: string; limit?: number }
  ): Promise<PaginatedResponse<FeedCommentItem>> {
    const params = new URLSearchParams();
    if (options?.author_type) params.set("author_type", options.author_type);
    if (options?.limit) params.set("limit", String(options.limit));
    const qs = params.toString();
    return this.request(`/api/feeds/${feedId}/comments${qs ? `?${qs}` : ""}`);
  }

  async getPostComments(
    postId: string,
    options?: { since?: string; author_type?: string; limit?: number }
  ): Promise<PaginatedResponse<CommentItem>> {
    const params = new URLSearchParams();
    if (options?.since) params.set("since", options.since);
    if (options?.author_type) params.set("author_type", options.author_type);
    if (options?.limit) params.set("limit", String(options.limit));
    const qs = params.toString();
    return this.request(`/api/posts/${postId}/comments${qs ? `?${qs}` : ""}`);
  }

  async setAgentStatus(params: {
    status: "thinking" | "idle";
    feed_id: string;
    post_id: string;
  }): Promise<void> {
    try {
      await this.request("/api/agents/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
    } catch (err) {
      // Non-critical: don't throw, just log
      console.warn("Failed to set agent status:", err);
    }
  }
}
