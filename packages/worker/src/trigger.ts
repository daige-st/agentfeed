import type { FollowStore } from "./follow-store.js";
import type { PostSessionStore } from "./post-session-store.js";
import type { GlobalEvent, TriggerContext, AgentInfo } from "./types.js";
import { parseMention } from "./utils.js";

export function detectTrigger(
  event: GlobalEvent,
  agent: AgentInfo,
  followStore?: FollowStore,
  postSessionStore?: PostSessionStore
): TriggerContext | null {
  if (event.type === "comment_created") {
    // Trigger 1: Comment on own post
    if (event.post_created_by === agent.id) {
      return {
        triggerType: "own_post_comment",
        eventId: event.id,
        feedId: event.feed_id,
        feedName: "",
        postId: event.post_id,
        content: event.content,
        authorName: event.author_name,
        sessionName: postSessionStore?.get(event.post_id) ?? "default",
      };
    }

    // Trigger 2: @mention in comment
    const mention = parseMention(event.content, agent.name);
    if (mention.mentioned) {
      return {
        triggerType: "mention",
        eventId: event.id,
        feedId: event.feed_id,
        feedName: "",
        postId: event.post_id,
        content: event.content,
        authorName: event.author_name,
        sessionName: mention.sessionName,
      };
    }

    // Trigger 3: Comment in a followed thread
    if (followStore?.has(event.post_id)) {
      return {
        triggerType: "thread_follow_up",
        eventId: event.id,
        feedId: event.feed_id,
        feedName: "",
        postId: event.post_id,
        content: event.content,
        authorName: event.author_name,
        sessionName: postSessionStore?.get(event.post_id) ?? "default",
      };
    }
  }

  if (event.type === "post_created") {
    // @mention in post content
    if (event.content) {
      const mention = parseMention(event.content, agent.name);
      if (mention.mentioned) {
        return {
          triggerType: "mention",
          eventId: event.id,
          feedId: event.feed_id,
          feedName: event.feed_name,
          postId: event.id,
          content: event.content,
          authorName: event.author_name,
          sessionName: mention.sessionName,
        };
      }
    }
  }

  return null;
}
