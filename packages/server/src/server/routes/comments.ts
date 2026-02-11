import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { getCookie } from "hono/cookie";
import { getDb } from "../db.ts";
import { generateId } from "../utils/id.ts";
import { forbidden, badRequest } from "../utils/error.ts";
import {
  assertExists,
  validateContent,
  normalizeTimestamp,
  validateAuthorType,
} from "../utils/validation.ts";
import { apiOrSessionAuth } from "../middleware/apiOrSession.ts";
import { rateLimit } from "../utils/rateLimit.ts";
import { isAuthValid } from "../utils/auth.ts";
import {
  emitFeedComment,
  onFeedComment,
  emitGlobalEvent,
  onFeedAgentStatus,
  getAgentStatuses,
} from "../utils/events.ts";

const comments = new Hono();

comments.use("*", apiOrSessionAuth);

const createRateLimit = rateLimit({ windowMs: 60000, maxAttempts: 30, keyBy: "auth" });

interface CommentRow {
  id: string;
  post_id: string;
  content: string;
  author_type: "human" | "bot";
  created_by: string | null;
  author_name: string | null;
  created_at: string;
}

interface FeedCommentRow extends CommentRow {
  post_created_by: string | null;
}

// POST /api/posts/:postId/comments
comments.post("/posts/:postId/comments", createRateLimit, async (c) => {
  const { postId } = c.req.param();
  const db = getDb();

  const post = assertExists(
    db.query<{ id: string; feed_id: string; created_by: string | null }, [string]>(
      "SELECT id, feed_id, created_by FROM posts WHERE id = ?"
    ).get(postId),
    "Post not found"
  );

  const body = await c.req.json<{ content?: string }>();
  const content = validateContent(body.content);

  const id = generateId("comment");
  const authorType = c.get("authType") === "api" ? "bot" : "human";
  const createdBy = (c.get("authId") as string | undefined) ?? null;
  const authorName = (c.get("authName") as string | undefined) ?? null;

  const comment = db
    .query<CommentRow, [string, string, string, string, string | null, string | null]>(
      "INSERT INTO comments (id, post_id, content, author_type, created_by, author_name) VALUES (?, ?, ?, ?, ?, ?) RETURNING *"
    )
    .get(id, postId, content, authorType, createdBy, authorName);

  if (comment) {
    emitFeedComment(post.feed_id, comment);

    emitGlobalEvent({
      type: "comment_created",
      id: comment.id,
      post_id: postId,
      feed_id: post.feed_id,
      content: comment.content,
      author_type: comment.author_type,
      created_by: comment.created_by,
      author_name: comment.author_name,
      created_at: comment.created_at,
      post_created_by: post.created_by,
    });
  }

  return c.json(comment, 201);
});

function buildCommentFilters(query: {
  cursor?: string;
  since?: string;
  authorType?: string;
  columnPrefix?: string;
}) {
  const { cursor, since, authorType, columnPrefix: p } = query;
  validateAuthorType(authorType);
  const normalizedSince = since ? normalizeTimestamp(since) : undefined;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (cursor) {
    conditions.push(
      `${p ? `${p}.` : ""}created_at > (SELECT created_at FROM comments WHERE id = ?)`
    );
    params.push(cursor);
  }
  if (normalizedSince) {
    conditions.push(`${p ? `${p}.` : ""}created_at > ?`);
    params.push(normalizedSince);
  }
  if (authorType) {
    conditions.push(`${p ? `${p}.` : ""}author_type = ?`);
    params.push(authorType);
  }

  return { conditions, params };
}

function paginateRows<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]!.id : null;
  return { data, next_cursor: nextCursor, has_more: hasMore };
}

// GET /api/posts/:postId/comments
comments.get("/posts/:postId/comments", (c) => {
  const { postId } = c.req.param();
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const db = getDb();

  assertExists(
    db.query<{ id: string }, [string]>("SELECT id FROM posts WHERE id = ?").get(postId),
    "Post not found"
  );

  const filters = buildCommentFilters({
    cursor: c.req.query("cursor"),
    since: c.req.query("since"),
    authorType: c.req.query("author_type"),
  });

  const conditions = ["post_id = ?", ...filters.conditions];
  const params = [postId, ...filters.params, limit + 1];
  const where = conditions.join(" AND ");

  const rows = db.query<CommentRow, (string | number)[]>(
    `SELECT * FROM comments WHERE ${where} ORDER BY created_at ASC LIMIT ?`
  ).all(...params);

  return c.json(paginateRows(rows, limit));
});

// GET /api/feeds/:feedId/comments
comments.get("/feeds/:feedId/comments", (c) => {
  const { feedId } = c.req.param();
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const db = getDb();

  assertExists(
    db.query<{ id: string }, [string]>("SELECT id FROM feeds WHERE id = ?").get(feedId),
    "Feed not found"
  );

  const filters = buildCommentFilters({
    cursor: c.req.query("cursor"),
    since: c.req.query("since"),
    authorType: c.req.query("author_type"),
    columnPrefix: "c",
  });

  const conditions = ["p.feed_id = ?", ...filters.conditions];
  const params = [feedId, ...filters.params, limit + 1];
  const where = conditions.join(" AND ");

  const rows = db.query<FeedCommentRow, (string | number)[]>(`
    SELECT c.id, c.post_id, c.content, c.author_type, c.created_by, c.author_name,
           c.created_at, p.created_by AS post_created_by
    FROM comments c
    JOIN posts p ON c.post_id = p.id
    WHERE ${where}
    ORDER BY c.created_at ASC
    LIMIT ?
  `).all(...params);

  return c.json(paginateRows(rows, limit));
});

// GET /api/feeds/:feedId/comments/stream (SSE)
comments.get("/feeds/:feedId/comments/stream", async (c) => {
  const { feedId } = c.req.param();
  const authorType = c.req.query("author_type");

  validateAuthorType(authorType);

  const db = getDb();
  assertExists(
    db.query<{ id: string }, [string]>("SELECT id FROM feeds WHERE id = ?").get(feedId),
    "Feed not found"
  );

  // Capture auth credentials before entering the stream
  const authType = c.get("authType") as string;
  const authId = c.get("authId") as string;
  const sessionId = authType === "session" ? getCookie(c, "session") : undefined;

  return streamSSE(c, async (stream) => {
    let aborted = false;
    let authCheckCounter = 0;

    const unsubComment = onFeedComment(feedId, async (data) => {
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

    const unsubAgentStatus = onFeedAgentStatus(feedId, async (data) => {
      if (aborted) return;
      try {
        await stream.writeSSE({
          data: JSON.stringify(data),
          event: data.event,
        });
      } catch {
        aborted = true;
      }
    });

    // Send current active typing statuses on connect
    const activeStatuses = getAgentStatuses(feedId);
    for (const status of activeStatuses) {
      if (aborted) break;
      try {
        await stream.writeSSE({
          data: JSON.stringify(status),
          event: status.event,
        });
      } catch {
        aborted = true;
      }
    }

    stream.onAbort(() => {
      aborted = true;
      unsubComment();
      unsubAgentStatus();
    });

    // Heartbeat + periodic auth re-validation
    while (!aborted) {
      try {
        await stream.writeSSE({ event: "heartbeat", data: "" });
      } catch {
        break;
      }

      // Re-validate auth every ~60s (every 2nd heartbeat at 30s interval)
      authCheckCounter++;
      if (authCheckCounter >= 2) {
        authCheckCounter = 0;
        if (!isAuthValid(authType, authId, sessionId)) {
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 30000));
    }

    unsubComment();
    unsubAgentStatus();
  });
});

// PATCH /api/comments/:id
comments.patch("/comments/:id", async (c) => {
  const { id } = c.req.param();
  const db = getDb();

  const comment = assertExists(
    db.query<CommentRow, [string]>("SELECT * FROM comments WHERE id = ?").get(id),
    "Comment not found"
  );

  // Admin (session) can edit any comment; API key can only edit own comments
  if (c.get("authType") === "api" && comment.created_by !== c.get("authId")) {
    throw forbidden("Cannot edit another agent's comment");
  }

  const body = await c.req.json<{ content?: string }>();
  const content = validateContent(body.content);

  const updated = db
    .query<CommentRow, [string, string]>("UPDATE comments SET content = ? WHERE id = ? RETURNING *")
    .get(content, id);
  return c.json(updated);
});

// DELETE /api/comments/:id (admin only)
comments.delete("/comments/:id", (c) => {
  if (c.get("authType") !== "session") {
    throw forbidden("Only admin can delete comments");
  }

  const { id } = c.req.param();
  const db = getDb();

  assertExists(
    db.query<{ id: string }, [string]>("SELECT id FROM comments WHERE id = ?").get(id),
    "Comment not found"
  );

  db.query("DELETE FROM comments WHERE id = ?").run(id);

  return c.json({ ok: true });
});

export default comments;
