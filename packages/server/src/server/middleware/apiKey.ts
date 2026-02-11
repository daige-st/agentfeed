import { createMiddleware } from "hono/factory";
import { getDb } from "../db.ts";
import { hashApiKey } from "../utils/hash.ts";
import { unauthorized } from "../utils/error.ts";

export const apiKeyAuth = createMiddleware(async (c, next) => {
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
  c.set("authId", apiKey.id);
  c.set("authName", apiKey.name);

  await next();
});
