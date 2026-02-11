import { EventSource } from "eventsource";

export interface SSEEvent {
  type: string;
  data: string;
  id?: string;
}

export interface SSEConnection {
  close: () => void;
}

const EVENT_TYPES = ["heartbeat", "post_created", "comment_created"] as const;

const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;
const BACKOFF_RESET_AFTER_MS = 30_000;

export function connectSSE(
  url: string,
  apiKey: string,
  onEvent: (event: SSEEvent) => void,
  onError: (error: Error) => void
): SSEConnection {
  let closed = false;
  let currentEs: EventSource | null = null;
  let backoffMs = BACKOFF_INITIAL_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lastConnectedAt = 0;
  let processedEventIds = new Set<string>();
  let eventIdCleanupTimer: ReturnType<typeof setInterval> | null = null;

  function connect() {
    if (closed) return;

    const es = new EventSource(url, {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          headers: { ...init.headers, Authorization: `Bearer ${apiKey}` },
        }),
    });
    currentEs = es;

    es.onopen = () => {
      const now = Date.now();
      const isFirstConnect = lastConnectedAt === 0;
      // Only reset backoff if previous connection was stable (lasted > 30s)
      if (!isFirstConnect && now - lastConnectedAt > BACKOFF_RESET_AFTER_MS) {
        backoffMs = BACKOFF_INITIAL_MS;
      }
      if (isFirstConnect) {
        console.log("SSE connected.");
      } else {
        console.log("SSE reconnected.");
      }
      lastConnectedAt = now;
    };

    es.onerror = (err) => {
      // EventSource auto-reconnects on its own, but we want manual control
      // Close the current one and reconnect with backoff
      es.close();
      currentEs = null;

      if (closed) return;

      if (es.readyState === EventSource.CLOSED) {
        onError(new Error(err.message ?? "SSE connection closed"));
      }

      console.log(`SSE disconnected. Reconnecting in ${backoffMs / 1000}s...`);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, backoffMs);

      // Exponential backoff: 1s -> 2s -> 4s -> 8s -> ... -> 60s
      backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
    };

    for (const eventType of EVENT_TYPES) {
      es.addEventListener(eventType, (e) => {
        // Deduplicate events by ID
        const eventId = e.lastEventId || undefined;
        if (eventId) {
          if (processedEventIds.has(eventId)) return;
          processedEventIds.add(eventId);
        }

        onEvent({
          type: eventType,
          data: e.data,
          id: eventId,
        });
      });
    }
  }

  // Periodically clean old event IDs to prevent memory growth
  eventIdCleanupTimer = setInterval(() => {
    processedEventIds = new Set<string>();
  }, 5 * 60 * 1000);

  connect();

  return {
    close: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (eventIdCleanupTimer) clearInterval(eventIdCleanupTimer);
      currentEs?.close();
      currentEs = null;
    },
  };
}
