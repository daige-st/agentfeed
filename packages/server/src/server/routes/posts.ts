import { Hono } from "hono";
import { getDb } from "../db.ts";
import { generateId } from "../utils/id.ts";
import { forbidden } from "../utils/error.ts";
import { assertExists, validateContent } from "../utils/validation.ts";
import { apiOrSessionAuth } from "../middleware/apiOrSession.ts";
import { rateLimit } from "../utils/rateLimit.ts";
import { emitGlobalEvent } from "../utils/events.ts";
import type { AppEnv } from "../types.ts";

const posts = new Hono<AppEnv>();

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

// Shared fragments
const COMMENT_AGG = `LEFT JOIN (
  SELECT post_id, COUNT(*) AS total_comments, MAX(created_at) AS latest_comment_at
  FROM comments GROUP BY post_id
) ca ON ca.post_id = p.id`;

const RECENT_COMMENTERS = `(SELECT GROUP_CONCAT(info, '|') FROM (
  SELECT DISTINCT COALESCE(author_name, CASE WHEN author_type='bot' THEN 'Bot' ELSE 'Admin' END) || ':' || author_type AS info
  FROM comments WHERE post_id = p.id ORDER BY created_at DESC LIMIT 3
))`;

const POST_WITH_COUNT = `SELECT p.*,
  COALESCE(ca.total_comments, 0) AS comment_count,
  ${RECENT_COMMENTERS} AS recent_commenters
FROM posts p
${COMMENT_AGG}`;

interface InboxRow extends PostRow {
  feed_name: string;
  is_new_post: 0 | 1;
  new_comment_count: number;
  latest_activity: string;
}

const INBOX_SELECT = `SELECT p.*,
  COALESCE(ca.total_comments, 0) AS comment_count,
  ${RECENT_COMMENTERS} AS recent_commenters,
  f.name AS feed_name,
  CASE WHEN pv.post_id IS NULL THEN 1 ELSE 0 END AS is_new_post,
  CASE
    WHEN pv.post_id IS NULL THEN COALESCE(ca.total_comments, 0)
    ELSE (SELECT COUNT(*) FROM comments WHERE post_id = p.id AND created_at > pv.last_viewed_at)
  END AS new_comment_count,
  COALESCE(ca.latest_comment_at, p.created_at) AS latest_activity
FROM posts p
${COMMENT_AGG}
JOIN feeds f ON p.feed_id = f.id
LEFT JOIN post_views pv ON p.id = pv.post_id`;

const UNREAD_WHERE = `(pv.post_id IS NULL OR ca.latest_comment_at > pv.last_viewed_at)`;

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

// POST /api/posts/:id/view — mark post as read
posts.post("/posts/:id/view", (c) => {
  const { id } = c.req.param();
  const db = getDb();

  assertExists(
    db.query<{ id: string }, [string]>("SELECT id FROM posts WHERE id = ?").get(id),
    "Post not found"
  );

  db.query(
    `INSERT INTO post_views (post_id, last_viewed_at) VALUES (?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
     ON CONFLICT(post_id) DO UPDATE SET last_viewed_at = strftime('%Y-%m-%d %H:%M:%f', 'now')`
  ).run(id);

  return c.json({ ok: true });
});

// GET /api/inbox — unread or all posts with activity info
posts.get("/inbox", (c) => {
  const cursor = c.req.query("cursor");
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const mode = c.req.query("mode") ?? "unread";

  const db = getDb();

  const innerWhere = mode !== "all" ? ` WHERE ${UNREAD_WHERE}` : "";
  const outerConditions: string[] = [];
  const params: (string | number)[] = [];

  if (cursor) {
    outerConditions.push("sub.latest_activity < ?");
    params.push(cursor);
  }
  params.push(limit + 1);

  const outerWhere = outerConditions.length > 0 ? ` WHERE ${outerConditions.join(" AND ")}` : "";

  const rows = db
    .query<InboxRow, (string | number)[]>(
      `SELECT * FROM (${INBOX_SELECT}${innerWhere}) sub${outerWhere} ORDER BY sub.latest_activity DESC LIMIT ?`
    )
    .all(...params);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.latest_activity : null;

  return c.json({ data, next_cursor: nextCursor, has_more: hasMore });
});

// POST /api/inbox/mark-all-read
posts.post("/inbox/mark-all-read", (c) => {
  const db = getDb();

  db.query(
    `INSERT INTO post_views (post_id, last_viewed_at)
     SELECT id, strftime('%Y-%m-%d %H:%M:%f', 'now') FROM posts
     ON CONFLICT(post_id) DO UPDATE SET last_viewed_at = strftime('%Y-%m-%d %H:%M:%f', 'now')`
  ).run();

  db.query(
    `INSERT INTO feed_views (feed_id, last_viewed_at)
     SELECT id, strftime('%Y-%m-%d %H:%M:%f', 'now') FROM feeds
     ON CONFLICT(feed_id) DO UPDATE SET last_viewed_at = strftime('%Y-%m-%d %H:%M:%f', 'now')`
  ).run();

  return c.json({ ok: true });
});

export default posts;
