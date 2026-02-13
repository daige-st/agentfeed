import { Hono } from "hono";
import { apiKeyAuth } from "../../middleware/apiKey.ts";
import { apiOrSessionAuth } from "../../middleware/apiOrSession.ts";
import { getDb } from "../../db.ts";
import { badRequest } from "../../utils/error.ts";
import { assertExists } from "../../utils/validation.ts";
import { emitFeedAgentStatus, getAgentStatuses, getAllActiveAgents, getOnlineAgents } from "../../utils/events/index.ts";
import type { AppEnv } from "../../types.ts";

const status = new Hono<AppEnv>();

// POST /api/agents/status — Worker reports thinking/idle
status.post("/status", apiKeyAuth, async (c) => {
  const body = await c.req.json<{
    status?: string;
    feed_id?: string;
    post_id?: string;
  }>();

  if (!body.status || (body.status !== "thinking" && body.status !== "idle")) {
    throw badRequest("status must be 'thinking' or 'idle'");
  }
  if (!body.feed_id) {
    throw badRequest("feed_id is required");
  }
  if (!body.post_id) {
    throw badRequest("post_id is required");
  }

  const db = getDb();

  // For "idle" status, skip existence checks — feed/post may have been deleted
  // but we still need to clear the typing indicator
  if (body.status === "thinking") {
    assertExists(
      db.query<{ id: string }, [string]>("SELECT id FROM feeds WHERE id = ?").get(body.feed_id),
      "Feed not found"
    );
    assertExists(
      db.query<{ id: string }, [string]>("SELECT id FROM posts WHERE id = ?").get(body.post_id),
      "Post not found"
    );
  }

  const agentId = c.get("authId") as string;
  const agentName = c.get("authName") as string;

  // Look up agent type from DB
  const agent = db.query<{ type: string | null }, [string]>(
    "SELECT type FROM agents WHERE id = ?"
  ).get(agentId);

  emitFeedAgentStatus({
    event: body.status === "thinking" ? "agent_typing" : "agent_idle",
    agent_id: agentId,
    agent_name: agentName,
    agent_type: agent?.type ?? null,
    feed_id: body.feed_id,
    post_id: body.post_id,
  });

  return c.json({ ok: true });
});

// GET /api/agents/active — All active agents across all feeds
status.get("/active", apiOrSessionAuth, (c) => {
  const statuses = getAllActiveAgents();
  return c.json({ data: statuses });
});

// GET /api/agents/status?feed_id=xxx — Query current agent statuses for a feed
status.get("/status", apiOrSessionAuth, (c) => {
  const feedId = c.req.query("feed_id");
  if (!feedId) {
    throw badRequest("feed_id query parameter is required");
  }

  const statuses = getAgentStatuses(feedId);
  return c.json({ data: statuses });
});

// GET /api/agents/online — All currently connected agents (via SSE)
status.get("/online", apiOrSessionAuth, (c) => {
  const onlineAgents = getOnlineAgents();
  return c.json({ data: onlineAgents });
});

export default status;
