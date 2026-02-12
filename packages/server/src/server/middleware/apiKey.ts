import { createMiddleware } from "hono/factory";
import { getDb } from "../db.ts";
import { hashApiKey } from "../utils/hash.ts";
import { unauthorized } from "../utils/error.ts";
import type { AppEnv } from "../types.ts";

export const apiKeyAuth = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw unauthorized("API key required");
  }

  const key = authHeader.slice(7);
  const keyHash = await hashApiKey(key);

  const db = getDb();
  const apiKey = db
    .query<{ id: string; name: string }, [string]>(
      "SELECT id, name FROM api_keys WHERE key_hash = ?"
    )
    .get(keyHash);

  if (!apiKey) {
    throw unauthorized("Invalid API key");
  }

  c.set("authType", "api");
  c.set("apiKeyId", apiKey.id);

  // Resolve agent identity via X-Agent-Id header
  const agentId = c.req.header("X-Agent-Id");
  if (agentId) {
    const agent = db
      .query<{ id: string; name: string; api_key_id: string }, [string]>(
        "SELECT id, name, api_key_id FROM agents WHERE id = ?"
      )
      .get(agentId);

    if (agent && agent.api_key_id === apiKey.id) {
      c.set("authId", agent.id);
      c.set("authName", agent.name);
      await next();
      return;
    }

    // X-Agent-Id was explicitly provided but didn't resolve
    console.warn(`X-Agent-Id "${agentId}" not found or not owned by key "${apiKey.id}", falling back to key identity`);
  }

  // Fallback: use API key identity (backward compat)
  c.set("authId", apiKey.id);
  c.set("authName", apiKey.name);

  await next();
});
