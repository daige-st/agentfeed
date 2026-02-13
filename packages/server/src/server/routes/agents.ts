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
  parent_name: string | null;
  type: string | null;
  cwd: string | null;
  last_active_at: string | null;
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
  const body = await c.req.json<{ name?: string; type?: string; cwd?: string }>();
  const name = body.name?.trim();
  const type = body.type?.trim() || null;
  const cwd = body.cwd?.trim() || null;

  if (!name) {
    throw badRequest("name is required");
  }
  if (name.length > 100) {
    throw badRequest("name must be 100 characters or less");
  }

  const apiKeyId = c.get("apiKeyId") as string;
  const db = getDb();
  const parentName = name.includes("/") ? name.split("/")[0]! : null;

  // Check if agent with this name already exists
  const existing = db
    .query<AgentRow, [string]>("SELECT * FROM agents WHERE name = ?")
    .get(name);

  if (existing) {
    // Update api_key_id, parent_name, type, and cwd to current values
    const updated = db
      .query<AgentRow, [string, string | null, string | null, string | null, string]>(
        "UPDATE agents SET api_key_id = ?, parent_name = ?, type = ?, cwd = ? WHERE name = ? RETURNING *"
      )
      .get(apiKeyId, parentName, type, cwd, name);
    return c.json(updated, 200);
  }

  // Create new agent
  const id = generateId("agent");
  const agent = db
    .query<AgentRow, [string, string, string, string | null, string | null, string | null]>(
      "INSERT INTO agents (id, name, api_key_id, parent_name, type, cwd) VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
    )
    .get(id, name, apiKeyId, parentName, type, cwd);

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
       ORDER BY a.last_active_at DESC NULLS LAST, a.created_at DESC`
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

// DELETE /api/agents/:id/sessions — Clear all sessions for an agent (admin only)
agents.delete("/:id/sessions", sessionAuth, (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const agent = assertExists(
    db.query<{ id: string; name: string }, [string]>(
      "SELECT id, name FROM agents WHERE id = ?"
    ).get(id),
    "Agent not found"
  );

  const sessions = db
    .query<{ session_name: string }, [string]>(
      "SELECT session_name FROM agent_sessions WHERE agent_id = ?"
    )
    .all(id);

  db.query("DELETE FROM agent_sessions WHERE agent_id = ?").run(id);

  // Emit session_deleted events for Worker to pick up
  for (const s of sessions) {
    emitGlobalEvent({
      type: "session_deleted",
      agent_id: id,
      agent_name: agent.name,
      session_name: s.session_name,
    });
  }

  return c.json({ ok: true, deleted: sessions.length });
});

// --- Agent Detail & Permissions ---
// NOTE: GET /:id must be after all named GET routes (/active, /status, /online, /sessions)

interface AgentDetailRow extends AgentRow {
  key_name: string;
  permission_mode: string;
  allowed_tools: string;
}

// GET /api/agents/:id — Agent detail with CLI settings (admin only)
agents.get("/:id", sessionAuth, (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const agent = assertExists(
    db
      .query<AgentDetailRow, [string]>(
        `SELECT a.*, k.name as key_name,
                COALESCE(ap.permission_mode, 'safe') as permission_mode,
                COALESCE(ap.allowed_tools, '[]') as allowed_tools
         FROM agents a
         JOIN api_keys k ON a.api_key_id = k.id
         LEFT JOIN agent_permissions ap ON a.id = ap.agent_id
         WHERE a.id = ?`
      )
      .get(id),
    "Agent not found"
  );

  // Parse allowed_tools from JSON string to array for consistent API response
  let parsedTools: string[] = [];
  try {
    parsedTools = JSON.parse(agent.allowed_tools);
  } catch {
    parsedTools = [];
  }

  return c.json({ ...agent, allowed_tools: parsedTools });
});

interface AgentConfigRow {
  permission_mode: string;
  allowed_tools: string;
}

// GET /api/agents/:id/config — Agent CLI config for worker (API key auth)
agents.get("/:id/config", apiKeyAuth, (c) => {
  const { id } = c.req.param();
  const db = getDb();

  assertExists(
    db.query<{ id: string }, [string]>("SELECT id FROM agents WHERE id = ?").get(id),
    "Agent not found"
  );

  const config = db
    .query<AgentConfigRow, [string]>(
      "SELECT permission_mode, allowed_tools FROM agent_permissions WHERE agent_id = ?"
    )
    .get(id);

  if (!config) {
    return c.json({ permission_mode: "safe", allowed_tools: [] });
  }

  let tools: string[] = [];
  try {
    tools = JSON.parse(config.allowed_tools);
  } catch {
    tools = [];
  }

  return c.json({ permission_mode: config.permission_mode, allowed_tools: tools });
});

// PUT /api/agents/:id/permissions — Update agent CLI settings (admin only)
agents.put("/:id/permissions", sessionAuth, async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  assertExists(
    db.query<{ id: string }, [string]>("SELECT id FROM agents WHERE id = ?").get(id),
    "Agent not found"
  );

  const body = await c.req.json<{
    permission_mode?: string;
    allowed_tools?: string;
  }>();

  // Validate permission_mode
  if (body.permission_mode !== undefined && body.permission_mode !== "safe" && body.permission_mode !== "yolo") {
    throw badRequest("permission_mode must be 'safe' or 'yolo'");
  }

  // Validate allowed_tools
  if (body.allowed_tools !== undefined) {
    try {
      const parsed = JSON.parse(body.allowed_tools);
      if (!Array.isArray(parsed) || !parsed.every((v: unknown) => typeof v === "string")) {
        throw badRequest("allowed_tools must be a JSON array of tool name strings");
      }
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw badRequest("allowed_tools must be a valid JSON array of tool name strings");
      }
      throw e;
    }
  }

  db.query(
    `INSERT INTO agent_permissions (agent_id, permission_mode, allowed_tools, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(agent_id) DO UPDATE SET
       permission_mode = excluded.permission_mode,
       allowed_tools = excluded.allowed_tools,
       updated_at = datetime('now')`
  ).run(id, body.permission_mode ?? "safe", body.allowed_tools ?? "[]");

  return c.json({ ok: true });
});

export default agents;
