import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import { initSchema } from '../src/db';
import {
  listTasks,
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  setTaskSessions,
  tasksForSession,
} from '../src/tasks';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

describe('createTask', () => {
  it('creates a task with defaults in backlog', () => {
    const db = freshDb();
    const t = createTask({ title: 'Fix login' }, db);
    expect(t.id).toBeGreaterThan(0);
    expect(t.title).toBe('Fix login');
    expect(t.column).toBe('backlog');
    expect(t.priority).toBe('medium');
    expect(t.description).toBe('');
    expect(t.tags).toEqual([]);
    expect(t.dueDate).toBeNull();
    expect(t.projectPath).toBeNull();
    expect(t.sessions).toEqual([]);
  });

  it('rejects an empty title', () => {
    const db = freshDb();
    expect(() => createTask({ title: '   ' }, db)).toThrow(/title/i);
  });

  it('appends new tasks to the bottom of their column', () => {
    const db = freshDb();
    const a = createTask({ title: 'A' }, db);
    const b = createTask({ title: 'B' }, db);
    expect(b.position).toBeGreaterThan(a.position);
  });

  it('accepts explicit column, priority, tags, dueDate, projectPath', () => {
    const db = freshDb();
    const t = createTask(
      {
        title: 'Ship board',
        column: 'in_progress',
        priority: 'high',
        tags: ['feature', 'ui'],
        dueDate: '2026-09-10',
        projectPath: '/Users/me/proj',
        description: 'Kanban',
      },
      db,
    );
    expect(t.column).toBe('in_progress');
    expect(t.priority).toBe('high');
    expect(t.tags).toEqual(['feature', 'ui']);
    expect(t.dueDate).toBe('2026-09-10');
    expect(t.projectPath).toBe('/Users/me/proj');
  });

  it('rejects an invalid column or priority', () => {
    const db = freshDb();
    expect(() => createTask({ title: 'x', column: 'doing' as any }, db)).toThrow(/column/i);
    expect(() => createTask({ title: 'x', priority: 'urgent' as any }, db)).toThrow(/priority/i);
  });
});

describe('listTasks', () => {
  it('returns tasks ordered by column position', () => {
    const db = freshDb();
    createTask({ title: 'A' }, db);
    createTask({ title: 'B' }, db);
    const items = listTasks(undefined, db);
    expect(items.map((t) => t.title)).toEqual(['A', 'B']);
  });

  it('filters by projectPath', () => {
    const db = freshDb();
    createTask({ title: 'A', projectPath: '/p1' }, db);
    createTask({ title: 'B', projectPath: '/p2' }, db);
    const items = listTasks('/p1', db);
    expect(items.map((t) => t.title)).toEqual(['A']);
  });
});

describe('updateTask', () => {
  it('patches only provided fields', () => {
    const db = freshDb();
    const t = createTask({ title: 'A', description: 'orig' }, db);
    const u = updateTask(t.id, { priority: 'high' }, db);
    expect(u?.priority).toBe('high');
    expect(u?.title).toBe('A');
    expect(u?.description).toBe('orig');
  });

  it('returns null for a missing task', () => {
    const db = freshDb();
    expect(updateTask(999, { title: 'x' }, db)).toBeNull();
  });

  it('rejects clearing the title', () => {
    const db = freshDb();
    const t = createTask({ title: 'A' }, db);
    expect(() => updateTask(t.id, { title: '  ' }, db)).toThrow(/title/i);
  });
});

describe('moveTask', () => {
  it('moves a task to another column at the given position', () => {
    const db = freshDb();
    const t = createTask({ title: 'A' }, db);
    const moved = moveTask(t.id, 'in_progress', 5, db);
    expect(moved?.column).toBe('in_progress');
    expect(moved?.position).toBe(5);
  });

  it('supports midpoint insertion between two tasks', () => {
    const db = freshDb();
    const a = createTask({ title: 'A' }, db);
    const b = createTask({ title: 'B' }, db);
    const c = createTask({ title: 'C' }, db);
    moveTask(c.id, 'backlog', (a.position + b.position) / 2, db);
    const items = listTasks(undefined, db);
    expect(items.map((t) => t.title)).toEqual(['A', 'C', 'B']);
  });

  it('rejects an invalid column', () => {
    const db = freshDb();
    const t = createTask({ title: 'A' }, db);
    expect(() => moveTask(t.id, 'nope' as any, 1, db)).toThrow(/column/i);
  });
});

describe('sessions linking', () => {
  it('links and replaces sessions for a task', () => {
    const db = freshDb();
    const t = createTask({ title: 'A' }, db);
    setTaskSessions(t.id, [{ provider: 'claude', sessionId: 's1' }], db);
    let [task] = listTasks(undefined, db);
    expect(task.sessions).toHaveLength(1);
    expect(task.sessions[0]).toMatchObject({ provider: 'claude', sessionId: 's1' });

    setTaskSessions(t.id, [{ provider: 'codex', sessionId: 's2' }], db);
    [task] = listTasks(undefined, db);
    expect(task.sessions).toHaveLength(1);
    expect(task.sessions[0]).toMatchObject({ provider: 'codex', sessionId: 's2' });
  });

  it('finds tasks for a session', () => {
    const db = freshDb();
    const a = createTask({ title: 'A' }, db);
    const b = createTask({ title: 'B' }, db);
    setTaskSessions(a.id, [{ provider: 'claude', sessionId: 's1' }], db);
    setTaskSessions(b.id, [{ provider: 'claude', sessionId: 'other' }], db);
    const tasks = tasksForSession('claude', 's1', db);
    expect(tasks.map((t) => t.title)).toEqual(['A']);
  });

  it('resolves a linked session display name when the session exists', () => {
    const db = freshDb();
    db.prepare(
      `INSERT INTO sessions (provider, session_id, title, source_path, indexed_at)
       VALUES ('claude', 's1', 'Login fix session', 'x.jsonl', '2026-09-03T00:00:00Z')`,
    ).run();
    db.prepare(
      `INSERT INTO session_meta (provider, session_id, display_name, updated_at)
       VALUES ('claude', 's1', 'My named session', '2026-09-03T00:00:00Z')`,
    ).run();
    const t = createTask({ title: 'A' }, db);
    setTaskSessions(t.id, [{ provider: 'claude', sessionId: 's1' }], db);
    const [task] = listTasks(undefined, db);
    expect(task.sessions[0].name).toBe('My named session');
  });
});

describe('deleteTask', () => {
  it('deletes the task and its session links', () => {
    const db = freshDb();
    const t = createTask({ title: 'A' }, db);
    setTaskSessions(t.id, [{ provider: 'claude', sessionId: 's1' }], db);
    expect(deleteTask(t.id, db)).toBe(true);
    expect(listTasks(undefined, db)).toHaveLength(0);
    const links = db.prepare(`SELECT COUNT(*) AS n FROM task_sessions`).get() as any;
    expect(links.n).toBe(0);
  });

  it('returns false for a missing task', () => {
    const db = freshDb();
    expect(deleteTask(999, db)).toBe(false);
  });
});
