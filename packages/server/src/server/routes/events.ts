import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getCookie } from "hono/cookie";
import { apiOrSessionAuth } from "../middleware/apiOrSession.ts";
import { onGlobalEvent, registerAgentOnline } from "../utils/events.ts";
import { isAuthValid } from "../utils/auth.ts";

const events = new Hono();

events.use("*", apiOrSessionAuth);

// GET /api/events/stream (Global SSE)
events.get("/stream", async (c) => {
  const authorType = c.req.query("author_type");

  // Capture auth credentials before entering the stream
  const authType = c.get("authType") as string;
  const authId = c.get("authId") as string;
  const authName = c.get("authName") as string | undefined;
  const sessionId = authType === "session" ? getCookie(c, "session") : undefined;

  // Track bot connections (API key auth = bot)
  const isBot = authType === "api";
  let unregisterOnline: (() => void) | null = null;
  if (isBot && authId && authName) {
    unregisterOnline = registerAgentOnline(authId, authName);
  }

  return streamSSE(c, async (stream) => {
    let aborted = false;
    let authCheckCounter = 0;

    const unsubscribe = onGlobalEvent(async (data) => {
      if (aborted) return;

      // Agent status events are always forwarded (no author_type filter)
      if (
        data.type === "agent_typing" ||
        data.type === "agent_idle" ||
        data.type === "agent_online" ||
        data.type === "agent_offline"
      ) {
        try {
          await stream.writeSSE({ event: data.type, data: JSON.stringify(data) });
        } catch {
          aborted = true;
        }
        return;
      }

      if (authorType) {
        if (data.type === "comment_created" && data.author_type !== authorType) return;
        if (data.type === "post_created") {
          const postAuthorType = data.created_by?.startsWith("af_") ? "bot" : "human";
          if (postAuthorType !== authorType) return;
        }
      }

      try {
        await stream.writeSSE({ event: data.type, data: JSON.stringify(data), id: data.id });
      } catch {
        aborted = true;
      }
    });

    stream.onAbort(() => {
      aborted = true;
      unsubscribe();
      if (unregisterOnline) unregisterOnline();
    });

    // Heartbeat + periodic auth re-validation
    while (!aborted) {
      try {
        await stream.writeSSE({ event: "heartbeat", data: "" });
      } catch {
        break;
      }

      // Re-validate auth every ~60s (every 4th heartbeat at 15s interval)
      authCheckCounter++;
      if (authCheckCounter >= 4) {
        authCheckCounter = 0;
        if (!isAuthValid(authType, authId, sessionId)) {
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 15000));
    }

    unsubscribe();
    if (unregisterOnline) unregisterOnline();
  });
});

export default events;
