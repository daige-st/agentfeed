import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Settings, Bot } from "lucide-react";
import { api, type FeedItem, type PostItem, type ApiKeyItem } from "../lib/api";
import { PostCard } from "./PostCard";
import { useActiveAgentsContext } from "../pages/Home";
import { useFeedStore } from "../store/useFeedStore";

function AgentList({ keys }: { keys: ApiKeyItem[] }) {
  const { agentsByFeed, getAllActiveAgentIds } = useActiveAgentsContext();
  const selectFeedAndScrollToPost = useFeedStore((s) => s.selectFeedAndScrollToPost);
  const activeIds = getAllActiveAgentIds();

  // Build a map: agentId → { feedId, postId } (for navigation)
  const agentFeedMap = new Map<string, { feedId: string; postId: string }>();
  for (const [feedId, agents] of agentsByFeed) {
    for (const [agentId, agent] of agents) {
      agentFeedMap.set(agentId, { feedId, postId: agent.post_id });
    }
  }

  if (keys.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-xs font-semibold text-gray-400 dark:text-text-tertiary uppercase tracking-wider pb-3">
        Agents
      </h2>
      <div className="flex flex-wrap gap-2">
        {keys.map((key) => {
          const isActive = activeIds.has(key.id);
          const activeInfo = agentFeedMap.get(key.id);

          return (
            <button
              key={key.id}
              type="button"
              onClick={() => {
                if (activeInfo) {
                  selectFeedAndScrollToPost(activeInfo.feedId, activeInfo.postId);
                }
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                isActive
                  ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 text-gray-900 dark:text-text-primary cursor-pointer hover:bg-green-100 dark:hover:bg-green-950/50"
                  : "border-gray-200 dark:border-border-default bg-white dark:bg-surface-active text-gray-400 dark:text-text-tertiary opacity-50 cursor-default"
              }`}
            >
              <div className="relative">
                <Bot size={16} className={isActive ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-text-tertiary"} />
                {isActive && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                )}
              </div>
              <span className="text-sm font-medium">{key.name}</span>
              {isActive && (
                <span className="text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/50 px-1.5 py-0.5 rounded-full">
                  Active
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EmptyState() {
  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [recentPosts, setRecentPosts] = useState<PostItem[]>([]);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [feedList, keyList] = await Promise.all([
        api.getFeeds(),
        api.getKeys(),
      ]);
      setFeeds(feedList);
      setKeys(keyList);

      const allPosts: PostItem[] = [];
      for (const feed of feedList.slice(0, 10)) {
        try {
          const { data } = await api.getPosts(feed.id, undefined, 5);
          allPosts.push(...data);
        } catch {
          // skip
        }
      }

      allPosts.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setRecentPosts(allPosts.slice(0, 20));
    } catch {
      // If unauthorized
    } finally {
      setLoading(false);
    }
  };

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

  // No API keys: show welcome + go to settings
  if (keys.length === 0 && recentPosts.length === 0) {
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

  // Has keys but no posts
  if (recentPosts.length === 0) {
    return (
      <div className="h-full flex flex-col pt-1 md:pt-24">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-text-primary mb-2">
          AgentFeed
        </h1>
        <p className="text-base text-gray-500 dark:text-text-secondary leading-relaxed mb-8">
          Create a feed and start pushing posts via the API.
        </p>
        <AgentList keys={keys} />
      </div>
    );
  }

  // Has recent posts
  return (
    <div className="h-full flex flex-col pt-1 md:pt-24">
      <AgentList keys={keys} />
      <h2 className="text-xs font-semibold text-gray-400 dark:text-text-tertiary uppercase tracking-wider pb-4">
        Recent Posts
      </h2>
      <div className="space-y-4">
        {recentPosts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
          />
        ))}
      </div>
    </div>
  );
}
