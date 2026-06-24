import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import { initSchema } from '../src/db';
import {
  isValidDateString,
  localDayWindow,
  selectSessionsForDate,
} from '../src/recap';
import type { RecapSession } from '../src/recap';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

function insertSession(db: Database.Database, o: Record<string, unknown>): void {
  db.prepare(
    `INSERT INTO sessions (provider, session_id, title, project_path, git_branch,
       updated_at, mtime, first_user_message, source_path, archived, message_count,
       tool_call_count, has_subagents, has_todos, model, indexed_at)
     VALUES (@provider,@sessionId,@title,@projectPath,@gitBranch,@updatedAt,@mtime,
       @firstUserMessage,@sourcePath,@archived,@messageCount,@toolCallCount,
       @hasSubagents,@hasTodos,@model,@indexedAt)`,
  ).run({
    provider: 'claude',
    title: null,
    projectPath: '/Users/me/proj',
    gitBranch: null,
    updatedAt: null,
    mtime: null,
    firstUserMessage: null,
    sourcePath: 'x.jsonl',
    archived: 0,
    messageCount: 0,
    toolCallCount: 0,
    hasSubagents: 0,
    hasTodos: 0,
    model: null,
    indexedAt: '2026-06-24T00:00:00Z',
    ...o,
  });
}

describe('isValidDateString', () => {
  it('accepts a YYYY-MM-DD date', () => {
    expect(isValidDateString('2026-06-23')).toBe(true);
  });
  it('rejects malformed or impossible dates', () => {
    expect(isValidDateString('2026-6-23')).toBe(false);
    expect(isValidDateString('not-a-date')).toBe(false);
    expect(isValidDateString('2026-13-40')).toBe(false);
  });
});

describe('localDayWindow', () => {
  it('spans local midnight to next local midnight', () => {
    const { startMs, endMs } = localDayWindow('2026-06-23');
    expect(startMs).toBe(new Date(2026, 5, 23, 0, 0, 0, 0).getTime());
    expect(endMs).toBe(new Date(2026, 5, 24, 0, 0, 0, 0).getTime());
  });
});

describe('selectSessionsForDate', () => {
  it('includes sessions whose last activity falls in the local day', () => {
    const db = freshDb();
    insertSession(db, { sessionId: 'in', updatedAt: '2026-06-23T12:00:00' });
    insertSession(db, { sessionId: 'before', updatedAt: '2026-06-22T23:59:00' });
    insertSession(db, { sessionId: 'after', updatedAt: '2026-06-24T00:01:00' });
    const ids = selectSessionsForDate('2026-06-23', db).map((s) => s.sessionId);
    expect(ids).toEqual(['in']);
  });

  it('falls back to mtime when updated_at is null', () => {
    const db = freshDb();
    insertSession(db, {
      sessionId: 'bymtime',
      updatedAt: null,
      mtime: new Date(2026, 5, 23, 9, 0, 0).getTime(),
    });
    const ids = selectSessionsForDate('2026-06-23', db).map((s) => s.sessionId);
    expect(ids).toEqual(['bymtime']);
  });

  it('excludes archived sessions', () => {
    const db = freshDb();
    insertSession(db, { sessionId: 'arch', updatedAt: '2026-06-23T12:00:00', archived: 1 });
    expect(selectSessionsForDate('2026-06-23', db)).toHaveLength(0);
  });
});
