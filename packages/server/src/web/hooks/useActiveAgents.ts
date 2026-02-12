import { useState, useEffect, useRef, useCallback } from "react";
import { api, type ActiveAgent, type OnlineAgent } from "../lib/api";
import { TimerMap } from "./timerMap";

const TYPING_TIMEOUT_MS = 120_000;

export function useActiveAgents() {
  // feedId → Map<agentId, ActiveAgent>
  const [agentsByFeed, setAgentsByFeed] = useState<Map<string, Map<string, ActiveAgent>>>(new Map());
  const entriesRef = useRef<Map<string, TimerMap<string, ActiveAgent>>>(new Map());

  // Generic SSE event subscriptions (shared connection)
  const globalListenersRef = useRef<Map<string, Set<() => void>>>(new Map());

  // Online agents (connected via SSE)
  const [onlineAgents, setOnlineAgents] = useState<Map<string, OnlineAgent>>(new Map());

  const updateState = useCallback(() => {
    const snapshot = new Map<string, Map<string, ActiveAgent>>();
    for (const [feedId, timerMap] of entriesRef.current) {
      const agents = timerMap.values();
      if (agents.length > 0) {
        snapshot.set(feedId, new Map(agents.map((a) => [a.agent_id, a])));
      }
    }
    setAgentsByFeed(snapshot);
  }, []);

  const addAgent = useCallback((agent: ActiveAgent) => {
    const { feed_id, agent_id } = agent;

    if (!entriesRef.current.has(feed_id)) {
      entriesRef.current.set(
        feed_id,
        new TimerMap(TYPING_TIMEOUT_MS, () => {
          const tm = entriesRef.current.get(feed_id);
          if (tm && tm.size === 0) entriesRef.current.delete(feed_id);
          updateState();
        })
      );
    }

    entriesRef.current.get(feed_id)!.set(agent_id, agent);
    updateState();
  }, [updateState]);

  const removeAgent = useCallback((feedId: string, agentId: string) => {
    const timerMap = entriesRef.current.get(feedId);
    if (timerMap) {
      timerMap.delete(agentId);
      if (timerMap.size === 0) entriesRef.current.delete(feedId);
    }
    updateState();
  }, [updateState]);

  useEffect(() => {
    // Fetch initial active agents
    api.getActiveAgents()
      .then(({ data }) => {
        for (const agent of data) {
          if (agent.event === "agent_typing") {
            addAgent(agent);
          }
        }
      })
      .catch(() => {});

    // Fetch initial online agents
    api.getOnlineAgents()
      .then(({ data }) => {
        setOnlineAgents(new Map(data.map((a) => [a.agent_id, a])));
      })
      .catch(() => {});

    // Subscribe to global SSE for real-time updates
    const es = new EventSource("/api/events/stream");

    es.addEventListener("agent_typing", (e: Event) => {
      try {
        const data: ActiveAgent = JSON.parse((e as MessageEvent).data);
        addAgent(data);
      } catch {
        // ignore
      }
    });

    es.addEventListener("agent_idle", (e: Event) => {
      try {
        const data: { agent_id: string; feed_id: string } = JSON.parse((e as MessageEvent).data);
        removeAgent(data.feed_id, data.agent_id);
      } catch {
        // ignore
      }
    });

    es.addEventListener("agent_online", (e: Event) => {
      try {
        const data: { agent_id: string; agent_name: string } = JSON.parse((e as MessageEvent).data);
        setOnlineAgents((prev) => {
          const next = new Map(prev);
          next.set(data.agent_id, { agent_id: data.agent_id, agent_name: data.agent_name, connected_at: new Date().toISOString() });
          return next;
        });
      } catch {
        // ignore
      }
    });

    es.addEventListener("agent_offline", (e: Event) => {
      try {
        const data: { agent_id: string } = JSON.parse((e as MessageEvent).data);
        setOnlineAgents((prev) => {
          const next = new Map(prev);
          next.delete(data.agent_id);
          return next;
        });
      } catch {
        // ignore
      }
    });

    // Forward content events to subscribers
    const forwardEvent = (eventType: string) => () => {
      globalListenersRef.current.get(eventType)?.forEach((cb) => cb());
    };
    es.addEventListener("post_created", forwardEvent("post_created"));
    es.addEventListener("comment_created", forwardEvent("comment_created"));

    return () => {
      es.close();
      entriesRef.current.forEach((tm) => tm.clear());
      entriesRef.current = new Map();
    };
  }, [addAgent, removeAgent]);

  const getAgentsForFeed = useCallback((feedId: string): ActiveAgent[] => {
    const feedMap = agentsByFeed.get(feedId);
    return feedMap ? Array.from(feedMap.values()) : [];
  }, [agentsByFeed]);

  const getAllActiveAgentIds = useCallback((): Set<string> => {
    const ids = new Set<string>();
    for (const [, agents] of agentsByFeed) {
      for (const [agentId] of agents) {
        ids.add(agentId);
      }
    }
    return ids;
  }, [agentsByFeed]);

  const getFirstActiveFeedId = useCallback((): string | null => {
    for (const [feedId] of agentsByFeed) {
      return feedId;
    }
    return null;
  }, [agentsByFeed]);

  const subscribeGlobalEvent = useCallback((eventType: string, callback: () => void) => {
    if (!globalListenersRef.current.has(eventType)) {
      globalListenersRef.current.set(eventType, new Set());
    }
    globalListenersRef.current.get(eventType)!.add(callback);
    return () => {
      globalListenersRef.current.get(eventType)?.delete(callback);
    };
  }, []);

  return {
    agentsByFeed,
    onlineAgents,
    getAgentsForFeed,
    getAllActiveAgentIds,
    getFirstActiveFeedId,
    subscribeGlobalEvent,
  };
}
