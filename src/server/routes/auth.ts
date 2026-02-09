import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { getDb } from "../db.ts";
import { generateId } from "../utils/id.ts";
import { hashPassword, verifyPassword } from "../utils/hash.ts";
import { badRequest, conflict, unauthorized } from "../utils/error.ts";

const auth = new Hono();

// GET /api/auth/status
auth.get("/status", (c) => {
  const db = getDb();
  const admin = db
    .query<{ id: string }, []>("SELECT id FROM admin LIMIT 1")
    .get();

  return c.json({ setupCompleted: !!admin });
});

// POST /api/auth/setup
auth.post("/setup", async (c) => {
  const db = getDb();
  const existing = db
    .query<{ id: string }, []>("SELECT id FROM admin LIMIT 1")
    .get();

  if (existing) {
    throw conflict("Password already set");
  }

  const body = await c.req.json<{ password: string }>();

  if (!body.password || body.password.length < 4) {
    throw badRequest("Password must be at least 4 characters");
  }

  const id = generateId("admin");
  const passwordHash = await hashPassword(body.password);

  db.query("INSERT INTO admin (id, password_hash) VALUES (?, ?)").run(
    id,
    passwordHash
  );

  // Auto-login after setup
  const sessionId = generateId("session");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.query("INSERT INTO sessions (id, expires_at) VALUES (?, ?)").run(
    sessionId,
    expiresAt
  );

  setCookie(c, "session", sessionId, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return c.json({ ok: true });
});

// POST /api/auth/login
auth.post("/login", async (c) => {
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

  const sessionId = generateId("session");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.query("INSERT INTO sessions (id, expires_at) VALUES (?, ?)").run(
    sessionId,
    expiresAt
  );

  setCookie(c, "session", sessionId, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return c.json({ ok: true });
});

// POST /api/auth/logout
auth.post("/logout", (c) => {
  deleteCookie(c, "session", { path: "/" });
  return c.json({ ok: true });
});

export default auth;
