import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import type { Context } from "hono";
import { getDb } from "../db.ts";
import { generateId } from "../utils/id.ts";
import { hashPassword, verifyPassword } from "../utils/hash.ts";
import { badRequest, conflict, unauthorized } from "../utils/error.ts";
import { apiOrSessionAuth } from "../middleware/apiOrSession.ts";
import { rateLimit } from "../utils/rateLimit.ts";

const auth = new Hono();

const authRateLimit = rateLimit({ windowMs: 60000, maxAttempts: 5 });

const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

function isSecureContext(c: { req: { url: string; header: (name: string) => string | undefined } }): boolean {
  if (c.req.url.startsWith("https://")) return true;
  if (c.req.header("x-forwarded-proto") === "https") return true;
  return process.env.NODE_ENV === "production";
}

function createSessionAndSetCookie(c: Context): void {
  const db = getDb();
  const sessionId = generateId("session");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();

  db.query("INSERT INTO sessions (id, expires_at) VALUES (?, ?)").run(
    sessionId,
    expiresAt
  );

  setCookie(c, "session", sessionId, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    secure: isSecureContext(c),
  });
}

// GET /api/auth/status
auth.get("/status", (c) => {
  const db = getDb();
  const admin = db
    .query<{ id: string }, []>("SELECT id FROM admin LIMIT 1")
    .get();

  return c.json({ setupCompleted: !!admin });
});

// POST /api/auth/setup
auth.post("/setup", authRateLimit, async (c) => {
  const db = getDb();
  const existing = db
    .query<{ id: string }, []>("SELECT id FROM admin LIMIT 1")
    .get();

  if (existing) {
    throw conflict("Password already set");
  }

  const body = await c.req.json<{ password: string }>();

  if (!body.password || body.password.length < 8 || body.password.length > 128) {
    throw badRequest("Password must be between 8 and 128 characters");
  }

  const id = generateId("admin");
  const passwordHash = await hashPassword(body.password);

  db.query("INSERT INTO admin (id, password_hash) VALUES (?, ?)").run(
    id,
    passwordHash
  );

  createSessionAndSetCookie(c);

  return c.json({ ok: true });
});

// POST /api/auth/login
auth.post("/login", authRateLimit, async (c) => {
  const db = getDb();
  const admin = db
    .query<{ password_hash: string }, []>(
      "SELECT password_hash FROM admin LIMIT 1"
    )
    .get();

  if (!admin) {
    throw badRequest("Setup not completed");
  }

  const body = await c.req.json<{ password: string }>();

  const valid = await verifyPassword(body.password, admin.password_hash);
  if (!valid) {
    throw unauthorized("Invalid password");
  }

  createSessionAndSetCookie(c);

  return c.json({ ok: true });
});

// POST /api/auth/logout
auth.post("/logout", (c) => {
  const sessionId = getCookie(c, "session");
  if (sessionId) {
    const db = getDb();
    db.query("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }

  deleteCookie(c, "session", { path: "/" });
  return c.json({ ok: true });
});

// GET /api/auth/me
auth.get("/me", apiOrSessionAuth, (c) => {
  const authType = c.get("authType") as string;
  const authId = c.get("authId") as string;
  const authName = c.get("authName") as string;

  return c.json({ id: authId, name: authName, type: authType });
});

export default auth;
