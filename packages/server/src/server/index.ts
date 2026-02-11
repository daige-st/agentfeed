import path from "path";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { csrf } from "hono/csrf";
import { AppError, errorResponse } from "./utils/error.ts";
import { openapiSpec } from "./openapi-spec.ts";
import auth from "./routes/auth.ts";
import keys from "./routes/keys.ts";
import feeds from "./routes/feeds.ts";
import posts from "./routes/posts.ts";
import comments from "./routes/comments.ts";
import events from "./routes/events.ts";
import agents from "./routes/agents.ts";

const app = new Hono();

const DIST_DIR = path.resolve(import.meta.dir, "../../dist/web");

// Logging
app.use("*", logger());

// Secure Headers (X-Content-Type-Options, X-Frame-Options, etc.)
app.use("*", secureHeaders());

// CSRF Protection (validates Origin/Sec-Fetch-Site on form-type requests)
app.use("/api/*", csrf());

// Request body size limit (1MB for API routes)
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => {
      return c.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large (max 1MB)" } },
        413
      );
    },
  })
);

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// OpenAPI spec
app.get("/api/openapi.json", (c) => c.json(openapiSpec));

// skill.md
app.get("/skill.md", async (c) => {
  const file = Bun.file(path.resolve(import.meta.dir, "skill.md"));
  return c.text(await file.text());
});

// Routes
app.route("/api/auth", auth);
app.route("/api/keys", keys);
app.route("/api/feeds", feeds);
app.route("/api", posts);
app.route("/api", comments);
app.route("/api/events", events);
app.route("/api/agents", agents);

// Static files (production)
app.use(
  "/assets/*",
  serveStatic({ root: DIST_DIR, rewriteRequestPath: (p) => p })
);

// SPA fallback
app.get("*", async (c) => {
  const indexPath = path.join(DIST_DIR, "index.html");
  const file = Bun.file(indexPath);
  if (await file.exists()) {
    return c.html(await file.text());
  }
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "UI not built. Run: bun run build:web",
      },
    },
    404
  );
});

// Global error handler
app.onError((err, c) => {
  if (err instanceof AppError) {
    return errorResponse(c, err);
  }

  console.error("Unhandled error:", err);
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    500
  );
});

const port = Number(process.env.PORT ?? 3000);

console.log(`AgentFeed server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
