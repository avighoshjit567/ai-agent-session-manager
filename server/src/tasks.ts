import type Database from 'better-sqlite3';
import { getDb } from './db.js';
import {
  TASK_COLUMNS,
  TASK_PRIORITIES,
  type Provider,
  type Task,
  type TaskColumn,
  type TaskPriority,
  type TaskSessionRef,
} from '../../shared/types.js';

export interface CreateTaskInput {
  title: string;
  description?: string;
  column?: TaskColumn;
  priority?: TaskPriority;
  tags?: string[];
  dueDate?: string | null;
  projectPath?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  tags?: string[];
  dueDate?: string | null;
  projectPath?: string | null;
}

export const MAX_TITLE = 200;

function assertColumn(column: string): asserts column is TaskColumn {
  if (!TASK_COLUMNS.includes(column as TaskColumn)) {
    throw new Error(`Invalid column '${column}'`);
  }
}

function assertPriority(priority: string): asserts priority is TaskPriority {
  if (!TASK_PRIORITIES.includes(priority as TaskPriority)) {
    throw new Error(`Invalid priority '${priority}'`);
  }
}

function normalizeTitle(title: unknown): string {
  const t = typeof title === 'string' ? title.trim().slice(0, MAX_TITLE) : '';
  if (!t) throw new Error('Task title is required');
  return t;
}

// The linked-session `name` mirrors how the client shows sessions elsewhere:
// custom display name first, then the session title.
const SESSION_NAME_SELECT = `
  SELECT ts.task_id AS taskId, ts.provider, ts.session_id AS sessionId,
         COALESCE(sm.display_name, s.title) AS name
  FROM task_sessions ts
  LEFT JOIN session_meta sm ON sm.provider = ts.provider AND sm.session_id = ts.session_id
  LEFT JOIN sessions s ON s.provider = ts.provider AND s.session_id = ts.session_id`;

function rowToTask(row: any, sessions: TaskSessionRef[]): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    column: row.column,
    position: row.position,
    priority: row.priority,
    tags: safeParseTags(row.tags),
    dueDate: row.dueDate ?? null,
    projectPath: row.projectPath ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sessions,
  };
}

function safeParseTags(v: unknown): string[] {
  if (typeof v !== 'string') return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

const TASK_SELECT = `
  SELECT id, title, description, board_column AS column, position, priority, tags,
         due_date AS dueDate, project_path AS projectPath,
         created_at AS createdAt, updated_at AS updatedAt
  FROM tasks`;

function sessionsByTask(db: Database.Database, taskIds: number[]): Map<number, TaskSessionRef[]> {
  const map = new Map<number, TaskSessionRef[]>();
  if (taskIds.length === 0) return map;
  const placeholders = taskIds.map(() => '?').join(',');
  const rows = db
    .prepare(`${SESSION_NAME_SELECT} WHERE ts.task_id IN (${placeholders})`)
    .all(...taskIds) as any[];
  for (const r of rows) {
    const list = map.get(r.taskId) ?? [];
    list.push({ provider: r.provider, sessionId: r.sessionId, name: r.name ?? null });
    map.set(r.taskId, list);
  }
  return map;
}

export function getTask(id: number, db: Database.Database = getDb()): Task | null {
  const row = db.prepare(`${TASK_SELECT} WHERE id = ?`).get(id) as any;
  if (!row) return null;
  return rowToTask(row, sessionsByTask(db, [row.id]).get(row.id) ?? []);
}

export function listTasks(
  projectPath?: string,
  db: Database.Database = getDb(),
): Task[] {
  const rows = (
    projectPath
      ? db.prepare(`${TASK_SELECT} WHERE project_path = ? ORDER BY board_column, position`).all(projectPath)
      : db.prepare(`${TASK_SELECT} ORDER BY board_column, position`).all()
  ) as any[];
  const links = sessionsByTask(db, rows.map((r) => r.id));
  return rows.map((r) => rowToTask(r, links.get(r.id) ?? []));
}

export function createTask(input: CreateTaskInput, db: Database.Database = getDb()): Task {
  const title = normalizeTitle(input.title);
  const column = input.column ?? 'backlog';
  assertColumn(column);
  const priority = input.priority ?? 'medium';
  assertPriority(priority);
  const now = new Date().toISOString();
  const maxPos = db
    .prepare(`SELECT MAX(position) AS m FROM tasks WHERE board_column = ?`)
    .get(column) as any;
  const position = (maxPos?.m ?? 0) + 1;
  const res = db
    .prepare(
      `INSERT INTO tasks (title, description, board_column, position, priority, tags,
         due_date, project_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      title,
      input.description ?? '',
      column,
      position,
      priority,
      JSON.stringify(input.tags ?? []),
      input.dueDate ?? null,
      input.projectPath ?? null,
      now,
      now,
    );
  return getTask(Number(res.lastInsertRowid), db)!;
}

export function updateTask(
  id: number,
  patch: UpdateTaskInput,
  db: Database.Database = getDb(),
): Task | null {
  const existing = getTask(id, db);
  if (!existing) return null;
  const title = patch.title !== undefined ? normalizeTitle(patch.title) : existing.title;
  const priority = patch.priority ?? existing.priority;
  assertPriority(priority);
  db.prepare(
    `UPDATE tasks SET title = ?, description = ?, priority = ?, tags = ?,
       due_date = ?, project_path = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    title,
    patch.description !== undefined ? patch.description : existing.description,
    priority,
    JSON.stringify(patch.tags !== undefined ? patch.tags : existing.tags),
    patch.dueDate !== undefined ? patch.dueDate : existing.dueDate,
    patch.projectPath !== undefined ? patch.projectPath : existing.projectPath,
    new Date().toISOString(),
    id,
  );
  return getTask(id, db);
}

export function moveTask(
  id: number,
  column: TaskColumn,
  position: number,
  db: Database.Database = getDb(),
): Task | null {
  assertColumn(column);
  if (typeof position !== 'number' || !Number.isFinite(position)) {
    throw new Error('Invalid position');
  }
  const res = db
    .prepare(`UPDATE tasks SET board_column = ?, position = ?, updated_at = ? WHERE id = ?`)
    .run(column, position, new Date().toISOString(), id);
  if (res.changes === 0) return null;
  return getTask(id, db);
}

export function deleteTask(id: number, db: Database.Database = getDb()): boolean {
  // Manual cascade: better-sqlite3 leaves foreign_keys OFF by default.
  const run = db.transaction((taskId: number) => {
    db.prepare(`DELETE FROM task_sessions WHERE task_id = ?`).run(taskId);
    return db.prepare(`DELETE FROM tasks WHERE id = ?`).run(taskId).changes > 0;
  });
  return run(id);
}

export function setTaskSessions(
  id: number,
  refs: Array<{ provider: Provider; sessionId: string }>,
  db: Database.Database = getDb(),
): Task | null {
  const existing = getTask(id, db);
  if (!existing) return null;
  const run = db.transaction(() => {
    db.prepare(`DELETE FROM task_sessions WHERE task_id = ?`).run(id);
    const ins = db.prepare(
      `INSERT OR IGNORE INTO task_sessions (task_id, provider, session_id) VALUES (?, ?, ?)`,
    );
    for (const r of refs) {
      if (r.provider !== 'claude' && r.provider !== 'codex') continue;
      if (typeof r.sessionId !== 'string' || !r.sessionId) continue;
      ins.run(id, r.provider, r.sessionId);
    }
    db.prepare(`UPDATE tasks SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
  });
  run();
  return getTask(id, db);
}

export function tasksForSession(
  provider: Provider,
  sessionId: string,
  db: Database.Database = getDb(),
): Task[] {
  const rows = db
    .prepare(
      `${TASK_SELECT} WHERE id IN (
         SELECT task_id FROM task_sessions WHERE provider = ? AND session_id = ?
       ) ORDER BY board_column, position`,
    )
    .all(provider, sessionId) as any[];
  const links = sessionsByTask(db, rows.map((r) => r.id));
  return rows.map((r) => rowToTask(r, links.get(r.id) ?? []));
}
