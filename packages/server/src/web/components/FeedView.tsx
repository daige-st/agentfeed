import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { Send, Loader2, Paperclip } from "lucide-react";
import { api, type PostItem, type FeedItem, type FeedParticipant, type AgentItem } from "../lib/api";
import { autoResize } from "../lib/utils";
import { PostCard } from "./PostCard";
import { AgentGroupList } from "./AgentChip";
import { AgentDetailModal } from "./AgentDetailModal";
import { ContentEditor, type ContentEditorHandle } from "./ContentEditor";
import { useFeedStore } from "../store/useFeedStore";
import { useFeedSSE } from "../hooks/useFeedSSE";
import { useActiveAgentsContext } from "../pages/Home";


interface FeedViewProps {
  feedId: string;
}

function scrollToAndHighlight(postId: string) {
  requestAnimationFrame(() => {
    const typingEl = document.getElementById(`typing-${postId}`);
    const postEl = document.getElementById(`post-${postId}`);
    const scrollTarget = typingEl ?? postEl;
    if (scrollTarget) {
      scrollTarget.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (postEl) {
      postEl.classList.add("ring-2", "ring-accent", "ring-offset-2", "dark:ring-offset-surface");
      setTimeout(() => {
        postEl.classList.remove("ring-2", "ring-accent", "ring-offset-2", "dark:ring-offset-surface");
      }, 2000);
    }
  });
}

export function FeedView({ feedId }: FeedViewProps) {
  const [feed, setFeed] = useState<FeedItem | null>(null);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [participants, setParticipants] = useState<FeedParticipant[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailAgent, setDetailAgent] = useState<FeedParticipant | null>(null);
  const invalidateFeedList = useFeedStore((s) => s.invalidateFeedList);
  const scrollToPostId = useFeedStore((s) => s.scrollToPostId);
  const clearScrollToPostId = useFeedStore((s) => s.clearScrollToPostId);
  const { subscribeAllComments } = useFeedSSE(feedId);
  const { onlineAgents, agentsByFeed } = useActiveAgentsContext();
  const navigate = useNavigate();

  // Subscribe to all comments via SSE to update comment counts in real-time
  useEffect(() => {
    return subscribeAllComments((comment) => {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === comment.post_id
            ? { ...p, comment_count: p.comment_count + 1 }
            : p
        )
      );
    });
  }, [subscribeAllComments]);

  useEffect(() => {
    setLoading(true);
    setPosts([]);
    setParticipants([]);
    setNextCursor(null);
    setHasMore(false);

    Promise.all([api.getFeed(feedId), api.getPosts(feedId), api.getAgents()])
      .then(([feedData, postData, agentData]) => {
        setFeed(feedData);
        setPosts(postData.data);
        setParticipants(agentData.data.map((a: AgentItem): FeedParticipant => ({
          agent_id: a.id,
          agent_name: a.name,
          agent_type: a.type,
        })));
        setNextCursor(postData.next_cursor);
        setHasMore(postData.has_more);
        api.markFeedViewed(feedId).then(() => invalidateFeedList()).catch(() => {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [feedId]);

  // Handle scrollToPostId from store (e.g. navigating from Home agent list)
  useEffect(() => {
    if (!scrollToPostId || loading) return;
    clearScrollToPostId();
    scrollToAndHighlight(scrollToPostId);
  }, [scrollToPostId, loading, clearScrollToPostId]);

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
      {/* Agent Detail Modal */}
      {detailAgent && (
        <AgentDetailModal
          agentId={detailAgent.agent_id}
          agentName={detailAgent.agent_name}
          agentType={detailAgent.agent_type}
          isOnline={onlineAgents.has(detailAgent.agent_id)}
          isTyping={!!agentsByFeed.get(feedId)?.get(detailAgent.agent_id)}
          onClose={() => setDetailAgent(null)}
          onDeleted={(id) => {
            setParticipants((prev) => prev.filter((p) => p.agent_id !== id));
            setDetailAgent(null);
          }}
        />
      )}

      {/* Feed title */}
      {feed && (
        <div className="pt-1 md:pt-24 mb-1 px-2 md:px-0">
          <EditableTitle
            value={feed.name}
            onSave={handleUpdateName}
          />
          {participants.length > 0 && (
            <AgentGroupList
              participants={participants}
              feedId={feedId}
              onlineAgents={onlineAgents}
              agentsByFeed={agentsByFeed}
              onNavigate={(postId) => navigate(`/thread/${postId}`, { state: { scrollToComments: true } })}
              onOpenDetail={(agent) => setDetailAgent(agent)}
            />
          )}
        </div>
      )}

      {/* New Post Form */}
      {feed && (
        <NewPostForm
          feedId={feed.id}
          onCreated={(post) => setPosts((prev) => [post, ...prev])}
        />
      )}

      {/* Posts */}
      {posts.length === 0 ? (
        <div className="py-16">
          <p className="text-sm text-gray-400 dark:text-text-tertiary">
            No posts yet.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onPostDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
                onPostUpdated={(id, updated) => setPosts((prev) => prev.map((p) => p.id === id ? updated : p))}
              />
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

// --- New Post Form ---

function NewPostForm({
  feedId,
  onCreated,
}: {
  feedId: string;
  onCreated: (post: PostItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const editorRef = useRef<ContentEditorHandle>(null);

  const handleSubmit = useCallback(async () => {
    const c = content.trim();
    if (!c || submitting) return;

    setSubmitting(true);
    try {
      const post = await api.createPost(feedId, { content: c });
      onCreated(post);
      setContent("");
      setExpanded(false);
    } catch (err) {
      console.error("Failed to create post:", err);
    } finally {
      setSubmitting(false);
    }
  }, [feedId, content, submitting, onCreated]);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setExpanded(true);
          setTimeout(() => editorRef.current?.focus(), 0);
        }}
        className="w-full -mx-4 md:-mx-6 px-6 py-4 text-left text-sm text-gray-400 dark:text-text-tertiary border border-dashed border-card-border rounded-3xl hover:border-accent hover:text-gray-600 dark:hover:text-text-secondary transition-colors cursor-pointer"
      >
        Write a new post...
      </button>
    );
  }

  return (
    <ContentEditor
      ref={editorRef}
      value={content}
      onChange={setContent}
      onSubmit={handleSubmit}
      placeholder="What do you want to say? (@ to mention)"
      rows={3}
      mentionPopupClassName="left-6 right-6"
      className="-mx-4 md:-mx-6 p-6 border border-card-border rounded-3xl bg-card-bg shadow-md"
    >
      {({ uploading, openFilePicker }) => (
        <div className="flex justify-between items-center mt-3">
          <button
            type="button"
            onClick={openFilePicker}
            disabled={uploading}
            className="p-2 rounded-lg text-gray-400 dark:text-text-tertiary hover:text-gray-600 dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-interactive-hover transition-colors cursor-pointer disabled:opacity-40"
            title="Attach file"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                setContent("");
              }}
              className="px-3 h-8 text-sm rounded-lg text-gray-500 dark:text-text-secondary hover:bg-gray-100 dark:hover:bg-interactive-hover transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!content.trim() || submitting || uploading}
              className="flex items-center gap-1.5 px-3 h-8 text-sm rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {submitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              Post
              <kbd className="hidden sm:inline ml-1 text-[10px] opacity-60">
                {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}↵
              </kbd>
            </button>
          </div>
        </div>
      )}
    </ContentEditor>
  );
}
