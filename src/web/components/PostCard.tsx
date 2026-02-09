import { useState, useCallback, useEffect } from "react";
import { Copy, Check, Trash2, Send, Loader2, User, Bot } from "lucide-react";
import { Markdown, MarkdownCompact } from "./Markdown";
import { api } from "../lib/api";
import type { PostItem, CommentItem } from "../lib/api";

interface PostCardProps {
  post: PostItem;
  feedName?: string;
  onCommentCountChange?: (postId: string, delta: number) => void;
}

export function PostCard({ post, feedName, onCommentCountChange }: PostCardProps) {
  const timeAgo = formatTimeAgo(post.created_at);
  const [copied, setCopied] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comment_count);

  useEffect(() => {
    let cancelled = false;
    api.getComments(post.id).then((res) => {
      if (!cancelled) {
        setComments(res.data);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [post.id]);

  const handleCopy = useCallback(() => {
    const parts: string[] = [];
    if (post.title) parts.push(post.title);
    if (post.content) parts.push(post.content);
    navigator.clipboard.writeText(parts.join("\n\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [post.title, post.content]);

  const handleSubmit = useCallback(async () => {
    const content = newComment.trim();
    if (!content || submitting) return;

    setSubmitting(true);
    try {
      const comment = await api.createComment(post.id, { content });
      setComments((prev) => [...prev, comment]);
      setNewComment("");
      setCommentCount((c) => c + 1);
      onCommentCountChange?.(post.id, 1);
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  }, [newComment, submitting, post.id, onCommentCountChange]);

  const handleDelete = useCallback(
    async (commentId: string) => {
      try {
        await api.deleteComment(commentId);
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        setCommentCount((c) => c - 1);
        onCommentCountChange?.(post.id, -1);
      } catch {
        // silently fail
      }
    },
    [post.id, onCommentCountChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="group -mx-4 md:-mx-6 p-6 bg-card-bg border border-card-border rounded-3xl shadow-md relative">
      {/* Header: date + feed name */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm text-gray-400 dark:text-text-tertiary">
          {timeAgo}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {feedName && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-surface-secondary text-gray-500 dark:text-text-secondary">
              {feedName}
            </span>
          )}
        </div>
      </div>

      {/* Copy button - top right */}
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 dark:text-text-tertiary hover:text-gray-600 dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-interactive-hover transition-colors cursor-pointer"
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>

      {/* Title */}
      {post.title && (
        <h2 className="text-3xl font-bold text-gray-900 dark:text-text-primary mb-3">
          {post.title}
        </h2>
      )}

      {/* Content */}
      {post.content && <Markdown content={post.content} />}

      {/* Comments section */}
      <div className="mt-4 pt-3 border-t border-card-border space-y-3">
        {/* Comment list */}
        {loading ? (
          <div className="flex justify-center py-2">
            <Loader2 size={16} className="animate-spin text-gray-400" />
          </div>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className="group/comment text-sm"
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                {comment.author_type === "bot" ? (
                  <Bot size={12} className="text-blue-500" />
                ) : (
                  <User size={12} className="text-gray-400 dark:text-text-tertiary" />
                )}
                <span className="text-xs text-gray-400 dark:text-text-tertiary">
                  {formatTimeAgo(comment.created_at)}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(comment.id)}
                  className="shrink-0 p-0.5 rounded text-gray-300 dark:text-text-tertiary hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover/comment:opacity-100 transition-opacity cursor-pointer"
                >
                  <Trash2 size={10} />
                </button>
              </div>
              <MarkdownCompact content={comment.content} />
            </div>
          ))
        )}

        {/* Input form */}
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a comment..."
            className="flex-1 h-9 px-3 text-sm rounded-lg border border-card-border bg-surface-secondary dark:bg-surface-secondary text-gray-900 dark:text-text-primary placeholder:text-gray-400 dark:placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!newComment.trim() || submitting}
            className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr + "Z");
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}
