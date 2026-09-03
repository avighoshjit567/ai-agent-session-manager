import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import { initSchema } from '../src/db';
import { listSessions } from '../src/search';
import { saveMeta } from '../src/meta';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  const ins = db.prepare(
    `INSERT INTO sessions (provider, session_id, title, source_path, updated_at, indexed_at)
     VALUES (?, ?, ?, 'x.jsonl', ?, '2026-09-03T00:00:00Z')`,
  );
  ins.run('claude', 's1', 'First', '2026-09-01T00:00:00Z');
  ins.run('claude', 's2', 'Second', '2026-09-02T00:00:00Z');
  ins.run('codex', 's3', 'Third', '2026-09-03T00:00:00Z');
  return db;
}

describe('listSessions bookmarked filter', () => {
  it('exposes bookmarked on every item', () => {
    const db = freshDb();
    saveMeta('claude', 's1', { bookmarked: true }, db);
    const { items } = listSessions({}, db);
    const byId = Object.fromEntries(items.map((s) => [s.sessionId, s.bookmarked]));
    expect(byId).toEqual({ s1: true, s2: false, s3: false });
  });

  it('filters to bookmarked sessions only, with a matching total', () => {
    const db = freshDb();
    saveMeta('claude', 's1', { bookmarked: true }, db);
    saveMeta('codex', 's3', { bookmarked: true }, db);
    const { items, total } = listSessions({ bookmarked: true }, db);
    expect(items.map((s) => s.sessionId).sort()).toEqual(['s1', 's3']);
    expect(total).toBe(2);
  });

  it('combines with other filters', () => {
    const db = freshDb();
    saveMeta('claude', 's1', { bookmarked: true }, db);
    saveMeta('codex', 's3', { bookmarked: true }, db);
    const { items } = listSessions({ bookmarked: true, provider: 'codex' }, db);
    expect(items.map((s) => s.sessionId)).toEqual(['s3']);
  });

  it('a session with only a display name is not treated as bookmarked', () => {
    const db = freshDb();
    saveMeta('claude', 's2', { displayName: 'Named' }, db);
    const { items } = listSessions({ bookmarked: true }, db);
    expect(items).toHaveLength(0);
  });
});
