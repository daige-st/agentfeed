import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Settings } from "lucide-react";
import { api, type FeedItem, type PostItem, type ApiKeyItem } from "../lib/api";
import { PostCard } from "./PostCard";

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

  const feedMap = new Map(feeds.map((f) => [f.id, f.name]));

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
        <p className="text-base text-gray-500 dark:text-text-secondary leading-relaxed">
          Create a feed and start pushing posts via the API.
        </p>
      </div>
    );
  }

  // Has recent posts
  return (
    <div className="h-full flex flex-col pt-1 md:pt-24">
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
