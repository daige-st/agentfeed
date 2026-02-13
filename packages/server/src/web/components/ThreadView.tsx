import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Bot, User, MessageCircle, Copy, Check, Pencil, Trash2, Send, Loader2, Paperclip } from "lucide-react";
import { AgentGroupList } from "./AgentChip";
import { useNavigate, useLocation } from "react-router";
import { Markdown } from "./Markdown";
import { CommentThreadGroup, buildCommentTree } from "./CommentThread";
import { MentionPopup } from "./MentionPopup";
import { Modal, ModalHeader, ConfirmModal } from "./Modal";
import { api } from "../lib/api";
import type { PostItem, CommentItem, FeedItem, FeedParticipant } from "../lib/api";
import { autoResize, formatTimeAgo } from "../lib/utils";
import { useMention } from "../hooks/useMention";
import { useFileUpload } from "../hooks/useFileUpload";
import { FilePreviewStrip } from "./FilePreview";
import { useFeedSSE } from "../hooks/useFeedSSE";
import { useFeedStore } from "../store/useFeedStore";
import { useActiveAgentsContext } from "../pages/Home";

interface ThreadViewProps {
  postId: string;
}

export function ThreadView({ postId }: ThreadViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { openReply?: boolean; scrollToComments?: boolean } | null;
  const openReply = locationState?.openReply ?? false;
  const scrollToComments = locationState?.scrollToComments ?? false;
  const [post, setPost] = useState<PostItem | null>(null);
  const [feed, setFeed] = useState<FeedItem | null>(null);
  const [participants, setParticipants] = useState<FeedParticipant[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReplyForm, setShowReplyForm] = useState(openReply);
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const invalidateFeedList = useFeedStore((s) => s.invalidateFeedList);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getPost(postId),
      api.getComments(postId, { limit: 100 }),
    ])
      .then(async ([postData, commentData]) => {
        setPost(postData);
        setComments(commentData.data);
        // Load feed info and participants
        const [feedData, participantData] = await Promise.all([
          api.getFeed(postData.feed_id),
          api.getFeedParticipants(postData.feed_id),
        ]);
        setFeed(feedData);
        setParticipants(participantData.data);
        // Mark post as viewed for inbox tracking
        api.markPostViewed(postId).catch(() => {});
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [postId]);

  // Scroll to comments area after DOM renders
  useEffect(() => {
    if (!scrollToComments || loading) return;
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [scrollToComments, loading]);

  const feedId = post?.feed_id ?? null;
  const { subscribeComments } = useFeedSSE(feedId);
  const { onlineAgents, agentsByFeed } = useActiveAgentsContext();

  // Derive typing agents from global context (reliable, no SSE timing issues)
  const feedAgents = feedId ? agentsByFeed.get(feedId) : undefined;
  const typingAgents = feedAgents
    ? [...feedAgents.values()].filter((a) => a.post_id === postId)
    : [];

  useEffect(() => {
    return subscribeComments(postId, (comment) => {
      setComments((prev) => {
        if (prev.some((c) => c.id === comment.id)) return prev;
        return [...prev, comment];
      });
    });
  }, [postId, subscribeComments]);

  const handleCommentCreated = useCallback((comment: CommentItem) => {
    setComments((prev) => {
      if (prev.some((c) => c.id === comment.id)) return prev;
      return [...prev, comment];
    });
  }, []);

  const handleCommentUpdated = useCallback((comment: CommentItem) => {
    setComments((prev) => prev.map((c) => (c.id === comment.id ? comment : c)));
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await api.deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // silently fail
    }
  }, []);

  const handleCopy = useCallback(() => {
    if (post?.content) {
      navigator.clipboard.writeText(post.content);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [post?.content]);

  const handleDeletePost = useCallback(async () => {
    try {
      await api.deletePost(postId);
      if (feedId) {
        navigate(`/?feed=${feedId}`);
      } else {
        navigate("/");
      }
    } catch {
      // silently fail
    }
    setConfirmingDelete(false);
  }, [postId, feedId, navigate]);

  const handleEditOpen = useCallback(() => {
    setEditContent(post?.content ?? "");
    setEditing(true);
  }, [post?.content]);

  const handleUpdateFeedName = useCallback(
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

  const handleEditSave = useCallback(async () => {
    const content = editContent.trim();
    if (!content || editSaving) return;

    setEditSaving(true);
    try {
      const updated = await api.updatePost(postId, { content });
      setPost(updated);
      setEditing(false);
    } catch {
      // silently fail
    } finally {
      setEditSaving(false);
    }
  }, [editContent, editSaving, postId]);

  if (loading) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 md:px-6 pb-24 pt-6 md:pt-24">
        <div className="h-9 w-20 bg-gray-100 dark:bg-surface-active animate-pulse rounded mb-4" />
        <div className="-mx-4 md:-mx-6 p-6 bg-card-bg border border-card-border rounded-3xl shadow-md animate-pulse">
          <div className="h-3 w-20 bg-gray-100 dark:bg-surface-active rounded mb-3" />
          <div className="space-y-2">
            <div className="h-4 w-full bg-gray-100 dark:bg-surface-active rounded" />
            <div className="h-4 w-5/6 bg-gray-100 dark:bg-surface-active rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="w-full max-w-3xl mx-auto px-4 md:px-6 pb-24 pt-6 md:pt-24">
        <BackButton feedId={feedId} />
        <p className="text-sm text-gray-400 dark:text-text-tertiary">Post not found.</p>
      </div>
    );
  }

  const threadGroups = buildCommentTree(comments);

  return (
    <div className="w-full max-w-3xl mx-auto px-4 md:px-6 pb-24 pt-6 md:pt-24">
      {/* Feed name + agent list */}
      {feed && (
        <div className="mb-6">
          <EditableFeedName value={feed.name} onSave={handleUpdateFeedName} />
          {participants.length > 0 && (
            <AgentGroupList
              participants={participants}
              feedId={feedId!}
              onlineAgents={onlineAgents}
              agentsByFeed={agentsByFeed}
              onNavigate={() => {}}
              onDelete={async (agentId) => {
                try {
                  await api.deleteAgent(agentId);
                  setParticipants((prev) => prev.filter((p) => p.agent_id !== agentId));
                } catch (err) {
                  console.error("Failed to delete agent:", err);
                }
              }}
            />
          )}
        </div>
      )}

      <BackButton feedId={feedId} />

      <div className="-mx-4 md:-mx-6 p-6 bg-card-bg border border-card-border rounded-3xl shadow-md">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-gray-400 dark:text-text-tertiary">
            {formatTimeAgo(post.created_at)}
          </span>
        </div>
        {post.content && <Markdown content={post.content} />}

        {/* Comments */}
        <div className="mt-4 pt-4 border-t border-card-border">
          {/* Action buttons */}
          <div className="flex items-center gap-1 mb-3">
            <button
              type="button"
              onClick={() => setShowReplyForm((v) => !v)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                showReplyForm
                  ? "text-accent bg-accent/10"
                  : "text-gray-400 dark:text-text-tertiary hover:text-gray-600 dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-interactive-hover"
              }`}
            >
              <MessageCircle size={16} />
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
              onClick={() => setConfirmingDelete(true)}
              className="p-1.5 rounded-lg text-gray-400 dark:text-text-tertiary hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-interactive-hover transition-colors cursor-pointer"
            >
              <Trash2 size={16} />
            </button>
          </div>

          <div className="divide-y divide-card-border">
            {threadGroups.map((node, i) => (
              <CommentThreadGroup
                key={node.comment.id}
                node={node}
                postId={postId}
                onCommentCreated={handleCommentCreated}
                onCommentUpdated={handleCommentUpdated}
                onDelete={handleDelete}
                onReply={i === threadGroups.length - 1 ? () => setShowReplyForm(true) : undefined}
              />
            ))}
            {/* Typing ghost comment */}
            {typingAgents.length > 0 && (
              <div className="py-3">
                <div className="flex gap-3">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="flex items-center justify-center rounded-full shrink-0 w-9 h-9 bg-blue-100 dark:bg-blue-950/40">
                      <Bot size={18} className="text-blue-500" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 pb-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-gray-900 dark:text-text-primary">
                        {typingAgents.map((a) => a.agent_name).join(", ")}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-text-tertiary rounded-full animate-pulse" />
                      <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-text-tertiary rounded-full animate-pulse [animation-delay:200ms]" />
                      <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-text-tertiary rounded-full animate-pulse [animation-delay:400ms]" />
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={commentsEndRef} />
          </div>

          {/* Reply form at the bottom */}
          {showReplyForm && (
            <TopLevelReplyForm
              postId={postId}
              onCreated={(comment) => {
                handleCommentCreated(comment);
                setShowReplyForm(false);
              }}
              onCancel={() => setShowReplyForm(false)}
            />
          )}

        </div>
      </div>

      {confirmingDelete && (
        <ConfirmModal
          title="Delete Post"
          description="Are you sure you want to delete this post? All comments will be permanently deleted."
          confirmLabel="Delete"
          onConfirm={handleDeletePost}
          onClose={() => setConfirmingDelete(false)}
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

// --- Top-level reply form ---

interface TopLevelReplyFormProps {
  postId: string;
  onCreated: (comment: CommentItem) => void;
  onCancel: () => void;
}

function TopLevelReplyForm({ postId, onCreated, onCancel }: TopLevelReplyFormProps) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    mentionQuery,
    mentionIndex,
    filteredMentions,
    detectMention,
    handleMentionSelect,
    handleMentionKeyDown,
  } = useMention({
    textareaRef: inputRef,
    value: content,
    onChange: setContent,
  });

  const {
    uploading,
    uploadedFiles,
    removeFile,
    fileInputRef,
    handleFileSelect,
    handlePaste,
    handleDragOver,
    handleDrop,
    openFilePicker,
  } = useFileUpload({
    textareaRef: inputRef,
    value: content,
    onChange: setContent,
  });

  const handleSubmit = useCallback(async () => {
    const text = content.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    try {
      const comment = await api.createComment(postId, { content: text });
      setContent("");
      onCreated(comment);
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  }, [content, submitting, postId, onCreated]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value);
      autoResize(e.target);
      detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
    },
    [detectMention]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      handleMentionKeyDown(e);
    },
    [handleSubmit, handleMentionKeyDown, onCancel]
  );

  return (
    <div className="mt-3 mb-4 relative" onDragOver={handleDragOver} onDrop={handleDrop}>
      <MentionPopup
        mentionQuery={mentionQuery}
        filteredMentions={filteredMentions}
        mentionIndex={mentionIndex}
        onSelect={handleMentionSelect}
      />
      <div className="flex gap-2 items-end">
        <div className="flex items-center justify-center rounded-full shrink-0 w-9 h-9 bg-gray-100 dark:bg-surface-active">
          <User size={18} className="text-gray-400 dark:text-text-tertiary" />
        </div>
        <div className="flex-1 min-w-0">
          <textarea
            ref={inputRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="댓글 남기기..."
            rows={1}
            autoFocus
            className="w-full min-h-9 max-h-40 px-0 py-2 text-sm bg-transparent text-gray-900 dark:text-text-primary placeholder:text-gray-400 dark:placeholder:text-text-tertiary focus:outline-none resize-none overflow-hidden"
          />
          <FilePreviewStrip files={uploadedFiles} onRemove={removeFile} />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          type="button"
          onClick={openFilePicker}
          disabled={uploading}
          className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 dark:text-text-tertiary hover:text-gray-600 dark:hover:text-text-primary hover:bg-gray-100 dark:hover:bg-interactive-hover transition-colors cursor-pointer disabled:opacity-40"
          title="Attach file"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!content.trim() || submitting || uploading}
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
  );
}

function EditableFeedName({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleBlur = () => {
    const trimmed = draft.trim() || "Untitled";
    if (trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      className="w-full text-lg font-bold border-none outline-none bg-transparent px-0 py-0 mb-2 placeholder:text-gray-400 dark:placeholder:text-text-tertiary text-gray-900 dark:text-text-primary"
      placeholder="Untitled"
    />
  );
}

function BackButton({ feedId }: { feedId?: string | null }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        if (feedId) {
          navigate(`/?feed=${feedId}`);
        } else {
          navigate("/");
        }
      }}
      className="flex items-center gap-1 text-sm text-gray-400 dark:text-text-tertiary hover:text-gray-600 dark:hover:text-text-secondary transition-colors cursor-pointer mb-4"
    >
      <ArrowLeft size={16} />
      Back
    </button>
  );
}
