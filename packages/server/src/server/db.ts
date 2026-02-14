import { Database } from "bun:sqlite";

const DATABASE_PATH = process.env.DATABASE_PATH ?? "./data/agentfeed.db";

let db: Database;
let cleanupStarted = false;

export function getDb(): Database {
  if (!db) {
    db = new Database(DATABASE_PATH, { create: true });
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    migrate(db);
    startSessionCleanup();
  }
  return db;
}

function startSessionCleanup(): void {
  if (cleanupStarted) return;
  cleanupStarted = true;

  cleanExpiredSessions();
  setInterval(cleanExpiredSessions, 60 * 60 * 1000);
}

function cleanExpiredSessions(): void {
  try {
    const result = db
      .query("DELETE FROM sessions WHERE expires_at <= ?")
      .run(new Date().toISOString());
    if (result.changes > 0) {
      console.log(`Cleaned up ${result.changes} expired session(s)`);
    }
  } catch (err) {
    console.error("Session cleanup error:", err);
  }
}

function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin (
      id TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feeds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feed_views (
      feed_id TEXT PRIMARY KEY REFERENCES feeds(id) ON DELETE CASCADE,
      last_viewed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      content TEXT,
      author_type TEXT NOT NULL DEFAULT 'human',
      created_by TEXT,
      author_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS post_views (
      post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
      last_viewed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      author_type TEXT NOT NULL DEFAULT 'human',
      created_by TEXT,
      author_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_sessions (
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      session_name TEXT NOT NULL,
      claude_session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (agent_id, session_name)
    );

    CREATE INDEX IF NOT EXISTS idx_posts_feed_id ON posts(feed_id);
    CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
    CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(post_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_agents_api_key_id ON agents(api_key_id);

  `);

  // Migration: Create agent_permissions table for CLI settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_permissions (
      agent_id TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
      permission_mode TEXT NOT NULL DEFAULT 'safe',
      allowed_tools TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migration: Add parent_name column to agents table
  try {
    db.exec(`ALTER TABLE agents ADD COLUMN parent_name TEXT`);
  } catch {
    // Column already exists — ignore
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agents_parent_name ON agents(parent_name)`);

  // Migration: Add type column to agents table (claude, codex, gemini, etc.)
  try {
    db.exec(`ALTER TABLE agents ADD COLUMN type TEXT`);
  } catch {
    // Column already exists — ignore
  }

  // Migration: Add last_active_at column to agents table
  try {
    db.exec(`ALTER TABLE agents ADD COLUMN last_active_at TEXT`);
  } catch {
    // Column already exists — ignore
  }

  // Migration: Add cwd column to agents table (worker working directory)
  try {
    db.exec(`ALTER TABLE agents ADD COLUMN cwd TEXT`);
  } catch {
    // Column already exists — ignore
  }

  // Migration: Add model column to agent_permissions table
  try {
    db.exec(`ALTER TABLE agent_permissions ADD COLUMN model TEXT`);
  } catch {
    // Column already exists — ignore
  }
}
