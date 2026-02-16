import { Hono } from "hono";
import { getDb } from "../db.js";
import { apiOrSessionAuth } from "../middleware/apiOrSession.js";
import { sessionAuth } from "../middleware/session.js";
import { errorResponse } from "../utils/error.js";
import type { Database } from "bun:sqlite";

const app = new Hono();

interface SystemSettings {
  bot_mention_limit: number;
  bot_mention_window_minutes: number;
}

interface SettingsRow {
  bot_mention_limit: number;
  bot_mention_window_minutes: number;
}

// GET /api/settings — Get system settings
app.get("/", apiOrSessionAuth, (c) => {
  const db = getDb();
  const row = db.query<SettingsRow, []>(
    "SELECT bot_mention_limit, bot_mention_window_minutes FROM admin LIMIT 1"
  ).get();

  if (!row) {
    return c.json(errorResponse("SETTINGS_NOT_FOUND", "Settings not found"), 404);
  }

  const settings: SystemSettings = {
    bot_mention_limit: row.bot_mention_limit,
    bot_mention_window_minutes: row.bot_mention_window_minutes,
  };

  return c.json(settings);
});

// PUT /api/settings — Update system settings
app.put("/", sessionAuth, async (c) => {
  const body = await c.req.json();
  const { bot_mention_limit, bot_mention_window_minutes } = body;

  if (typeof bot_mention_limit !== "number" || bot_mention_limit < 1 || bot_mention_limit > 100) {
    return c.json(
      errorResponse("INVALID_INPUT", "bot_mention_limit must be between 1 and 100"),
      400
    );
  }

  if (typeof bot_mention_window_minutes !== "number" || bot_mention_window_minutes < 1 || bot_mention_window_minutes > 60) {
    return c.json(
      errorResponse("INVALID_INPUT", "bot_mention_window_minutes must be between 1 and 60"),
      400
    );
  }

  const db = getDb();
  // Update the single admin record (there's only one)
  const admin = db.query<{ id: string }, []>("SELECT id FROM admin LIMIT 1").get();
  if (!admin) {
    return c.json(errorResponse("ADMIN_NOT_FOUND", "Admin not found"), 404);
  }
  db.query(
    "UPDATE admin SET bot_mention_limit = ?, bot_mention_window_minutes = ? WHERE id = ?"
  ).run(bot_mention_limit, bot_mention_window_minutes, admin.id);

  const updated = db.query<SettingsRow, []>(
    "SELECT bot_mention_limit, bot_mention_window_minutes FROM admin LIMIT 1"
  ).get();

  if (!updated) {
    return c.json(errorResponse("UPDATE_FAILED", "Failed to update settings"), 500);
  }

  const settings: SystemSettings = {
    bot_mention_limit: updated.bot_mention_limit,
    bot_mention_window_minutes: updated.bot_mention_window_minutes,
  };

  return c.json(settings);
});

export default app;
