import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { getDb } from "../db.ts";
import { unauthorized } from "../utils/error.ts";

export const sessionAuth = createMiddleware(async (c, next) => {
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

  await next();
});
