import { Hono } from "hono";
import { getDb } from "../db.ts";
import { generateId } from "../utils/id.ts";
import { badRequest, forbidden } from "../utils/error.ts";
import { assertExists } from "../utils/validation.ts";
import { apiOrSessionAuth } from "../middleware/apiOrSession.ts";
import type { AppEnv } from "../types.ts";

const feeds = new Hono<AppEnv>();

feeds.use("*", apiOrSessionAuth);

interface FeedRow {
  id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
}

interface FeedWithUpdates extends FeedRow {
  has_updates: 0 | 1;
}

// POST /api/feeds
feeds.post("/", async (c) => {
  const body = await c.req.json<{ name: string }>();

  const name = body.name?.trim() || "Untitled";

  if (name.length > 100) {
    throw badRequest("Feed name must be 100 characters or less");
  }

  const id = generateId("feed");
  const db = getDb();

  const maxPos = db
    .query<{ max_pos: number | null }, []>(
      "SELECT MAX(position) as max_pos FROM feeds"
    )
    .get();
  const position = (maxPos?.max_pos ?? -1) + 1;

  const feed = db
    .query<FeedRow, [string, string, number]>(
      "INSERT INTO feeds (id, name, position) VALUES (?, ?, ?) RETURNING *"
    )
    .get(id, name, position);

  return c.json(feed, 201);
});

// GET /api/feeds
feeds.get("/", (c) => {
  const db = getDb();
  const rows = db
    .query<FeedWithUpdates, []>(
      `SELECT f.*,
        CASE WHEN fv.last_viewed_at IS NULL OR f.updated_at > fv.last_viewed_at THEN 1 ELSE 0 END as has_updates
      FROM feeds f
      LEFT JOIN feed_views fv ON f.id = fv.feed_id
      ORDER BY f.position ASC`
    )
    .all();

  return c.json(rows);
});

// PUT /api/feeds/reorder (admin only)
feeds.put("/reorder", async (c) => {
  if (c.get("authType") !== "session") {
    throw forbidden("Only admin can reorder feeds");
  }

  const body = await c.req.json<{ order: string[] }>();

  if (!Array.isArray(body.order) || body.order.length === 0) {
    throw badRequest("order must be a non-empty array of feed IDs");
  }

  const db = getDb();
  const stmt = db.query(
    "UPDATE feeds SET position = ? WHERE id = ?"
  );

  for (let i = 0; i < body.order.length; i++) {
    stmt.run(i, body.order[i]!);
  }

  return c.json({ ok: true });
});

// GET /api/feeds/:id
feeds.get("/:id", (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const feed = assertExists(
    db.query<FeedRow, [string]>("SELECT * FROM feeds WHERE id = ?").get(id),
    "Feed not found"
  );

  return c.json(feed);
});

// POST /api/feeds/:id/view
feeds.post("/:id/view", (c) => {
  const { id } = c.req.param();
  const db = getDb();

  assertExists(
    db.query<{ id: string }, [string]>("SELECT id FROM feeds WHERE id = ?").get(id),
    "Feed not found"
  );

  db.query(
    `INSERT INTO feed_views (feed_id, last_viewed_at) VALUES (?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
     ON CONFLICT(feed_id) DO UPDATE SET last_viewed_at = strftime('%Y-%m-%d %H:%M:%f', 'now')`
  ).run(id);

  return c.json({ ok: true });
});

// PATCH /api/feeds/:id (admin only)
feeds.patch("/:id", async (c) => {
  if (c.get("authType") !== "session") {
    throw forbidden("Only admin can update feeds");
  }

  const { id } = c.req.param();
  const body = await c.req.json<{ name?: string }>();

  const db = getDb();
  const existing = assertExists(
    db.query<FeedRow, [string]>("SELECT * FROM feeds WHERE id = ?").get(id),
    "Feed not found"
  );

  const name = body.name?.trim() ?? existing.name;

  if (name.length > 100) {
    throw badRequest("Feed name must be 100 characters or less");
  }

  const feed = db
    .query<FeedRow, [string, string]>(
      "UPDATE feeds SET name = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ? RETURNING *"
    )
    .get(name, id);

  return c.json(feed);
});

// GET /api/feeds/:id/participants — Bots that have posted or commented in this feed
feeds.get("/:id/participants", (c) => {
  const { id } = c.req.param();
  const db = getDb();

  assertExists(
    db.query<{ id: string }, [string]>("SELECT id FROM feeds WHERE id = ?").get(id),
    "Feed not found"
  );

  // Get distinct bot authors from posts and comments in this feed.
  // Resolve af_xxx (API key) → ag_xxx (registered agent) via agents table.
  const rows = db
    .query<{ agent_id: string; agent_name: string }, [string, string]>(
      `SELECT
        COALESCE(ag.id, sub.created_by) AS agent_id,
        COALESCE(ag.name, sub.author_name) AS agent_name
      FROM (
        SELECT created_by, author_name FROM posts
          WHERE feed_id = ? AND created_by IS NOT NULL AND (created_by LIKE 'af_%' OR created_by LIKE 'ag_%')
        UNION
        SELECT c.created_by, c.author_name FROM comments c
          JOIN posts p ON c.post_id = p.id
          WHERE p.feed_id = ? AND c.author_type = 'bot' AND c.created_by IS NOT NULL
      ) sub
      LEFT JOIN agents ag ON sub.created_by = ag.id OR sub.created_by = ag.api_key_id
      GROUP BY COALESCE(ag.id, sub.created_by)`
    )
    .all(id, id);

  return c.json({ data: rows });
});

// DELETE /api/feeds/:id (admin only)
feeds.delete("/:id", (c) => {
  if (c.get("authType") !== "session") {
    throw forbidden("Only admin can delete feeds");
  }

  const { id } = c.req.param();
  const db = getDb();

  assertExists(
    db.query<{ id: string }, [string]>("SELECT id FROM feeds WHERE id = ?").get(id),
    "Feed not found"
  );

  db.query("DELETE FROM feeds WHERE id = ?").run(id);

  return c.json({ ok: true });
});

export default feeds;
