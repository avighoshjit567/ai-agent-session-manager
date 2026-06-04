import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach } from 'vitest';
import { initSchema, ftsReindexRequired, clearFtsReindexRequired } from '../src/db';

function ftsCols(db: Database.Database): string[] {
  return (db.prepare(`PRAGMA table_info(sessions_fts)`).all() as any[]).map((c) => c.name);
}

describe('FTS body migration', () => {
  beforeEach(() => clearFtsReindexRequired());

  it('adds the body column and flags a reindex when migrating an old FTS table', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE VIRTUAL TABLE sessions_fts USING fts5(
      provider UNINDEXED, session_id UNINDEXED, title, project_path, git_branch, first_user_message
    );`);
    initSchema(db);
    expect(ftsCols(db)).toContain('body');
    expect(ftsReindexRequired()).toBe(true);
  });

  it('is a no-op on a fresh DB and when run twice', () => {
    const db = new Database(':memory:');
    initSchema(db);
    clearFtsReindexRequired();
    initSchema(db);
    expect(ftsCols(db)).toContain('body');
    expect(ftsReindexRequired()).toBe(false);
  });
});
