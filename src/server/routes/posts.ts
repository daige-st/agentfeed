import { Hono } from "hono";
import { getDb } from "../db.ts";
import { generateId } from "../utils/id.ts";
import { badRequest, notFound } from "../utils/error.ts";
import { apiOrSessionAuth } from "../middleware/apiOrSession.ts";

const posts = new Hono();

posts.use("*", apiOrSessionAuth);

interface PostRow {
  id: string;
  feed_id: string;
  title: string | null;
  content: string | null;
  comment_count: number;
  created_at: string;
}

// POST /api/feeds/:feedId/posts
posts.post("/feeds/:feedId/posts", async (c) => {
  const { feedId } = c.req.param();
  const db = getDb();

  const feed = db
    .query<{ id: string }, [string]>("SELECT id FROM feeds WHERE id = ?")
    .get(feedId);

  if (!feed) {
    throw notFound("Feed not found");
  }

  const body = await c.req.json<{
    title?: string;
    content?: string;
  }>();

  if (!body.title && !body.content) {
    throw badRequest("Title or content is required");
  }

  const id = generateId("post");

  db.query(
    "INSERT INTO posts (id, feed_id, title, content) VALUES (?, ?, ?, ?)"
  ).run(id, feedId, body.title ?? null, body.content ?? null);

  // Update feed's updated_at (millisecond precision for has_updates comparison)
  db.query("UPDATE feeds SET updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?").run(feedId);

  const post = db
    .query<PostRow, [string]>(
      "SELECT p.*, (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count FROM posts p WHERE p.id = ?"
    )
    .get(id);

  return c.json(post, 201);
});

// GET /api/feeds/:feedId/posts
posts.get("/feeds/:feedId/posts", (c) => {
  const { feedId } = c.req.param();
  const cursor = c.req.query("cursor");
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);

  const db = getDb();

  const feed = db
    .query<{ id: string }, [string]>("SELECT id FROM feeds WHERE id = ?")
    .get(feedId);

  if (!feed) {
    throw notFound("Feed not found");
  }

  let rows: PostRow[];

  if (cursor) {
    rows = db
      .query<PostRow, [string, string, number]>(
        "SELECT p.*, (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count FROM posts p WHERE p.feed_id = ? AND p.created_at < (SELECT created_at FROM posts WHERE id = ?) ORDER BY p.created_at DESC LIMIT ?"
      )
      .all(feedId, cursor, limit + 1);
  } else {
    rows = db
      .query<PostRow, [string, number]>(
        "SELECT p.*, (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count FROM posts p WHERE p.feed_id = ? ORDER BY p.created_at DESC LIMIT ?"
      )
      .all(feedId, limit + 1);
  }

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  return c.json({ data, next_cursor: nextCursor, has_more: hasMore });
});

// GET /api/posts/:id
posts.get("/posts/:id", (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const post = db
    .query<PostRow, [string]>(
      "SELECT p.*, (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count FROM posts p WHERE p.id = ?"
    )
    .get(id);

  if (!post) {
    throw notFound("Post not found");
  }

  return c.json(post);
});

// DELETE /api/posts/:id
posts.delete("/posts/:id", (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const post = db
    .query<{ id: string; feed_id: string }, [string]>(
      "SELECT id, feed_id FROM posts WHERE id = ?"
    )
    .get(id);

  if (!post) {
    throw notFound("Post not found");
  }

  db.query("DELETE FROM posts WHERE id = ?").run(id);

  return c.json({ ok: true });
});

export default posts;
