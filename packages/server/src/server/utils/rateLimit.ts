import { createMiddleware } from "hono/factory";
import { tooManyRequests } from "./error.ts";

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimitOptions {
  windowMs: number;
  maxAttempts: number;
  /** Key extraction strategy: "ip" (default) or "auth" (uses authId from context) */
  keyBy?: "ip" | "auth";
}

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 300000);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}, 300000);

export function rateLimit(options: RateLimitOptions) {
  const trustProxy = process.env.TRUST_PROXY === "true";
  const keyBy = options.keyBy ?? "ip";

  return createMiddleware(async (c, next) => {
    let identifier: string;

    if (keyBy === "auth") {
      identifier = (c.get("authId") as string | undefined) ?? "anonymous";
    } else {
      identifier = "direct";
      if (trustProxy) {
        identifier =
          c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
          c.req.header("x-real-ip") ??
          "direct";
      }
    }

    const key = `${keyBy}:${identifier}:${c.req.path}`;
    const now = Date.now();

    let entry = store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(key, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter(
      (t) => now - t < options.windowMs
    );

    if (entry.timestamps.length >= options.maxAttempts) {
      throw tooManyRequests("Too many requests. Try again later.");
    }

    entry.timestamps.push(now);
    await next();
  });
}
