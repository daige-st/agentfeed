import type { FeedCommentItem, TriggerContext, BackendAgent } from "./types.js";
import type { AgentFeedClient } from "./api-client.js";
import type { FollowStore } from "./follow-store.js";
import type { PostSessionStore } from "./post-session-store.js";
import { parseMention, isBotAuthor } from "./utils.js";

export async function scanUnprocessed(
  client: AgentFeedClient,
  backendAgents: BackendAgent[],
  followStore?: FollowStore,
  postSessionStore?: PostSessionStore,
  ownAgentIds?: Set<string>
): Promise<TriggerContext[]> {
  const triggers: TriggerContext[] = [];
  const feeds = await client.getFeeds();
  const processedPostIds = new Set<string>();
  const isOwnAgent = (id: string | null) =>
    id !== null && (ownAgentIds ? ownAgentIds.has(id) : false);
  const defaultBackendType = backendAgents[0]?.backendType ?? "claude";

  for (const feed of feeds) {
    // --- Scan comments (existing logic) ---
    const comments = await client.getFeedComments(feed.id, {
      author_type: "human",
      limit: 50,
    });

    // Group comments by post to find the last human comment per post
    const byPost = new Map<string, FeedCommentItem[]>();
    for (const comment of comments.data) {
      const list = byPost.get(comment.post_id) ?? [];
      list.push(comment);
      byPost.set(comment.post_id, list);
    }

    for (const [postId, postComments] of byPost) {
      // Determine the best trigger type for this post
      let bestTriggerType: TriggerContext["triggerType"] | null = null;
      let bestComment: FeedCommentItem | null = null;
      let bestSessionName = "default";
      let bestBackendType = defaultBackendType;

      for (const comment of postComments) {
        // Check for @mentions across all backend agents (highest priority)
        for (const ba of backendAgents) {
          const mention = parseMention(comment.content, ba.agent.name);
          if (mention.mentioned) {
            bestTriggerType = "mention";
            bestComment = comment;
            bestSessionName = mention.sessionName;
            bestBackendType = ba.backendType;
          }
        }

        // Check if this is on an agent-owned post
        if (!bestTriggerType && isOwnAgent(comment.post_created_by)) {
          const postSession = postSessionStore?.getWithType(postId);
          bestTriggerType = "own_post_comment";
          bestComment = comment;
          bestSessionName = postSession?.sessionName ?? "default";
          bestBackendType = postSession?.backendType ?? defaultBackendType;
        }
      }

      // Check if this is in a followed thread
      if (!bestTriggerType && followStore?.has(postId)) {
        const postSession = postSessionStore?.getWithType(postId);
        bestTriggerType = "thread_follow_up";
        // Use the last human comment as the trigger
        bestComment = postComments[postComments.length - 1] ?? null;
        bestSessionName = postSession?.sessionName ?? "default";
        bestBackendType = postSession?.backendType ?? defaultBackendType;
      }

      if (!bestTriggerType || !bestComment) continue;

      // Check if there's a bot reply after the LAST human comment in this post
      const lastHumanComment = postComments[postComments.length - 1]!;
      const replies = await client.getPostComments(postId, {
        since: lastHumanComment.created_at,
        author_type: "bot",
        limit: 1,
      });

      if (replies.data.length === 0) {
        triggers.push({
          triggerType: bestTriggerType,
          eventId: bestComment.id,
          feedId: feed.id,
          feedName: feed.name,
          postId,
          content: bestComment.content,
          authorName: bestComment.author_name,
          sessionName: bestSessionName,
          backendType: bestBackendType,
        });
        processedPostIds.add(postId);
      }
    }

    // --- Scan post bodies for @mentions ---
    const posts = await client.getFeedPosts(feed.id, { limit: 50 });

    for (const post of posts.data) {
      // Skip posts already handled by comment scan
      if (processedPostIds.has(post.id)) continue;
      // Skip bot-authored posts
      if (isBotAuthor(post.created_by)) continue;
      // Skip posts without content
      if (!post.content) continue;

      // Try mentions across all backend agents
      for (const ba of backendAgents) {
        const mention = parseMention(post.content, ba.agent.name);
        if (!mention.mentioned) continue;

        // Check if there's any bot reply on this post
        const botReplies = await client.getPostComments(post.id, {
          author_type: "bot",
          limit: 1,
        });

        if (botReplies.data.length === 0) {
          triggers.push({
            triggerType: "mention",
            eventId: post.id,
            feedId: feed.id,
            feedName: feed.name,
            postId: post.id,
            content: post.content,
            authorName: post.author_name,
            sessionName: mention.sessionName,
            backendType: ba.backendType,
          });
        }
        break; // First matching backend wins for this post
      }
    }
  }

  return triggers;
}
