import { useState, useEffect, useCallback, useRef } from "react";
import { api, type PostItem, type FeedItem } from "../lib/api";
import { PostCard } from "./PostCard";
import { useFeedStore } from "../store/useFeedStore";

interface FeedViewProps {
  feedId: string;
}

export function FeedView({ feedId }: FeedViewProps) {
  const [feed, setFeed] = useState<FeedItem | null>(null);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const invalidateFeedList = useFeedStore((s) => s.invalidateFeedList);

  useEffect(() => {
    setLoading(true);
    setPosts([]);
    setNextCursor(null);
    setHasMore(false);

    Promise.all([api.getFeed(feedId), api.getPosts(feedId)])
      .then(([feedData, postData]) => {
        setFeed(feedData);
        setPosts(postData.data);
        setNextCursor(postData.next_cursor);
        setHasMore(postData.has_more);
        api.markFeedViewed(feedId).then(() => invalidateFeedList()).catch(() => {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [feedId]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.getPosts(feedId, nextCursor);
      setPosts((prev) => [...prev, ...res.data]);
      setNextCursor(res.next_cursor);
      setHasMore(res.has_more);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  }, [feedId, nextCursor, loadingMore]);

  const handleUpdateName = useCallback(
    async (name: string) => {
      if (!feed) return;
      try {
        const updated = await api.updateFeed(feed.id, { name });
        setFeed(updated);
        invalidateFeedList();
      } catch (err) {
        console.error("Failed to update feed:", err);
      }
    },
    [feed, invalidateFeedList]
  );

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="pt-1 md:pt-24 mb-2">
          <div className="h-9 w-1/2 bg-gray-100 dark:bg-surface-active animate-pulse rounded mb-4" />
        </div>
        <div className="mt-8 space-y-4">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="-mx-4 md:-mx-6 p-6 bg-card-bg border border-card-border rounded-3xl shadow-md animate-pulse"
            >
              <div className="h-3 w-20 bg-gray-100 dark:bg-surface-active rounded mb-3" />
              <div className="h-7 w-2/3 bg-gray-100 dark:bg-surface-active rounded mb-4" />
              <div className="space-y-2">
                <div className="h-4 w-full bg-gray-100 dark:bg-surface-active rounded" />
                <div className="h-4 w-5/6 bg-gray-100 dark:bg-surface-active rounded" />
                <div className="h-4 w-3/4 bg-gray-100 dark:bg-surface-active rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Feed title */}
      {feed && (
        <div className="pt-1 md:pt-24 mb-1">
          <EditableTitle
            value={feed.name}
            onSave={handleUpdateName}
          />
        </div>
      )}

      {/* Posts */}
      {posts.length === 0 ? (
        <div className="py-16">
          <p className="text-sm text-gray-400 dark:text-text-tertiary">
            No posts yet. Push posts via the API.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-3 text-sm text-gray-400 dark:text-text-tertiary hover:text-gray-900 dark:hover:text-text-primary transition-colors cursor-pointer rounded-xl hover:bg-interactive-hover"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- Editable Title (textarea, Daigest style) ---

function EditableTitle({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (textareaRef.current) autoResize(textareaRef.current);
  }, [draft]);

  const handleBlur = () => {
    const trimmed = draft.trim() || "Untitled";
    if (trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
  };

  return (
    <textarea
      ref={textareaRef}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        autoResize(e.target);
      }}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      rows={1}
      className="w-full text-3xl font-bold border-none outline-none bg-transparent px-0 py-0 mb-4 placeholder:text-gray-400 dark:placeholder:text-text-tertiary resize-none overflow-hidden text-gray-900 dark:text-text-primary"
      placeholder="Untitled"
    />
  );
}

function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}
