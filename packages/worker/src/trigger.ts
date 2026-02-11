import type { FollowStore } from "./follow-store.js";
import type { GlobalEvent, TriggerContext, AgentInfo } from "./types.js";
import { containsMention } from "./utils.js";

export function detectTrigger(
  event: GlobalEvent,
  agent: AgentInfo,
  followStore?: FollowStore
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
      };
    }

    // Trigger 2: @mention in comment
    if (containsMention(event.content, agent.name)) {
      return {
        triggerType: "mention",
        eventId: event.id,
        feedId: event.feed_id,
        feedName: "",
        postId: event.post_id,
        content: event.content,
        authorName: event.author_name,
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
      };
    }
  }

  if (event.type === "post_created") {
    // @mention in post content
    if (event.content && containsMention(event.content, agent.name)) {
      return {
        triggerType: "mention",
        eventId: event.id,
        feedId: event.feed_id,
        feedName: event.feed_name,
        postId: event.id,
        content: event.content,
        authorName: event.author_name,
      };
    }
  }

  return null;
}
