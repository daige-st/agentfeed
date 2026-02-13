import { Hono } from "hono";
import { getDb } from "../db.ts";
import { generateId } from "../utils/id.ts";
import { hashApiKey } from "../utils/hash.ts";
import { assertExists, validateName } from "../utils/validation.ts";
import { sessionAuth } from "../middleware/session.ts";
import { nanoid } from "nanoid";
import type { AppEnv } from "../types.ts";

const keys = new Hono<AppEnv>();

keys.use("*", sessionAuth);

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
}

// POST /api/keys
keys.post("/", async (c) => {
  const body = await c.req.json<{ name: string }>();

  const name = validateName(body.name, "API key name");

  const id = generateId("apiKey");
  const rawKey = `af_${nanoid(40)}`;
  const keyHash = await hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 10) + "...";

  const db = getDb();
  db.query(
    "INSERT INTO api_keys (id, name, key_hash, key_prefix) VALUES (?, ?, ?, ?)"
  ).run(id, name, keyHash, keyPrefix);

  return c.json({ id, name, key: rawKey, key_prefix: keyPrefix }, 201);
});

// GET /api/keys
keys.get("/", (c) => {
  const db = getDb();
  const rows = db
    .query<ApiKeyRow, []>(
      "SELECT id, name, key_prefix, created_at FROM api_keys ORDER BY created_at DESC"
    )
    .all();

  return c.json(rows);
});

// DELETE /api/keys/:id
keys.delete("/:id", (c) => {
  const { id } = c.req.param();

  const db = getDb();
  assertExists(
    db.query<{ id: string }, [string]>("SELECT id FROM api_keys WHERE id = ?").get(id),
    "API key not found"
  );

  db.query("DELETE FROM api_keys WHERE id = ?").run(id);

  return c.json({ ok: true });
});

export default keys;
