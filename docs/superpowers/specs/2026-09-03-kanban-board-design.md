# Kanban Task Board — Design

Date: 2026-09-03
Status: Approved

## Goal

A kanban board inside the session manager to track multiple features/fixes
(tasks) at once. Tasks can link to the AI sessions working on them, so the
board becomes the hub: see a task, jump to its sessions, resume them.

## Decisions (agreed with user)

- Tasks are linkable to sessions (many-to-many) and optionally to a project.
- Fixed 4 columns: Backlog → To Do → In Progress → Done. No column management.
- One global board with a project filter (same pattern as the Sessions page).
- Card fields: title, description, priority (low/medium/high), tags, due date.
- Drag-and-drop between/within columns via native HTML5 drag events (no new
  dependency), plus a per-card move menu as a fallback.
- Tasks also surface on the session detail page (linked tasks card) and the
  dashboard (per-column counts + In Progress tasks).

## Data model

Two tables in the existing `index.db`, created in `initSchema` like
`notes`/`session_meta`/`daily_recaps` — user-owned data that survives
reindexing:

```sql
tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  column       TEXT NOT NULL DEFAULT 'backlog',   -- backlog | todo | in_progress | done
  position     REAL NOT NULL,                     -- fractional ordering within a column
  priority     TEXT NOT NULL DEFAULT 'medium',    -- low | medium | high
  tags         TEXT NOT NULL DEFAULT '[]',        -- JSON array (same style as notes.tags)
  due_date     TEXT,                              -- YYYY-MM-DD or NULL
  project_path TEXT,                              -- optional; matches sessions.project_path
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
)

task_sessions (
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  provider   TEXT NOT NULL,
  session_id TEXT NOT NULL,
  PRIMARY KEY (task_id, provider, session_id)
)
```

`position` is a float: dropping a card between two others updates one row to
the midpoint — no renumbering. Column identity lives in code, not the DB.

## Server

New module `server/src/tasks.ts` (mirrors `notes.ts`/`recap.ts`; every
function takes `db: Database.Database = getDb()`):

- `listTasks(projectPath?)` — all tasks (optionally filtered), each with its
  linked sessions (provider, sessionId, display name) joined in.
- `createTask(input)` — title required; defaults column=backlog,
  priority=medium, position = bottom of column.
- `updateTask(id, patch)` — edit fields.
- `moveTask(id, column, position)` — drag-drop support.
- `deleteTask(id)` — cascades to `task_sessions`.
- `setTaskSessions(id, refs)` — replace linked-session list.
- `tasksForSession(provider, sessionId)` — for the session detail page.

Endpoints in `routes/api.ts`:

- `GET    /api/tasks?projectPath=`
- `POST   /api/tasks`
- `PUT    /api/tasks/:id`
- `PUT    /api/tasks/:id/move`
- `DELETE /api/tasks/:id`
- `PUT    /api/tasks/:id/sessions`
- `GET    /api/sessions/:provider/:sessionId/tasks`

## Client

- `/board` page (`Board.vue`): 4 columns, project filter, cards with priority
  badge, tags, due date (red when overdue), linked-session chips. Native
  drag-and-drop; card menu with Move to… fallback. Click opens edit modal with
  description, priority, tags, due date, project, and a session picker.
  "New task" button per column.
- Session detail: "Tasks" card listing linked tasks with column; link/create
  from there.
- Dashboard: widget with per-column counts and In Progress task titles.
- Sidebar: "Board" nav item.

## Testing

- Server: vitest unit tests for `tasks.ts` against in-memory SQLite (CRUD,
  ordering math, session linking, cascade delete), written test-first.
- Client: typecheck + manual verification in dev mode (matches existing pages).
