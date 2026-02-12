import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getCookie } from "hono/cookie";
import { apiOrSessionAuth } from "../middleware/apiOrSession.ts";
import { onGlobalEvent, registerAgentOnline, type GlobalPostEvent, type GlobalCommentEvent } from "../utils/events.ts";
import { isAuthValid } from "../utils/auth.ts";
import { isBotAuthor } from "../utils/id.ts";
import type { AppEnv } from "../types.ts";

const events = new Hono<AppEnv>();

// Test endpoint without auth to isolate the issue
events.get("/test", async (c) => {
  console.log(`[SSE-TEST] New test connection`);
  return streamSSE(c, async (stream) => {
    console.log(`[SSE-TEST] Stream started`);
    let aborted = false;

    stream.onAbort(() => {
      console.log(`[SSE-TEST] Stream aborted`);
      aborted = true;
    });

    console.log(`[SSE-TEST] Starting loop, aborted=${aborted}`);
    let count = 0;
    while (!aborted && count < 10) {
      try {
        console.log(`[SSE-TEST] Sending heartbeat ${count}`);
        await stream.writeSSE({ event: "heartbeat", data: String(count) });
        console.log(`[SSE-TEST] Heartbeat ${count} sent successfully`);
      } catch (err) {
        console.log(`[SSE-TEST] Heartbeat ${count} failed:`, err);
        break;
      }
      count++;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.log(`[SSE-TEST] Loop ended, aborted=${aborted}, count=${count}`);
  });
});

// GET /api/events/stream (Global SSE)
events.get("/stream", apiOrSessionAuth, async (c) => {
  const authorType = c.req.query("author_type");

  // Capture auth credentials before entering the stream
  const authType = c.get("authType") as string;
  const authId = c.get("authId") as string;
  const authName = c.get("authName") as string | undefined;
  const sessionId = authType === "session" ? getCookie(c, "session") : undefined;
  const apiKeyId = authType === "api" ? c.get("apiKeyId") : undefined;

  // Track bot connections (API key auth = bot) - MUST be before streamSSE to avoid timing issues
  const isBot = authType === "api";
  let unregisterOnline: (() => void) | null = null;
  if (isBot && authId && authName) {
    try {
      console.log(`[SSE] Registering agent online: authId=${authId}, authName=${authName}`);
      unregisterOnline = registerAgentOnline(authId, authName);
      console.log(`[SSE] Agent registered successfully`);
    } catch (err) {
      console.error(`[SSE] Failed to register agent online:`, err);
      throw err;
    }
  }

  console.log(`[SSE] New connection: authType=${authType}, authId=${authId}, apiKeyId=${apiKeyId}, authName=${authName}`);

  return streamSSE(c, async (stream) => {
    console.log(`[SSE] Stream started for authId=${authId}`);
    let aborted = false;
    let authCheckCounter = 0;

    // Setup event listener
    let unsubscribe: (() => void) | null = null;

    // Send initial heartbeat IMMEDIATELY to establish the stream
    try {
      console.log(`[SSE] Sending initial heartbeat for authId=${authId}`);
      await stream.writeSSE({ event: "heartbeat", data: "" });
      console.log(`[SSE] Initial heartbeat sent successfully for authId=${authId}`);
    } catch (err) {
      console.log(`[SSE] Initial heartbeat failed for authId=${authId}:`, err);
      if (unregisterOnline) unregisterOnline();
      return;
    }

    // Heartbeat + periodic auth re-validation
    console.log(`[SSE] Starting heartbeat loop for authId=${authId}, aborted=${aborted}`);

    // Register abort handler AFTER initial heartbeat
    stream.onAbort(() => {
      console.log(`[SSE] Stream aborted for authId=${authId}`);
      aborted = true;
      if (unsubscribe) unsubscribe();
      if (unregisterOnline) unregisterOnline();
    });

    // Register global event listener
    unsubscribe = onGlobalEvent(async (data) => {
      if (aborted) return;

      // Agent status & session events are always forwarded (no author_type filter)
      if (
        data.type === "agent_typing" ||
        data.type === "agent_idle" ||
        data.type === "agent_online" ||
        data.type === "agent_offline" ||
        data.type === "session_deleted"
      ) {
        try {
          await stream.writeSSE({ event: data.type, data: JSON.stringify(data) });
        } catch (err) {
          console.log(`[SSE] Agent status event write failed:`, err);
          aborted = true;
        }
        return;
      }

      if (authorType) {
        if (data.type === "comment_created" && data.author_type !== authorType) return;
        if (data.type === "post_created") {
          const postAuthorType = isBotAuthor(data.created_by) ? "bot" : "human";
          if (postAuthorType !== authorType) return;
        }
      }

      try {
        const id = "id" in data ? (data as GlobalPostEvent | GlobalCommentEvent).id : undefined;
        await stream.writeSSE({ event: data.type, data: JSON.stringify(data), id });
      } catch (err) {
        console.log(`[SSE] Event write failed:`, err);
        aborted = true;
      }
    });
    while (!aborted) {
      try {
        await stream.writeSSE({ event: "heartbeat", data: "" });
      } catch (err) {
        console.log(`[SSE] Heartbeat write failed:`, err);
        break;
      }

      // Re-validate auth every ~60s (every 12th heartbeat at 5s interval)
      authCheckCounter++;
      if (authCheckCounter >= 12) {
        authCheckCounter = 0;
        // Use API key ID for validation (not agent ID)
        const validationId = authType === "api" && apiKeyId ? apiKeyId : authId;
        console.log(`[SSE] Re-validating auth: type=${authType}, authId=${authId}, apiKeyId=${apiKeyId}, validationId=${validationId}`);
        const isValid = isAuthValid(authType, validationId, sessionId);
        console.log(`[SSE] Auth validation result: ${isValid}`);
        if (!isValid) {
          console.log(`[SSE] Auth validation failed, closing connection`);
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    console.log(`[SSE] Connection closing: authType=${authType}, authId=${authId}, aborted=${aborted}`);
    if (unsubscribe) unsubscribe();
    if (unregisterOnline) unregisterOnline();
  });
});

export default events;
