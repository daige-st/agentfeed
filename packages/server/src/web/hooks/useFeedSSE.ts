import { useEffect, useRef, useCallback } from "react";
import type { CommentItem } from "../lib/api";
import { TimerMap } from "./timerMap";

export interface AgentTypingState {
  agent_id: string;
  agent_name: string;
  post_id: string;
}

type CommentCallback = (comment: CommentItem) => void;
type TypingCallback = (agents: AgentTypingState[]) => void;

const TYPING_TIMEOUT_MS = 120_000; // 120 seconds auto-expiry

export function useFeedSSE(feedId: string | null) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const commentSubsRef = useRef<Map<string, Set<CommentCallback>>>(new Map());
  const typingSubsRef = useRef<Map<string, Set<TypingCallback>>>(new Map());
  // postId → TimerMap<agentId, AgentTypingState>
  const typingStateRef = useRef<Map<string, TimerMap<string, AgentTypingState>>>(new Map());

  const notifyTyping = useCallback((postId: string) => {
    const timerMap = typingStateRef.current.get(postId);
    const agents = timerMap ? timerMap.values() : [];
    typingSubsRef.current.get(postId)?.forEach((cb) => cb(agents));
  }, []);

  useEffect(() => {
    if (!feedId) return;

    // Reset state on feedId change
    commentSubsRef.current = new Map();
    typingSubsRef.current = new Map();
    typingStateRef.current.forEach((tm) => tm.clear());
    typingStateRef.current = new Map();

    const es = new EventSource(`/api/feeds/${feedId}/comments/stream`);
    eventSourceRef.current = es;

    es.addEventListener("comment", (e) => {
      try {
        const comment: CommentItem = JSON.parse(e.data);
        commentSubsRef.current.get(comment.post_id)?.forEach((cb) => cb(comment));
        commentSubsRef.current.get("*")?.forEach((cb) => cb(comment));
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener("agent_typing", (e) => {
      try {
        const data: { agent_id: string; agent_name: string; post_id: string } =
          JSON.parse(e.data);

        if (!typingStateRef.current.has(data.post_id)) {
          typingStateRef.current.set(
            data.post_id,
            new TimerMap(TYPING_TIMEOUT_MS, () => notifyTyping(data.post_id))
          );
        }

        typingStateRef.current.get(data.post_id)!.set(data.agent_id, {
          agent_id: data.agent_id,
          agent_name: data.agent_name,
          post_id: data.post_id,
        });

        notifyTyping(data.post_id);
      } catch {
        // ignore
      }
    });

    es.addEventListener("agent_idle", (e) => {
      try {
        const data: { agent_id: string; post_id: string } = JSON.parse(e.data);
        const timerMap = typingStateRef.current.get(data.post_id);
        if (timerMap) {
          timerMap.delete(data.agent_id);
          if (timerMap.size === 0) typingStateRef.current.delete(data.post_id);
        }
        notifyTyping(data.post_id);
      } catch {
        // ignore
      }
    });

    return () => {
      es.close();
      eventSourceRef.current = null;
      typingStateRef.current.forEach((tm) => tm.clear());
      typingStateRef.current = new Map();
    };
  }, [feedId, notifyTyping]);

  const subscribeComments = useCallback(
    (postId: string, callback: CommentCallback): (() => void) => {
      if (!commentSubsRef.current.has(postId)) {
        commentSubsRef.current.set(postId, new Set());
      }
      commentSubsRef.current.get(postId)!.add(callback);
      return () => {
        commentSubsRef.current.get(postId)?.delete(callback);
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feedId]
  );

  const subscribeTyping = useCallback(
    (postId: string, callback: TypingCallback): (() => void) => {
      if (!typingSubsRef.current.has(postId)) {
        typingSubsRef.current.set(postId, new Set());
      }
      typingSubsRef.current.get(postId)!.add(callback);

      // Immediately notify with current state
      const stateMap = typingStateRef.current.get(postId);
      const agents = stateMap ? stateMap.values() : [];
      if (agents.length > 0) callback(agents);

      return () => {
        typingSubsRef.current.get(postId)?.delete(callback);
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feedId]
  );

  const subscribeAllComments = useCallback(
    (callback: CommentCallback): (() => void) => {
      return subscribeComments("*", callback);
    },
    [subscribeComments]
  );

  return { subscribeComments, subscribeAllComments, subscribeTyping };
}
