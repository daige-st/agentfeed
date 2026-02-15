import type { FollowStore } from "./follow-store.js";
import type { PostSessionStore } from "./post-session-store.js";
import type { GlobalEvent, TriggerContext, BackendAgent } from "./types.js";
import { parseMention, isBotAuthor } from "./utils.js";

export function detectTriggers(
  event: GlobalEvent,
  backendAgents: BackendAgent[],
  followStore?: FollowStore,
  postSessionStore?: PostSessionStore,
  ownAgentIds?: Set<string>
): TriggerContext[] {
  const isOwnAgent = (id: string | null) =>
    id !== null && (ownAgentIds ? ownAgentIds.has(id) : false);

  const defaultBackendType = backendAgents[0]?.backendType ?? "claude";

  if (event.type === "comment_created") {
    const authorIsOwnBot = isOwnAgent(event.created_by);

    // Trigger 1: Comment on own post (human-authored only — prevents bot loop)
    if (!authorIsOwnBot && isOwnAgent(event.post_created_by)) {
      const postSession = postSessionStore?.getWithType(event.post_id);
      return [{
        triggerType: "own_post_comment",
        eventId: event.id,
        feedId: event.feed_id,
        feedName: "",
        postId: event.post_id,
        content: event.content,
        authorName: event.author_name,
        authorIsBot: event.author_type === "bot",
        sessionName: postSession?.sessionName ?? "default",
        backendType: postSession?.backendType ?? defaultBackendType,
      }];
    }

    // Trigger 2: @mention in comment — collect ALL matching agents
    const mentions: TriggerContext[] = [];
    for (const ba of backendAgents) {
      if (event.created_by === ba.agent.id) continue; // skip self-mention
      const mention = parseMention(event.content, ba.agent.name);
      if (mention.mentioned) {
        mentions.push({
          triggerType: "mention",
          eventId: `${event.id}:${ba.backendType}`,
          feedId: event.feed_id,
          feedName: "",
          postId: event.post_id,
          content: event.content,
          authorName: event.author_name,
          authorIsBot: event.author_type === "bot",
          sessionName: mention.sessionName,
          backendType: ba.backendType,
        });
      }
    }
    if (mentions.length > 0) return mentions;

    // Trigger 3: Comment in a followed thread (human-authored only — prevents bot loop)
    if (!authorIsOwnBot && followStore?.has(event.post_id)) {
      const postSessions = postSessionStore?.getAll(event.post_id) ?? [];

      if (postSessions.length === 0) {
        console.log(`Thread follow-up on ${event.post_id}: no post-session found, using default [${defaultBackendType}]`);
        return [{
          triggerType: "thread_follow_up",
          eventId: event.id,
          feedId: event.feed_id,
          feedName: "",
          postId: event.post_id,
          content: event.content,
          authorName: event.author_name,
          authorIsBot: event.author_type === "bot",
          sessionName: "default",
          backendType: defaultBackendType,
        }];
      }

      // Trigger ALL backends that participated in this thread
      console.log(`Thread follow-up on ${event.post_id}: triggering ${postSessions.length} backend(s) [${postSessions.map(s => s.backendType).join(", ")}]`);
      return postSessions.map((ps) => ({
        triggerType: "thread_follow_up" as const,
        eventId: `${event.id}:${ps.backendType}`,
        feedId: event.feed_id,
        feedName: "",
        postId: event.post_id,
        content: event.content,
        authorName: event.author_name,
        authorIsBot: event.author_type === "bot",
        sessionName: ps.sessionName,
        backendType: ps.backendType,
      }));
    }
  }

  if (event.type === "post_created") {
    // @mention in post content — collect ALL matching agents
    if (event.content) {
      const mentions: TriggerContext[] = [];
      for (const ba of backendAgents) {
        if (event.created_by === ba.agent.id) continue;
        const mention = parseMention(event.content, ba.agent.name);
        if (mention.mentioned) {
          mentions.push({
            triggerType: "mention",
            eventId: `${event.id}:${ba.backendType}`,
            feedId: event.feed_id,
            feedName: event.feed_name,
            postId: event.id,
            content: event.content,
            authorName: event.author_name,
            authorIsBot: isBotAuthor(event.created_by),
            sessionName: mention.sessionName,
            backendType: ba.backendType,
          });
        }
      }
      if (mentions.length > 0) return mentions;
    }
  }

  return [];
}
