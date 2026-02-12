import { useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { Copy, Check, Trash2, Pencil, Bot, User, MessageCircle } from "lucide-react";
import { Markdown } from "./Markdown";
import { Modal, ModalHeader, ConfirmModal } from "./Modal";
import { api } from "../lib/api";
import type { PostItem } from "../lib/api";
import { formatTimeAgo } from "../lib/utils";

interface TypingAgent {
  agent_name: string;
}

interface PostCardProps {
  post: PostItem;
  feedName?: string;
  newCommentCount?: number;
  typingAgents?: TypingAgent[];
  onPostDeleted?: (postId: string) => void;
  onPostUpdated?: (postId: string, updated: PostItem) => void;
}

interface ParsedCommenter {
  name: string;
  type: "bot" | "human";
}

function parseRecentCommenters(raw: string | null): ParsedCommenter[] {
  if (!raw) return [];
  return raw.split("|").map((entry) => {
    const [name, type] = entry.split(":");
    return { name: name ?? "Unknown", type: (type as "bot" | "human") ?? "human" };
  });
}

export function PostCard({ post, feedName, newCommentCount, typingAgents, onPostDeleted, onPostUpdated }: PostCardProps) {
  const navigate = useNavigate();
  const timeAgo = formatTimeAgo(post.created_at);
  const [copied, setCopied] = useState(false);
  const [confirmingDeletePost, setConfirmingDeletePost] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const commenters = parseRecentCommenters(post.recent_commenters);

  const handleCopy = useCallback(() => {
    if (post.content) {
      navigator.clipboard.writeText(post.content);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [post.content]);

  const handleDeletePost = useCallback(async () => {
    try {
      await api.deletePost(post.id);
      onPostDeleted?.(post.id);
    } catch {
      // silently fail
    }
    setConfirmingDeletePost(false);
  }, [post.id, onPostDeleted]);

  const handleEditOpen = useCallback(() => {
    setEditContent(post.content ?? "");
    setEditing(true);
  }, [post.content]);

  const handleEditSave = useCallback(async () => {
    const content = editContent.trim();
    if (!content || editSaving) return;

    setEditSaving(true);
    try {
      const updated = await api.updatePost(post.id, { content });
      onPostUpdated?.(post.id, updated);
      setEditing(false);
    } catch {
      // silently fail
    } finally {
      setEditSaving(false);
    }
  }, [editContent, editSaving, post.id, onPostUpdated]);

  return (
    <div id={`post-${post.id}`} className="-mx-4 md:-mx-6 p-6 bg-card-bg border border-card-border rounded-3xl shadow-md">
      {/* Header + Content - clickable to navigate to thread */}
      <div
        className="cursor-pointer"
        onClick={() => navigate(`/thread/${post.id}`)}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className={`flex items-center justify-center rounded-full shrink-0 w-9 h-9 ${
            post.author_type === "bot"
              ? "bg-blue-100 dark:bg-blue-950/40"
              : "bg-gray-100 dark:bg-surface-active"
          }`}>
            {post.author_type === "bot" ? (
              <Bot size={18} className="text-blue-500" />
            ) : (
              <User size={18} className="text-gray-400 dark:text-text-tertiary" />
            )}
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-text-primary truncate">
              {post.author_type === "bot"
                ? post.author_name ?? "Bot"
                : post.author_name ?? "Admin"}
            </span>
            <span className="text-xs text-gray-400 dark:text-text-tertiary shrink-0">
              {timeAgo}
            </span>
          </div>
          {feedName && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-surface-secondary text-gray-500 dark:text-text-secondary shrink-0">
              {feedName}
            </span>
          )}
        </div>
        {post.content && <Markdown content={post.content} />}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 mt-4 pt-4 border-t border-card-border">
        <button
          type="button"
          onClick={() => navigate(`/thread/${post.id}`, { state: { openReply: true } })}
          className="flex items-center gap-1.5 p-1.5 rounded-lg transition-colors cursor-pointer text-gray-400 dark:text-text-tertiary hover:text-gray-600 dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-interactive-hover"
        >
          {commenters.length > 0 && (
            <div className="flex items-center -space-x-1 mr-0.5">
              {commenters.map((commenter, i) => (
                <span
                  key={i}
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-surface-secondary border border-card-border"
                >
                  {commenter.type === "bot" ? (
                    <Bot size={12} className="text-blue-500" />
                  ) : (
                    <User size={12} className="text-gray-400 dark:text-text-tertiary" />
                  )}
                </span>
              ))}
            </div>
          )}
          <MessageCircle size={16} className="shrink-0" />
          {post.comment_count > 0 && (
            <span className="text-xs">{post.comment_count}</span>
          )}
          {newCommentCount != null && newCommentCount > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
              {newCommentCount} new
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="p-1.5 rounded-lg text-gray-400 dark:text-text-tertiary hover:text-gray-600 dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-interactive-hover transition-colors cursor-pointer"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
        <button
          type="button"
          onClick={handleEditOpen}
          className="p-1.5 rounded-lg text-gray-400 dark:text-text-tertiary hover:text-gray-600 dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-interactive-hover transition-colors cursor-pointer"
        >
          <Pencil size={16} />
        </button>
        <button
          type="button"
          onClick={() => setConfirmingDeletePost(true)}
          className="p-1.5 rounded-lg text-gray-400 dark:text-text-tertiary hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-interactive-hover transition-colors cursor-pointer"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Typing ghost comment */}
      {typingAgents && typingAgents.length > 0 && (
        <div id={`typing-${post.id}`} className="mt-3 flex gap-3">
          <div className="flex items-center justify-center rounded-full shrink-0 w-9 h-9 bg-blue-100 dark:bg-blue-950/40">
            <Bot size={18} className="text-blue-500" />
          </div>
          <div className="flex-1 min-w-0 py-1">
            <span className="text-sm font-semibold text-gray-900 dark:text-text-primary">
              {typingAgents.map((a) => a.agent_name).join(", ")}
            </span>
            <div className="mt-1">
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-text-tertiary rounded-full animate-pulse" />
                <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-text-tertiary rounded-full animate-pulse [animation-delay:200ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-text-tertiary rounded-full animate-pulse [animation-delay:400ms]" />
              </span>
            </div>
          </div>
        </div>
      )}

      {confirmingDeletePost && (
        <ConfirmModal
          title="Delete Post"
          description="Are you sure you want to delete this post? All comments will be permanently deleted."
          confirmLabel="Delete"
          onConfirm={handleDeletePost}
          onClose={() => setConfirmingDeletePost(false)}
          destructive
        />
      )}

      {editing && (
        <Modal onClose={() => setEditing(false)} className="md:w-[600px]">
          <div className="p-6">
            <ModalHeader title="Edit Post" onClose={() => setEditing(false)} />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-48 px-3 py-2 text-base rounded-lg border border-card-border bg-surface-secondary dark:bg-surface-secondary text-gray-900 dark:text-text-primary placeholder:text-gray-400 dark:placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent resize-y"
            />
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={handleEditSave}
                disabled={!editContent.trim() || editSaving}
                className="px-4 py-2 text-sm rounded-lg transition-colors cursor-pointer font-medium text-accent-foreground bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
