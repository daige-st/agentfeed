import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getDb } from "../db.ts";
import { generateId } from "../utils/id.ts";
import { badRequest, notFound } from "../utils/error.ts";
import { apiOrSessionAuth } from "../middleware/apiOrSession.ts";
import { emitFeedComment, onFeedComment } from "../utils/events.ts";

const comments = new Hono();

comments.use("*", apiOrSessionAuth);

interface CommentRow {
  id: string;
  post_id: string;
  content: string;
  author_type: "human" | "bot";
  created_at: string;
}

interface FeedCommentRow extends CommentRow {
  post_title: string | null;
}

// POST /api/posts/:postId/comments
comments.post("/posts/:postId/comments", async (c) => {
  const { postId } = c.req.param();
  const db = getDb();

  const post = db
    .query<{ id: string; feed_id: string; title: string | null }, [string]>(
      "SELECT id, feed_id, title FROM posts WHERE id = ?"
    )
    .get(postId);

  if (!post) {
    throw notFound("Post not found");
  }

  const body = await c.req.json<{ content?: string }>();

  if (!body.content?.trim()) {
    throw badRequest("Content is required");
  }

  const id = generateId("comment");
  const authorType = c.get("authType") === "api" ? "bot" : "human";

  db.query(
    "INSERT INTO comments (id, post_id, content, author_type) VALUES (?, ?, ?, ?)"
  ).run(id, postId, body.content.trim(), authorType);

  const comment = db
    .query<CommentRow, [string]>("SELECT * FROM comments WHERE id = ?")
    .get(id);

  if (comment) {
    emitFeedComment(post.feed_id, {
      ...comment,
      post_title: post.title,
    });
  }

  return c.json(comment, 201);
});

// GET /api/posts/:postId/comments
comments.get("/posts/:postId/comments", (c) => {
  const { postId } = c.req.param();
  const cursor = c.req.query("cursor");
  const since = c.req.query("since");
  const authorType = c.req.query("author_type");
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);

  if (authorType && authorType !== "human" && authorType !== "bot") {
    throw badRequest("author_type must be 'human' or 'bot'");
  }

  // Normalize ISO 8601 to SQLite datetime format: "2025-01-15T10:30:00Z" → "2025-01-15 10:30:00"
  let normalizedSince: string | undefined;
  if (since) {
    const parsed = new Date(since);
    if (isNaN(parsed.getTime())) {
      throw badRequest("since must be a valid ISO 8601 timestamp");
    }
    normalizedSince = parsed.toISOString().replace("T", " ").replace("Z", "").slice(0, 19);
  }

  const db = getDb();

  const post = db
    .query<{ id: string }, [string]>("SELECT id FROM posts WHERE id = ?")
    .get(postId);

  if (!post) {
    throw notFound("Post not found");
  }

  const conditions: string[] = ["post_id = ?"];
  const params: (string | number)[] = [postId];

  if (cursor) {
    conditions.push(
      "created_at > (SELECT created_at FROM comments WHERE id = ?)"
    );
    params.push(cursor);
  }

  if (normalizedSince) {
    conditions.push("created_at > ?");
    params.push(normalizedSince);
  }

  if (authorType) {
    conditions.push("author_type = ?");
    params.push(authorType);
  }

  params.push(limit + 1);

  const where = conditions.join(" AND ");
  const sql = `SELECT * FROM comments WHERE ${where} ORDER BY created_at ASC LIMIT ?`;

  const rows = db.query<CommentRow, (string | number)[]>(sql).all(...params);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  return c.json({ data, next_cursor: nextCursor, has_more: hasMore });
});

// GET /api/feeds/:feedId/comments
comments.get("/feeds/:feedId/comments", (c) => {
  const { feedId } = c.req.param();
  const cursor = c.req.query("cursor");
  const since = c.req.query("since");
  const authorType = c.req.query("author_type");
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);

  if (authorType && authorType !== "human" && authorType !== "bot") {
    throw badRequest("author_type must be 'human' or 'bot'");
  }

  let normalizedSince: string | undefined;
  if (since) {
    const parsed = new Date(since);
    if (isNaN(parsed.getTime())) {
      throw badRequest("since must be a valid ISO 8601 timestamp");
    }
    normalizedSince = parsed.toISOString().replace("T", " ").replace("Z", "").slice(0, 19);
  }

  const db = getDb();

  const feed = db
    .query<{ id: string }, [string]>("SELECT id FROM feeds WHERE id = ?")
    .get(feedId);

  if (!feed) {
    throw notFound("Feed not found");
  }

  const conditions: string[] = ["p.feed_id = ?"];
  const params: (string | number)[] = [feedId];

  if (cursor) {
    conditions.push(
      "c.created_at > (SELECT created_at FROM comments WHERE id = ?)"
    );
    params.push(cursor);
  }

  if (normalizedSince) {
    conditions.push("c.created_at > ?");
    params.push(normalizedSince);
  }

  if (authorType) {
    conditions.push("c.author_type = ?");
    params.push(authorType);
  }

  params.push(limit + 1);

  const where = conditions.join(" AND ");
  const sql = `
    SELECT c.id, c.post_id, c.content, c.author_type, c.created_at, p.title AS post_title
    FROM comments c
    JOIN posts p ON c.post_id = p.id
    WHERE ${where}
    ORDER BY c.created_at ASC
    LIMIT ?
  `;

  const rows = db.query<FeedCommentRow, (string | number)[]>(sql).all(...params);

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;

  return c.json({ data, next_cursor: nextCursor, has_more: hasMore });
});

// GET /api/feeds/:feedId/comments/stream (SSE)
comments.get("/feeds/:feedId/comments/stream", async (c) => {
  const { feedId } = c.req.param();
  const authorType = c.req.query("author_type");

  if (authorType && authorType !== "human" && authorType !== "bot") {
    throw badRequest("author_type must be 'human' or 'bot'");
  }

  const db = getDb();
  const feed = db
    .query<{ id: string }, [string]>("SELECT id FROM feeds WHERE id = ?")
    .get(feedId);

  if (!feed) {
    throw notFound("Feed not found");
  }

  return streamSSE(c, async (stream) => {
    let aborted = false;

    const unsubscribe = onFeedComment(feedId, async (data) => {
      if (aborted) return;
      if (authorType && data.author_type !== authorType) return;
      try {
        await stream.writeSSE({
          data: JSON.stringify(data),
          event: "comment",
          id: data.id,
        });
      } catch {
        aborted = true;
      }
    });

    stream.onAbort(() => {
      aborted = true;
      unsubscribe();
    });

    // Heartbeat to keep connection alive
    while (!aborted) {
      try {
        await stream.writeSSE({ event: "heartbeat", data: "" });
      } catch {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }

    unsubscribe();
  });
});

// DELETE /api/comments/:id
comments.delete("/comments/:id", (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const comment = db
    .query<{ id: string }, [string]>("SELECT id FROM comments WHERE id = ?")
    .get(id);

  if (!comment) {
    throw notFound("Comment not found");
  }

  db.query("DELETE FROM comments WHERE id = ?").run(id);

  return c.json({ ok: true });
});

export default comments;
