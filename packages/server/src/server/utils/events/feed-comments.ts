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
