import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH = process.env.AGENT_CORE_DB ?? path.join(process.cwd(), "agent-core.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS context_repos (
      repo_id TEXT PRIMARY KEY,
      tree TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS context_links (
      id TEXT PRIMARY KEY,
      source_repo TEXT NOT NULL,
      source_path TEXT NOT NULL,
      target_repo TEXT NOT NULL,
      target_path TEXT NOT NULL,
      relation TEXT NOT NULL DEFAULT 'related',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      repo_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS session_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS traces (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      trace_type TEXT NOT NULL,
      action_name TEXT,
      input TEXT NOT NULL DEFAULT '{}',
      output TEXT NOT NULL DEFAULT '{}',
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS actions (
      name TEXT PRIMARY KEY,
      description TEXT NOT NULL DEFAULT '',
      schema TEXT NOT NULL DEFAULT '{}',
      risk_level TEXT NOT NULL DEFAULT 'low',
      requires_approval INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tool_rules (
      id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      sequence TEXT NOT NULL DEFAULT '[]',
      before_exit TEXT NOT NULL DEFAULT '[]',
      approval_required TEXT NOT NULL DEFAULT '[]',
      conditions TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS policy_rules (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL DEFAULT 'global',
      pattern TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'allow',
      requires_approval INTEGER NOT NULL DEFAULT 0,
      approval_type TEXT,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
