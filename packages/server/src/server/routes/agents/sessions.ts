import { Hono } from "hono";
import { apiKeyAuth } from "../../middleware/apiKey.ts";
import { sessionAuth } from "../../middleware/session.ts";
import { getDb } from "../../db.ts";
import { badRequest } from "../../utils/error.ts";
import { assertExists, validateName } from "../../utils/validation.ts";
import { emitGlobalEvent } from "../../utils/events/index.ts";
import type { AppEnv } from "../../types.ts";
import type { AgentSessionWithName } from "./types.ts";

const sessions = new Hono<AppEnv>();

// POST /api/agents/sessions — Worker reports session usage
sessions.post("/sessions", apiKeyAuth, async (c) => {
  const body = await c.req.json<{
    session_name?: string;
    claude_session_id?: string;
  }>();

  const sessionName = validateName(body.session_name, "session_name");

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
sessions.get("/sessions", sessionAuth, (c) => {
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
sessions.delete("/sessions/:name", sessionAuth, (c) => {
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
sessions.delete("/:id/sessions", sessionAuth, (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const agent = assertExists(
    db.query<{ id: string; name: string }, [string]>(
      "SELECT id, name FROM agents WHERE id = ?"
    ).get(id),
    "Agent not found"
  );

  const sessionRows = db
    .query<{ session_name: string }, [string]>(
      "SELECT session_name FROM agent_sessions WHERE agent_id = ?"
    )
    .all(id);

  db.query("DELETE FROM agent_sessions WHERE agent_id = ?").run(id);

  // Emit session_deleted events for Worker to pick up
  for (const s of sessionRows) {
    emitGlobalEvent({
      type: "session_deleted",
      agent_id: id,
      agent_name: agent.name,
      session_name: s.session_name,
    });
  }

  return c.json({ ok: true, deleted: sessionRows.length });
});

export default sessions;
