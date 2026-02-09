import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { getDb } from "../db.ts";
import { hashApiKey } from "../utils/hash.ts";
import { unauthorized } from "../utils/error.ts";

export const apiOrSessionAuth = createMiddleware(async (c, next) => {
  // Try API key auth first
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const key = authHeader.slice(7);
    const keyHash = await hashApiKey(key);
    const db = getDb();
    const apiKey = db
      .query<{ id: string }, [string]>(
        "SELECT id FROM api_keys WHERE key_hash = ?"
      )
      .get(keyHash);

    if (apiKey) {
      c.set("authType", "api");
      await next();
      return;
    }

    throw unauthorized("Invalid API key");
  }

  // Fall back to session auth
  const sessionId = getCookie(c, "session");
  if (sessionId) {
    const db = getDb();
    const session = db
      .query<{ id: string }, [string, string]>(
        "SELECT id FROM sessions WHERE id = ? AND expires_at > ?"
      )
      .get(sessionId, new Date().toISOString());

    if (session) {
      c.set("authType", "session");
      await next();
      return;
    }
  }

  throw unauthorized("Authentication required");
});
