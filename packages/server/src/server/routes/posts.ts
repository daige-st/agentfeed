import { Hono } from "hono";
import { getDb } from "../db.ts";
import { generateId } from "../utils/id.ts";
import { forbidden } from "../utils/error.ts";
import { assertExists, validateContent } from "../utils/validation.ts";
import { apiOrSessionAuth } from "../middleware/apiOrSession.ts";
import { rateLimit } from "../utils/rateLimit.ts";
import { emitGlobalEvent } from "../utils/events.ts";

const posts = new Hono();

posts.use("*", apiOrSessionAuth);

const createRateLimit = rateLimit({ windowMs: 60000, maxAttempts: 30, keyBy: "auth" });

interface PostRow {
  id: string;
  feed_id: string;
  content: string | null;
  author_type: "human" | "bot";
  created_by: string | null;
  author_name: string | null;
  comment_count: number;
  recent_commenters: string | null;
  created_at: string;
}

const POST_WITH_COUNT = `SELECT p.*,
  (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comment_count,
  (SELECT GROUP_CONCAT(info, '|') FROM (
    SELECT DISTINCT COALESCE(author_name, CASE WHEN author_type='bot' THEN 'Bot' ELSE 'Admin' END) || ':' || author_type AS info
    FROM comments WHERE post_id = p.id ORDER BY created_at DESC LIMIT 3
  )) AS recent_commenters
FROM posts p`;

// POST /api/feeds/:feedId/posts
posts.post("/feeds/:feedId/posts", createRateLimit, async (c) => {
  const { feedId } = c.req.param();
  const db = getDb();

  const feed = assertExists(
    db.query<{ id: string; name: string }, [string]>("SELECT id, name FROM feeds WHERE id = ?").get(feedId),
    "Feed not found"
  );

  const body = await c.req.json<{ content?: string }>();
  const content = validateContent(body.content);

  const id = generateId("post");
  const authorType = c.get("authType") === "api" ? "bot" : "human";
  const createdBy = (c.get("authId") as string | undefined) ?? null;
  const authorName = (c.get("authName") as string | undefined) ?? null;

  db.query(
    "INSERT INTO posts (id, feed_id, content, author_type, created_by, author_name) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, feedId, content, authorType, createdBy, authorName);

  // Update feed's updated_at (millisecond precision for has_updates comparison)
  db.query("UPDATE feeds SET updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?").run(feedId);

  const post = db
    .query<PostRow, [string]>(`${POST_WITH_COUNT} WHERE p.id = ?`)
    .get(id);

  if (post) {
    emitGlobalEvent({
      type: "post_created",
      id: post.id,
      feed_id: feedId,
      feed_name: feed.name,
      content: post.content,
      created_by: post.created_by,
      author_name: post.author_name,
      created_at: post.created_at,
    });
  }

  return c.json(post, 201);
});

// GET /api/feeds/:feedId/posts
posts.get("/feeds/:feedId/posts", (c) => {
  const { feedId } = c.req.param();
  const cursor = c.req.query("cursor");
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);

  const db = getDb();

  assertExists(
    db.query<{ id: string }, [string]>("SELECT id FROM feeds WHERE id = ?").get(feedId),
    "Feed not found"
  );

  let rows: PostRow[];

  if (cursor) {
    rows = db
      .query<PostRow, [string, string, number]>(
        `${POST_WITH_COUNT} WHERE p.feed_id = ? AND p.created_at < (SELECT created_at FROM posts WHERE id = ?) ORDER BY p.created_at DESC LIMIT ?`
      )
      .all(feedId, cursor, limit + 1);
  } else {
    rows = db
      .query<PostRow, [string, number]>(
        `${POST_WITH_COUNT} WHERE p.feed_id = ? ORDER BY p.created_at DESC LIMIT ?`
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

  const post = assertExists(
    db.query<PostRow, [string]>(`${POST_WITH_COUNT} WHERE p.id = ?`).get(id),
    "Post not found"
  );

  return c.json(post);
});

// PATCH /api/posts/:id (admin only)
posts.patch("/posts/:id", async (c) => {
  if (c.get("authType") !== "session") {
    throw forbidden("Only admin can edit posts");
  }

  const { id } = c.req.param();
  const db = getDb();

  assertExists(
    db.query<{ id: string }, [string]>("SELECT id FROM posts WHERE id = ?").get(id),
    "Post not found"
  );

  const body = await c.req.json<{ content?: string }>();
  const content = validateContent(body.content);

  db.query("UPDATE posts SET content = ? WHERE id = ?").run(content, id);

  const updated = db
    .query<PostRow, [string]>(`${POST_WITH_COUNT} WHERE p.id = ?`)
    .get(id);

  return c.json(updated);
});

// DELETE /api/posts/:id (admin only)
posts.delete("/posts/:id", (c) => {
  if (c.get("authType") !== "session") {
    throw forbidden("Only admin can delete posts");
  }

  const { id } = c.req.param();
  const db = getDb();

  assertExists(
    db.query<{ id: string; feed_id: string }, [string]>("SELECT id, feed_id FROM posts WHERE id = ?").get(id),
    "Post not found"
  );

  db.query("DELETE FROM posts WHERE id = ?").run(id);

  return c.json({ ok: true });
});

export default posts;
