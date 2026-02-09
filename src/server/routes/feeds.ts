import { Hono } from "hono";
import { getDb } from "../db.ts";
import { generateId } from "../utils/id.ts";
import { badRequest, notFound } from "../utils/error.ts";
import { apiOrSessionAuth } from "../middleware/apiOrSession.ts";

const feeds = new Hono();

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

  const id = generateId("feed");
  const db = getDb();

  const maxPos = db
    .query<{ max_pos: number | null }, []>(
      "SELECT MAX(position) as max_pos FROM feeds"
    )
    .get();
  const position = (maxPos?.max_pos ?? -1) + 1;

  db.query(
    "INSERT INTO feeds (id, name, position) VALUES (?, ?, ?)"
  ).run(id, name, position);

  const feed = db
    .query<FeedRow, [string]>("SELECT * FROM feeds WHERE id = ?")
    .get(id);

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

// PUT /api/feeds/reorder
feeds.put("/reorder", async (c) => {
  const body = await c.req.json<{ order: string[] }>();

  if (!Array.isArray(body.order) || body.order.length === 0) {
    throw badRequest("order must be a non-empty array of feed IDs");
  }

  const db = getDb();
  const stmt = db.query(
    "UPDATE feeds SET position = ? WHERE id = ?"
  );

  for (let i = 0; i < body.order.length; i++) {
    stmt.run(i, body.order[i]);
  }

  return c.json({ ok: true });
});

// GET /api/feeds/:id
feeds.get("/:id", (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const feed = db
    .query<FeedRow, [string]>("SELECT * FROM feeds WHERE id = ?")
    .get(id);

  if (!feed) {
    throw notFound("Feed not found");
  }

  return c.json(feed);
});

// POST /api/feeds/:id/view
feeds.post("/:id/view", (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const feed = db
    .query<{ id: string }, [string]>("SELECT id FROM feeds WHERE id = ?")
    .get(id);

  if (!feed) {
    throw notFound("Feed not found");
  }

  db.query(
    `INSERT INTO feed_views (feed_id, last_viewed_at) VALUES (?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
     ON CONFLICT(feed_id) DO UPDATE SET last_viewed_at = strftime('%Y-%m-%d %H:%M:%f', 'now')`
  ).run(id);

  return c.json({ ok: true });
});

// PATCH /api/feeds/:id
feeds.patch("/:id", async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json<{ name?: string }>();

  const db = getDb();
  const existing = db
    .query<FeedRow, [string]>("SELECT * FROM feeds WHERE id = ?")
    .get(id);

  if (!existing) {
    throw notFound("Feed not found");
  }

  const name = body.name?.trim() ?? existing.name;

  db.query(
    "UPDATE feeds SET name = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(name, id);

  const feed = db
    .query<FeedRow, [string]>("SELECT * FROM feeds WHERE id = ?")
    .get(id);

  return c.json(feed);
});

// DELETE /api/feeds/:id
feeds.delete("/:id", (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const existing = db
    .query<{ id: string }, [string]>("SELECT id FROM feeds WHERE id = ?")
    .get(id);

  if (!existing) {
    throw notFound("Feed not found");
  }

  db.query("DELETE FROM feeds WHERE id = ?").run(id);

  return c.json({ ok: true });
});

export default feeds;
