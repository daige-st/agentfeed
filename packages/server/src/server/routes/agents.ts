import { Hono } from "hono";
import { apiKeyAuth } from "../middleware/apiKey.ts";
import { apiOrSessionAuth } from "../middleware/apiOrSession.ts";
import { sessionAuth } from "../middleware/session.ts";
import { getDb } from "../db.ts";
import { generateId } from "../utils/id.ts";
import { badRequest } from "../utils/error.ts";
import { assertExists } from "../utils/validation.ts";
import { emitFeedAgentStatus, emitGlobalEvent, getAgentStatuses, getAllActiveAgents, getOnlineAgents } from "../utils/events.ts";
import type { AppEnv } from "../types.ts";

interface AgentRow {
  id: string;
  name: string;
  api_key_id: string;
  created_at: string;
}

interface AgentWithKeyName extends AgentRow {
  key_name: string;
}

interface AgentSessionRow {
  agent_id: string;
  session_name: string;
  claude_session_id: string | null;
  created_at: string;
  last_used_at: string;
}

interface AgentSessionWithName extends AgentSessionRow {
  agent_name: string;
}

const agents = new Hono<AppEnv>();

// POST /api/agents/register — Worker registers agent by project name
agents.post("/register", apiKeyAuth, async (c) => {
  const body = await c.req.json<{ name?: string }>();
  const name = body.name?.trim();

  if (!name) {
    throw badRequest("name is required");
  }
  if (name.length > 100) {
    throw badRequest("name must be 100 characters or less");
  }

  const apiKeyId = c.get("apiKeyId") as string;
  const db = getDb();

  // Check if agent with this name already exists
  const existing = db
    .query<AgentRow, [string]>("SELECT * FROM agents WHERE name = ?")
    .get(name);

  if (existing) {
    // Update api_key_id to current key
    const updated = db
      .query<AgentRow, [string, string]>(
        "UPDATE agents SET api_key_id = ? WHERE name = ? RETURNING *"
      )
      .get(apiKeyId, name);
    return c.json(updated, 200);
  }

  // Create new agent
  const id = generateId("agent");
  const agent = db
    .query<AgentRow, [string, string, string]>(
      "INSERT INTO agents (id, name, api_key_id) VALUES (?, ?, ?) RETURNING *"
    )
    .get(id, name, apiKeyId);

  return c.json(agent, 201);
});

// GET /api/agents — List all registered agents (admin only)
agents.get("/", sessionAuth, (c) => {
  const db = getDb();
  const rows = db
    .query<AgentWithKeyName, []>(
      `SELECT a.*, k.name as key_name
       FROM agents a
       JOIN api_keys k ON a.api_key_id = k.id
       ORDER BY a.created_at DESC`
    )
    .all();

  return c.json({ data: rows });
});

// DELETE /api/agents/:id — Delete an agent (admin only)
agents.delete("/:id", sessionAuth, (c) => {
  const { id } = c.req.param();
  const db = getDb();

  assertExists(
    db.query<{ id: string }, [string]>("SELECT id FROM agents WHERE id = ?").get(id),
    "Agent not found"
  );

  db.query("DELETE FROM agents WHERE id = ?").run(id);

  return c.json({ ok: true });
});

// POST /api/agents/status — Worker reports thinking/idle
agents.post("/status", apiKeyAuth, async (c) => {
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

  // Validate feed and post exist
  const db = getDb();
  assertExists(
    db.query<{ id: string }, [string]>("SELECT id FROM feeds WHERE id = ?").get(body.feed_id),
    "Feed not found"
  );
  assertExists(
    db.query<{ id: string }, [string]>("SELECT id FROM posts WHERE id = ?").get(body.post_id),
    "Post not found"
  );

  const agentId = c.get("authId") as string;
  const agentName = c.get("authName") as string;

  emitFeedAgentStatus({
    event: body.status === "thinking" ? "agent_typing" : "agent_idle",
    agent_id: agentId,
    agent_name: agentName,
    feed_id: body.feed_id,
    post_id: body.post_id,
  });

  return c.json({ ok: true });
});

// GET /api/agents/active — All active agents across all feeds
agents.get("/active", apiOrSessionAuth, (c) => {
  const statuses = getAllActiveAgents();
  return c.json({ data: statuses });
});

// GET /api/agents/status?feed_id=xxx — Query current agent statuses for a feed
agents.get("/status", apiOrSessionAuth, (c) => {
  const feedId = c.req.query("feed_id");
  if (!feedId) {
    throw badRequest("feed_id query parameter is required");
  }

  const statuses = getAgentStatuses(feedId);
  return c.json({ data: statuses });
});

// GET /api/agents/online — All currently connected agents (via SSE)
agents.get("/online", apiOrSessionAuth, (c) => {
  const agents = getOnlineAgents();
  return c.json({ data: agents });
});

// --- Agent Sessions ---

// POST /api/agents/sessions — Worker reports session usage
agents.post("/sessions", apiKeyAuth, async (c) => {
  const body = await c.req.json<{
    session_name?: string;
    claude_session_id?: string;
  }>();

  const sessionName = body.session_name?.trim();
  if (!sessionName) {
    throw badRequest("session_name is required");
  }
  if (sessionName.length > 100) {
    throw badRequest("session_name must be 100 characters or less");
  }

  const agentId = c.get("authId") as string;
  const db = getDb();

  db.query(
    `INSERT INTO agent_sessions (agent_id, session_name, claude_session_id)
     VALUES (?, ?, ?)
     ON CONFLICT (agent_id, session_name) DO UPDATE SET
       claude_session_id = excluded.claude_session_id,
       last_used_at = datetime('now')`
  ).run(agentId, sessionName, body.claude_session_id ?? null);

  return c.json({ ok: true });
});

// GET /api/agents/sessions — List all agent sessions (admin only)
agents.get("/sessions", sessionAuth, (c) => {
  const db = getDb();
  const rows = db
    .query<AgentSessionWithName, []>(
      `SELECT s.*, a.name as agent_name
       FROM agent_sessions s
       JOIN agents a ON s.agent_id = a.id
       ORDER BY s.last_used_at DESC`
    )
    .all();

  return c.json({ data: rows });
});

// DELETE /api/agents/sessions/:name — Delete a session (admin only)
agents.delete("/sessions/:name", sessionAuth, (c) => {
  const { name: sessionName } = c.req.param();
  const agentId = c.req.query("agent_id");

  if (!agentId) {
    throw badRequest("agent_id query parameter is required");
  }

  const db = getDb();

  const existing = assertExists(
    db
      .query<AgentSessionWithName, [string, string]>(
        `SELECT s.*, a.name as agent_name FROM agent_sessions s
         JOIN agents a ON s.agent_id = a.id
         WHERE s.agent_id = ? AND s.session_name = ?`
      )
      .get(agentId, sessionName),
    "Session not found"
  );

  db.query(
    "DELETE FROM agent_sessions WHERE agent_id = ? AND session_name = ?"
  ).run(agentId, sessionName);

  // Emit session_deleted event for Worker to pick up
  emitGlobalEvent({
    type: "session_deleted",
    agent_id: agentId,
    agent_name: existing.agent_name,
    session_name: sessionName,
  });

  return c.json({ ok: true });
});

export default agents;
