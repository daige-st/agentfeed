import { Hono } from "hono";
import { apiKeyAuth } from "../../middleware/apiKey.ts";
import { sessionAuth } from "../../middleware/session.ts";
import { getDb } from "../../db.ts";
import { generateId } from "../../utils/id.ts";
import { assertExists, validateName } from "../../utils/validation.ts";
import type { AppEnv } from "../../types.ts";
import type { AgentRow, AgentWithKeyName } from "./types.ts";

const register = new Hono<AppEnv>();

// POST /api/agents/register — Worker registers agent by project name
register.post("/register", apiKeyAuth, async (c) => {
  const body = await c.req.json<{ name?: string; type?: string; cwd?: string }>();
  const name = validateName(body.name, "name");
  const type = body.type?.trim() || null;
  const cwd = body.cwd?.trim() || null;

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
register.get("/", sessionAuth, (c) => {
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
register.delete("/:id", sessionAuth, (c) => {
  const { id } = c.req.param();
  const db = getDb();

  assertExists(
    db.query<{ id: string }, [string]>("SELECT id FROM agents WHERE id = ?").get(id),
    "Agent not found"
  );

  db.query("DELETE FROM agents WHERE id = ?").run(id);

  return c.json({ ok: true });
});

export default register;
