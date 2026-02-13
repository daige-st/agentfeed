import { useState, useCallback, useRef } from "react";
import { User, Trash2, Send, Loader2, Copy, Check, Pencil, MessageCircle } from "lucide-react";
import { AgentIcon } from "./AgentChip";
import { MarkdownCompact } from "./Markdown";
import { api } from "../lib/api";
import { autoResize, formatTimeAgo } from "../lib/utils";
import type { CommentItem } from "../lib/api";

export interface CommentNode {
  comment: CommentItem;
  children: CommentNode[];
}

export function buildCommentTree(comments: CommentItem[]): CommentNode[] {
  return comments.map((comment) => ({ comment, children: [] }));
}

export function findNode(nodes: CommentNode[], commentId: string): CommentNode | null {
  for (const node of nodes) {
    if (node.comment.id === commentId) return node;
    const found = findNode(node.children, commentId);
    if (found) return found;
  }
  return null;
}

function getAuthorName(comment: CommentItem): string {
  return comment.author_type === "bot"
    ? comment.author_name ?? "Bot"
    : comment.author_name ?? "Admin";
}

interface FlatItem {
  comment: CommentItem;
  replyToName: string | null;
  branchChildren: CommentNode[] | null;
}

function buildLinearChain(
  node: CommentNode,
  parentComment: CommentItem | null,
  isChild: boolean,
  result: FlatItem[]
): void {
  const replyToName = isChild && parentComment
    ? getAuthorName(parentComment)
    : null;

  if (node.children.length > 1) {
    result.push({ comment: node.comment, replyToName, branchChildren: node.children });
  } else {
    result.push({ comment: node.comment, replyToName, branchChildren: null });
    if (node.children.length === 1) {
      buildLinearChain(node.children[0]!, node.comment, true, result);
    }
  }
}

interface CommentThreadGroupProps {
  node: CommentNode;
  postId: string;
  onCommentCreated: (comment: CommentItem) => void;
  onCommentUpdated: (comment: CommentItem) => void;
  onDelete: (commentId: string) => void;
  onReply?: () => void;
}

export function CommentThreadGroup({ node, postId, onCommentCreated, onCommentUpdated, onDelete, onReply }: CommentThreadGroupProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const items: FlatItem[] = [];
  buildLinearChain(node, null, false, items);

  const handleCopy = useCallback((comment: CommentItem) => {
    navigator.clipboard.writeText(comment.content);
    setCopiedId(comment.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  return (
    <div className="py-3">
      {items.map((item, i) => {
        const isLast = i === items.length - 1 && !item.branchChildren;
        const isEditing = editingId === item.comment.id;
        const isCopied = copiedId === item.comment.id;
        return (
          <div key={item.comment.id}>
            <div className="flex gap-3">
              {/* Avatar + thread line */}
              <div className="flex flex-col items-center shrink-0">
                <Avatar comment={item.comment} />
                {!isLast && (
                  <div className="w-0.5 flex-1 min-h-2 bg-card-border mt-1" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-gray-900 dark:text-text-primary truncate">
                    {getAuthorName(item.comment)}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-text-tertiary shrink-0">
                    {formatTimeAgo(item.comment.created_at)}
                  </span>
                </div>

                {isEditing ? (
                  <InlineEditForm
                    comment={item.comment}
                    onSaved={(updated) => {
                      onCommentUpdated(updated);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <MarkdownCompact content={item.comment.content} />
                )}

                <div className="flex items-center gap-1 mt-1">
                  {isLast && onReply && (
                    <button
                      type="button"
                      onClick={onReply}
                      className="p-1.5 rounded-lg text-gray-400 dark:text-text-tertiary hover:text-gray-600 dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-interactive-hover transition-colors cursor-pointer"
                    >
                      <MessageCircle size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCopy(item.comment)}
                    className="p-1.5 rounded-lg text-gray-400 dark:text-text-tertiary hover:text-gray-600 dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-interactive-hover transition-colors cursor-pointer"
                  >
                    {isCopied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : item.comment.id)}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      isEditing
                        ? "text-accent bg-accent/10"
                        : "text-gray-400 dark:text-text-tertiary hover:text-gray-600 dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-interactive-hover"
                    }`}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item.comment.id)}
                    className="p-1.5 rounded-lg text-gray-400 dark:text-text-tertiary hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-interactive-hover transition-colors cursor-pointer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Inline Edit Form ---

interface InlineEditFormProps {
  comment: CommentItem;
  onSaved: (comment: CommentItem) => void;
  onCancel: () => void;
}

function InlineEditForm({ comment, onSaved, onCancel }: InlineEditFormProps) {
  const [content, setContent] = useState(comment.content);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSave = useCallback(async () => {
    const text = content.trim();
    if (!text || saving) return;

    setSaving(true);
    try {
      const updated = await api.updateComment(comment.id, { content: text });
      onSaved(updated);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }, [content, saving, comment.id, onSaved]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSave();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [handleSave, onCancel]
  );

  return (
    <div className="flex gap-2 items-end">
      <textarea
        ref={inputRef}
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          autoResize(e.target);
        }}
        onKeyDown={handleKeyDown}
        rows={1}
        autoFocus
        className="flex-1 min-h-9 max-h-40 px-0 py-2 text-sm bg-transparent text-gray-900 dark:text-text-primary focus:outline-none resize-none overflow-hidden"
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={!content.trim() || saving}
        className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        {saving ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Send size={14} />
        )}
      </button>
    </div>
  );
}

// --- Avatar ---

function Avatar({ comment }: { comment: CommentItem }) {
  const bg = comment.author_type === "bot"
    ? "bg-white dark:bg-surface-active border border-card-border"
    : "bg-gray-100 dark:bg-surface-active";

  return (
    <div className={`flex items-center justify-center rounded-full shrink-0 w-9 h-9 ${bg}`}>
      {comment.author_type === "bot" ? (
        <AgentIcon type={comment.agent_type} isActive />
      ) : (
        <User size={18} className="text-gray-400 dark:text-text-tertiary" />
      )}
    </div>
  );
}
