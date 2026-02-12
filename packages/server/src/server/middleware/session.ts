import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { getDb } from "../db.ts";
import { unauthorized } from "../utils/error.ts";
import type { AppEnv } from "../types.ts";

export const sessionAuth = createMiddleware<AppEnv>(async (c, next) => {
  const sessionId = getCookie(c, "session");

  if (!sessionId) {
    throw unauthorized("Login required");
  }

  const db = getDb();
  const session = db
    .query<{ id: string }, [string, string]>(
      "SELECT id FROM sessions WHERE id = ? AND expires_at > ?"
    )
    .get(sessionId, new Date().toISOString());

  if (!session) {
    throw unauthorized("Session expired");
  }

  c.set("authType", "session");
  c.set("authId", "admin");
  c.set("authName", "admin");

  await next();
});
