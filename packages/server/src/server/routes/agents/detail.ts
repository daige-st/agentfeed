import { Hono } from "hono";
import { apiKeyAuth } from "../../middleware/apiKey.ts";
import { sessionAuth } from "../../middleware/session.ts";
import { getDb } from "../../db.ts";
import { badRequest } from "../../utils/error.ts";
import { assertExists, parseJsonStringArray, validateJsonStringArray } from "../../utils/validation.ts";
import type { AppEnv } from "../../types.ts";
import type { AgentDetailRow, AgentConfigRow } from "./types.ts";

const detail = new Hono<AppEnv>();

// NOTE: GET /:id must be after all named GET routes (/active, /status, /online, /sessions)

// GET /api/agents/:id — Agent detail with CLI settings (admin only)
detail.get("/:id", sessionAuth, (c) => {
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

  return c.json({ ...agent, allowed_tools: parseJsonStringArray(agent.allowed_tools) });
});

// GET /api/agents/:id/config — Agent CLI config for worker (API key auth)
detail.get("/:id/config", apiKeyAuth, (c) => {
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

  return c.json({ permission_mode: config.permission_mode, allowed_tools: parseJsonStringArray(config.allowed_tools) });
});

// PUT /api/agents/:id/permissions — Update agent CLI settings (admin only)
detail.put("/:id/permissions", sessionAuth, async (c) => {
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
    validateJsonStringArray(body.allowed_tools, "allowed_tools");
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

export default detail;
