import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import { initSchema } from '../src/db';
import {
  isValidDateString,
  localDayWindow,
  selectSessionsForDate,
  buildSessionDigest,
  buildRecapPrompt,
  getRecap,
  saveGeneratedRecap,
  saveEditedRecap,
  listRecaps,
  previewForDate,
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

function sampleSession(over: Partial<RecapSession> = {}): RecapSession {
  return {
    provider: 'claude',
    sessionId: 'abc123',
    title: 'Fix login bug',
    displayName: null,
    projectPath: '/Users/me/webapp',
    gitBranch: 'fix/login',
    model: 'claude-opus',
    firstUserMessage: 'The login form throws a 500 on submit',
    messageCount: 42,
    toolCallCount: 7,
    hasSubagents: true,
    hasTodos: false,
    noteSummary: '',
    activityMs: 0,
    ...over,
  };
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

describe('buildSessionDigest', () => {
  it('renders name, project, intent, and activity; omits empty notes', () => {
    const d = buildSessionDigest(sampleSession());
    expect(d).toContain('### Fix login bug — webapp (fix/login)');
    expect(d).toContain('- Intent: The login form throws a 500 on submit');
    expect(d).toContain('- Activity: 42 messages, 7 tool calls, subagents');
    expect(d).not.toContain('- Notes:');
  });
  it('masks secrets in free text', () => {
    const d = buildSessionDigest(
      sampleSession({ firstUserMessage: 'token sk-ant-api03-SECRETVALUE12345 here' }),
    );
    expect(d).not.toContain('SECRETVALUE12345');
  });
});

describe('buildRecapPrompt', () => {
  it('includes the date and every session digest', () => {
    const prompt = buildRecapPrompt('2026-06-23', [
      sampleSession({ title: 'Task A' }),
      sampleSession({ title: 'Task B' }),
    ]);
    expect(prompt).toContain('2026-06-23');
    expect(prompt).toContain('### Task A');
    expect(prompt).toContain('### Task B');
    expect(prompt).toContain('Output only the recap');
  });
});

describe('recap persistence', () => {
  it('saves a generated recap and reads it back', () => {
    const db = freshDb();
    const r = saveGeneratedRecap('2026-06-23', '# Recap', ['claude:abc'], 'claude-opus', db);
    expect(r.content).toBe('# Recap');
    expect(r.sessionIds).toEqual(['claude:abc']);
    expect(r.editedAt).toBeNull();
    expect(getRecap('2026-06-23', db)?.content).toBe('# Recap');
  });

  it('returns null for a missing date', () => {
    expect(getRecap('1999-01-01', freshDb())).toBeNull();
  });

  it('updates content and stamps edited_at on edit', () => {
    const db = freshDb();
    saveGeneratedRecap('2026-06-23', 'orig', [], null, db);
    const edited = saveEditedRecap('2026-06-23', 'changed', db);
    expect(edited?.content).toBe('changed');
    expect(edited?.editedAt).toBeTruthy();
  });

  it('returns null when editing a non-existent recap', () => {
    expect(saveEditedRecap('1999-01-01', 'x', freshDb())).toBeNull();
  });

  it('lists recaps newest first', () => {
    const db = freshDb();
    saveGeneratedRecap('2026-06-21', 'a', [], null, db);
    saveGeneratedRecap('2026-06-23', 'b', [], null, db);
    expect(listRecaps(db).map((r) => r.date)).toEqual(['2026-06-23', '2026-06-21']);
  });
});

describe('previewForDate', () => {
  it('maps a day\'s sessions to lightweight previews', () => {
    const db = freshDb();
    insertSession(db, {
      sessionId: 'p1',
      title: 'Task A',
      updatedAt: '2026-06-23T10:00:00',
      messageCount: 5,
      toolCallCount: 2,
    });
    const preview = previewForDate('2026-06-23', db);
    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({ sessionId: 'p1', name: 'Task A', messageCount: 5 });
  });
});
