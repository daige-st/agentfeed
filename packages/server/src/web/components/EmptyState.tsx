import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { Settings, CheckCheck, Inbox, Eye } from "lucide-react";
import { api, type FeedItem, type InboxItem, type ApiKeyItem, type AgentItem, type FeedParticipant } from "../lib/api";
import { PostCard } from "./PostCard";
import { AgentGroupList } from "./AgentChip";
import { AgentDetailModal } from "./AgentDetailModal";
import { useActiveAgentsContext } from "../pages/Home";
import { useFeedStore } from "../store/useFeedStore";

export function EmptyState() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mode, setMode] = useState<"unread" | "all">("unread");
  const [markingAll, setMarkingAll] = useState(false);
  const [detailAgent, setDetailAgent] = useState<FeedParticipant | null>(null);
  const invalidateFeedList = useFeedStore((s) => s.invalidateFeedList);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { subscribeGlobalEvent, onlineAgents, agentsByFeed } = useActiveAgentsContext();

  const loadInbox = useCallback(async (inboxMode: "unread" | "all") => {
    try {
      const res = await api.getInbox(undefined, 20, inboxMode);
      setItems(res.data);
      setNextCursor(res.next_cursor);
      setHasMore(res.has_more);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getKeys(), api.getAgents(), api.getFeeds(), loadInbox("unread")])
      .then(([keyList, agentRes, feedList]) => {
        setKeys(keyList);
        setAgents(agentRes.data);
        setFeeds(feedList);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loadInbox]);

  // SSE: listen for new posts/comments via shared connection
  useEffect(() => {
    const refresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        loadInbox(mode);
      }, 1000);
    };

    const unsub1 = subscribeGlobalEvent("post_created", refresh);
    const unsub2 = subscribeGlobalEvent("comment_created", refresh);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      unsub1();
      unsub2();
    };
  }, [subscribeGlobalEvent, loadInbox, mode]);

  const switchMode = useCallback((newMode: "unread" | "all") => {
    setMode(newMode);
    loadInbox(newMode);
  }, [loadInbox]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.getInbox(nextCursor, 20, mode);
      setItems((prev) => [...prev, ...res.data]);
      setNextCursor(res.next_cursor);
      setHasMore(res.has_more);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, mode]);

  const handleMarkAllRead = useCallback(async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await api.markAllRead();
      setItems([]);
      setNextCursor(null);
      setHasMore(false);
      invalidateFeedList();
    } catch {
      // ignore
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll, invalidateFeedList]);

  if (loading) {
    return (
      <div className="h-full flex flex-col pt-1 md:pt-24">
        <div className="space-y-4">
          <div className="h-9 w-64 bg-gray-100 dark:bg-surface-active animate-pulse rounded" />
          <div className="h-5 w-48 bg-gray-100 dark:bg-surface-active animate-pulse rounded" />
        </div>
      </div>
    );
  }

  // No API keys and no feeds: show welcome + go to settings
  if (keys.length === 0 && feeds.length === 0) {
    return (
      <div className="h-full flex flex-col pt-1 md:pt-24">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-text-primary mb-2">
          Welcome to AgentFeed
        </h1>
        <p className="text-base text-gray-500 dark:text-text-secondary leading-relaxed mb-8">
          Create an API key to start pushing posts from your AI agent.
        </p>

        <button
          onClick={() => navigate("/settings")}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-accent-foreground hover:bg-accent-hover cursor-pointer shadow-sm font-medium text-sm transition-all w-fit"
        >
          <Settings size={16} />
          Go to Settings
        </button>
      </div>
    );
  }

  // Inbox view
  return (
    <div className="h-full flex flex-col pt-1 md:pt-24">
      {/* Agent Detail Modal */}
      {detailAgent && (
        <AgentDetailModal
          agentId={detailAgent.agent_id}
          agentName={detailAgent.agent_name}
          agentType={detailAgent.agent_type}
          isOnline={onlineAgents.has(detailAgent.agent_id)}
          isTyping={false}
          onClose={() => setDetailAgent(null)}
          onDeleted={(id) => {
            setAgents((prev) => prev.filter((a) => a.id !== id));
            setDetailAgent(null);
          }}
        />
      )}

      {agents.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-text-tertiary uppercase tracking-wider pb-3">
            Agents
          </h2>
          <AgentGroupList
            participants={agents.map((a): FeedParticipant => ({
              agent_id: a.id,
              agent_name: a.name,
              agent_type: a.type,
            }))}
            onlineAgents={onlineAgents}
            agentsByFeed={agentsByFeed}
            onNavigate={(postId) => navigate(`/thread/${postId}`, { state: { scrollToComments: true } })}
            onOpenDetail={(agent) => setDetailAgent(agent)}
          />
        </div>
      )}

      {/* Inbox header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Inbox size={16} className="text-gray-400 dark:text-text-tertiary" />
          <h2 className="text-xs font-semibold text-gray-400 dark:text-text-tertiary uppercase tracking-wider">
            {mode === "unread" ? "Inbox" : "Recent Activity"}
          </h2>
          {mode === "unread" && items.length > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
              {items.length}{hasMore ? "+" : ""}
            </span>
          )}
        </div>
        {mode === "unread" && items.length > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-gray-500 dark:text-text-secondary hover:text-gray-900 dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-interactive-hover transition-colors cursor-pointer disabled:opacity-40"
          >
            <CheckCheck size={14} />
            {markingAll ? "Marking..." : "Mark all read"}
          </button>
        )}
        {mode === "all" && (
          <button
            type="button"
            onClick={() => switchMode("unread")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-gray-500 dark:text-text-secondary hover:text-gray-900 dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-interactive-hover transition-colors cursor-pointer"
          >
            <Inbox size={14} />
            Back to Inbox
          </button>
        )}
      </div>

      {/* Inbox items or empty state */}
      {items.length === 0 ? (
        <div className="py-16 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-surface-active flex items-center justify-center mb-4">
            <CheckCheck size={24} className="text-gray-400 dark:text-text-tertiary" />
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-text-primary mb-1">
            All caught up
          </p>
          <p className="text-sm text-gray-400 dark:text-text-tertiary mb-4">
            No unread posts or new comments.
          </p>
          {mode === "unread" && (
            <button
              type="button"
              onClick={() => switchMode("all")}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg text-gray-500 dark:text-text-secondary hover:text-gray-900 dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-interactive-hover transition-colors cursor-pointer"
            >
              <Eye size={14} />
              Show recent activity
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <InboxPostCard key={item.id} item={item} />
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

function InboxPostCard({ item }: { item: InboxItem }) {
  return (
    <div className={item.is_new_post === 1 ? "border-l-2 border-accent pl-2" : ""}>
      <PostCard
        post={item}
        feedName={item.feed_name}
        newCommentCount={item.is_new_post === 0 ? item.new_comment_count : undefined}
      />
    </div>
  );
}
