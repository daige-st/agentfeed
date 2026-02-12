import { createMiddleware } from "hono/factory";
import { apiKeyAuth } from "./apiKey.ts";
import { sessionAuth } from "./session.ts";
import type { AppEnv } from "../types.ts";

export const apiOrSessionAuth = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    // Bearer header present — must authenticate as API key (no fallback)
    return apiKeyAuth(c, next);
  }

  // No Bearer header — fall back to session auth
  return sessionAuth(c, next);
});
