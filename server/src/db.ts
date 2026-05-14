import Database from 'better-sqlite3';
import { ensureAppDirs, indexDbPath } from './paths.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  ensureAppDirs();
  db = new Database(indexDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  initSchema(db);
  return db;
}

function initSchema(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      provider TEXT NOT NULL,
      session_id TEXT NOT NULL,
      title TEXT,
      project_path TEXT,
      git_branch TEXT,
      created_at TEXT,
      updated_at TEXT,
      first_user_message TEXT,
      source_path TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      tool_call_count INTEGER NOT NULL DEFAULT 0,
      has_subagents INTEGER NOT NULL DEFAULT 0,
      has_todos INTEGER NOT NULL DEFAULT 0,
      model TEXT,
      tokens_used INTEGER,
      parent_session_id TEXT,
      indexed_at TEXT NOT NULL,
      mtime INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_read_tokens INTEGER,
      cache_creation_tokens INTEGER,
      last_context_tokens INTEGER,
      context_window INTEGER,
      PRIMARY KEY (provider, session_id)
    );

    -- Idempotent migrations for DBs created before token columns existed.
    -- SQLite ignores duplicate-column ALTERs only via error; we wrap in a no-op-on-error pragma.
    `);

  // Add new columns one-by-one; ignore "duplicate column" errors.
  const newCols: Array<[string, string]> = [
    ['input_tokens', 'INTEGER'],
    ['output_tokens', 'INTEGER'],
    ['cache_read_tokens', 'INTEGER'],
    ['cache_creation_tokens', 'INTEGER'],
    ['last_context_tokens', 'INTEGER'],
    ['context_window', 'INTEGER'],
  ];
  for (const [name, type] of newCols) {
    try {
      d.exec(`ALTER TABLE sessions ADD COLUMN ${name} ${type}`);
    } catch (e: any) {
      if (!/duplicate column/i.test(e?.message ?? '')) throw e;
    }
  }

  d.exec(`

    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);
    CREATE INDEX IF NOT EXISTS idx_sessions_branch ON sessions(git_branch);
    CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider);

    CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
      provider UNINDEXED,
      session_id UNINDEXED,
      title,
      project_path,
      git_branch,
      first_user_message,
      tokenize = 'porter unicode61'
    );

    CREATE TABLE IF NOT EXISTS notes (
      provider TEXT NOT NULL,
      session_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'none',
      tags TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL DEFAULT '',
      follow_ups TEXT NOT NULL DEFAULT '',
      lessons TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (provider, session_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
