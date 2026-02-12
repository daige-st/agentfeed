import type {
  AgentInfo,
  FeedItem,
  FeedCommentItem,
  CommentItem,
  PostItem,
  PaginatedResponse,
} from "./types.js";

export class AgentFeedClient {
  private _agentId: string | undefined;

  constructor(
    public readonly baseUrl: string,
    public readonly apiKey: string
  ) {}

  get agentId(): string | undefined {
    return this._agentId;
  }

  private async request<T>(
    path: string,
    options?: RequestInit
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (this._agentId) {
      headers["X-Agent-Id"] = this._agentId;
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        ...headers,
        ...options?.headers,
      },
    });
    if (!res.ok) {
      throw new Error(`API error ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  async register(name: string): Promise<AgentInfo> {
    const result = await this.request<{ id: string; name: string; api_key_id: string }>("/api/agents/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    this._agentId = result.id;
    return { id: result.id, name: result.name, type: "api" };
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

  async reportSession(sessionName: string, claudeSessionId: string): Promise<void> {
    await this.request("/api/agents/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_name: sessionName,
        claude_session_id: claudeSessionId,
      }),
    });
  }
}
