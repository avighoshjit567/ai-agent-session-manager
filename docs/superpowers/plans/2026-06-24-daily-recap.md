# Daily Recap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Daily" section that gathers a chosen day's sessions (default yesterday) and produces an editable, copy-ready accomplishments recap via the `claude` CLI, saving each day's recap as history.

**Architecture:** A new isolated server module `recap.ts` (session selection → digest → prompt → save) plus a thin `claudeCli.ts` runner, four API routes, and one new Vue page `Daily.vue`. No changes to existing indexing/launch logic. Generation is one `claude -p` call over compact per-session digests (approach A from the spec).

**Tech Stack:** Fastify + better-sqlite3 (server), Vue 3 + vue-router + Tailwind (client), Vitest (tests), TypeScript throughout. Spec: `docs/superpowers/specs/2026-06-24-daily-recap-design.md`.

---

## File Structure

- **Create** `server/src/recap.ts` — date helpers, session selection, digest/prompt builders, recap DB helpers, `generateRecap` orchestration. One responsibility: turning sessions into a saved recap.
- **Create** `server/src/claudeCli.ts` — `runClaudeHeadless(prompt)`; the only place that spawns `claude`.
- **Create** `server/test/recap.test.ts` — unit tests for the pure/DB logic.
- **Modify** `server/src/db.ts` — add `daily_recaps` table to `initSchema`.
- **Modify** `server/test/db-migration.test.ts` — assert the new table exists.
- **Modify** `server/src/routes/api.ts` — register the four recap routes.
- **Modify** `shared/types.ts` — add recap types.
- **Modify** `client/src/api.ts` — add recap client methods.
- **Modify** `client/src/router.ts` — add `/daily` route.
- **Modify** `client/src/App.vue` — add a "Daily" nav item.
- **Create** `client/src/pages/Daily.vue` — the page.

---

### Task 1: Shared types

**Files:**
- Modify: `shared/types.ts` (append after `AppSettings`, around line 132)

- [ ] **Step 1: Add the recap types**

Append to `shared/types.ts`:

```typescript
export interface DailyRecap {
  date: string; // 'YYYY-MM-DD' (server local day being recapped)
  content: string; // markdown recap (generated, then user-editable)
  sessionIds: string[]; // "provider:sessionId" included at generation time
  model: string | null;
  generatedAt: string;
  editedAt: string | null;
}

export interface RecapSessionPreview {
  provider: Provider;
  sessionId: string;
  name: string;
  projectPath: string | null;
  gitBranch: string | null;
  messageCount: number;
  toolCallCount: number;
}

export interface RecapDay {
  date: string;
  recap: DailyRecap | null;
  sessions: RecapSessionPreview[];
}

export interface RecapHistoryItem {
  date: string;
  generatedAt: string;
  editedAt: string | null;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm -w server run typecheck && npm -w client run typecheck`
Expected: PASS (types compile; nothing uses them yet).

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat(types): add Daily Recap types"
```

---

### Task 2: Database table

**Files:**
- Modify: `server/src/db.ts:136` (inside the second `d.exec(\`...\`)` block, after the `session_meta` table)
- Test: `server/test/db-migration.test.ts`

- [ ] **Step 1: Write the failing test**

Append this `describe` block to `server/test/db-migration.test.ts`:

```typescript
describe('daily_recaps table', () => {
  it('is created by initSchema', () => {
    const db = new Database(':memory:');
    initSchema(db);
    const t = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='daily_recaps'`)
      .get();
    expect(t).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server run test -- db-migration`
Expected: FAIL — the `daily_recaps` row is `undefined`.

- [ ] **Step 3: Add the table**

In `server/src/db.ts`, inside the second `d.exec(\`...\`)` template (the one that defines `notes`, `settings`, `session_meta`), add this table definition just before the closing `\`);` at line ~136:

```sql
    CREATE TABLE IF NOT EXISTS daily_recaps (
      date         TEXT PRIMARY KEY,
      content      TEXT NOT NULL,
      session_ids  TEXT NOT NULL DEFAULT '[]',
      model        TEXT,
      generated_at TEXT NOT NULL,
      edited_at    TEXT
    );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w server run test -- db-migration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/db.ts server/test/db-migration.test.ts
git commit -m "feat(db): add daily_recaps table"
```

---

### Task 3: Date window helpers

**Files:**
- Create: `server/src/recap.ts`
- Test: `server/test/recap.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/test/recap.test.ts`:

```typescript
import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import { initSchema } from '../src/db';
import { isValidDateString, localDayWindow } from '../src/recap';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
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
```

> The `freshDb` and (added in Task 4) `insertSession` helpers live in this one
> test file; later tasks append more `import`/`describe` blocks to it and reuse them.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server run test -- recap`
Expected: FAIL — cannot import from `../src/recap` (file does not exist).

- [ ] **Step 3: Create recap.ts with the helpers**

Create `server/src/recap.ts`:

```typescript
import Database from 'better-sqlite3';
import { getDb } from './db.js';
import { maskSecrets } from './privacy.js';
import { runClaudeHeadless } from './claudeCli.js';
import type {
  Provider,
  DailyRecap,
  RecapSessionPreview,
  RecapHistoryItem,
} from '../../shared/types.js';

// --- Date helpers -----------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// Local-time [startMs, endMs) for the given calendar day. Using the (y, m-1, d)
// Date constructor anchors the window to the server's local timezone, and d+1
// rolls month/year boundaries correctly.
export function localDayWindow(date: string): { startMs: number; endMs: number } {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { startMs: start.getTime(), endMs: end.getTime() };
}
```

> NOTE: this file imports `./claudeCli.js` (Task 7) and uses several types/exports
> added in later tasks. It will not fully compile until Task 8. The tests in this
> task only import `isValidDateString` and `localDayWindow`, which is why we run a
> filtered test. Do not run the whole suite or a typecheck until Task 8.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w server run test -- recap`
Expected: PASS for the `isValidDateString` and `localDayWindow` suites.

> If Vitest errors on the missing `./claudeCli.js` import, temporarily comment out
> the `import { runClaudeHeadless }` line; it is wired up in Task 7. Prefer doing
> Tasks 3–8 in one sitting so the module is whole before committing the suite.

- [ ] **Step 5: Commit**

```bash
git add server/src/recap.ts server/test/recap.test.ts
git commit -m "feat(recap): add local-day window + date validation"
```

---

### Task 4: Session selection

**Files:**
- Modify: `server/src/recap.ts`
- Test: `server/test/recap.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/test/recap.test.ts`:

```typescript
import { selectSessionsForDate } from '../src/recap';

function insertSession(
  db: Database.Database,
  o: Record<string, unknown>,
): void {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server run test -- recap`
Expected: FAIL — `selectSessionsForDate` is not exported.

- [ ] **Step 3: Implement selection**

Append to `server/src/recap.ts`:

```typescript
// --- Session selection ------------------------------------------------------

export interface RecapSession {
  provider: Provider;
  sessionId: string;
  title: string | null;
  displayName: string | null;
  projectPath: string | null;
  gitBranch: string | null;
  model: string | null;
  firstUserMessage: string | null;
  messageCount: number;
  toolCallCount: number;
  hasSubagents: boolean;
  hasTodos: boolean;
  noteSummary: string;
  activityMs: number;
}

function activityMs(updatedAt: string | null, mtime: number | null): number {
  if (updatedAt) {
    const t = Date.parse(updatedAt);
    if (!Number.isNaN(t)) return t;
  }
  return mtime ?? 0;
}

export function selectSessionsForDate(
  date: string,
  db: Database.Database = getDb(),
): RecapSession[] {
  const { startMs, endMs } = localDayWindow(date);
  const rows = db
    .prepare(
      `SELECT s.provider, s.session_id AS sessionId, s.title,
              s.project_path AS projectPath, s.git_branch AS gitBranch, s.model,
              s.first_user_message AS firstUserMessage,
              s.message_count AS messageCount, s.tool_call_count AS toolCallCount,
              s.has_subagents AS hasSubagents, s.has_todos AS hasTodos,
              s.updated_at AS updatedAt, s.mtime AS mtime,
              m.display_name AS displayName,
              COALESCE(n.summary, '') AS noteSummary
       FROM sessions s
       LEFT JOIN session_meta m ON m.provider = s.provider AND m.session_id = s.session_id
       LEFT JOIN notes n ON n.provider = s.provider AND n.session_id = s.session_id
       WHERE s.archived = 0`,
    )
    .all() as any[];

  return rows
    .map((r) => ({
      provider: r.provider as Provider,
      sessionId: r.sessionId as string,
      title: r.title ?? null,
      displayName: r.displayName ?? null,
      projectPath: r.projectPath ?? null,
      gitBranch: r.gitBranch ?? null,
      model: r.model ?? null,
      firstUserMessage: r.firstUserMessage ?? null,
      messageCount: r.messageCount ?? 0,
      toolCallCount: r.toolCallCount ?? 0,
      hasSubagents: !!r.hasSubagents,
      hasTodos: !!r.hasTodos,
      noteSummary: r.noteSummary ?? '',
      activityMs: activityMs(r.updatedAt ?? null, r.mtime ?? null),
    }))
    .filter((s) => s.activityMs >= startMs && s.activityMs < endMs)
    .sort((a, b) => a.activityMs - b.activityMs);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w server run test -- recap`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/recap.ts server/test/recap.test.ts
git commit -m "feat(recap): select a day's sessions by last activity"
```

---

### Task 5: Digest + prompt builders

**Files:**
- Modify: `server/src/recap.ts`
- Test: `server/test/recap.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/test/recap.test.ts`:

```typescript
import { buildSessionDigest, buildRecapPrompt } from '../src/recap';
import type { RecapSession } from '../src/recap';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server run test -- recap`
Expected: FAIL — `buildSessionDigest` / `buildRecapPrompt` not exported.

- [ ] **Step 3: Implement the builders**

Append to `server/src/recap.ts`:

```typescript
// --- Prompt building --------------------------------------------------------

function sessionName(s: RecapSession): string {
  return (
    s.displayName ||
    s.title ||
    (s.firstUserMessage ?? '').slice(0, 60) ||
    s.sessionId.slice(0, 8)
  );
}

function projectName(s: RecapSession): string {
  if (!s.projectPath) return 'no project';
  const parts = s.projectPath.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? s.projectPath;
}

export function buildSessionDigest(s: RecapSession): string {
  const branch = s.gitBranch ? ` (${s.gitBranch})` : '';
  const lines: string[] = [`### ${sessionName(s)} — ${projectName(s)}${branch}`];

  const intent = maskSecrets((s.firstUserMessage ?? '').replace(/\s+/g, ' ').trim()).slice(0, 280);
  if (intent) lines.push(`- Intent: ${intent}`);

  const extras: string[] = [];
  if (s.hasSubagents) extras.push('subagents');
  if (s.hasTodos) extras.push('todos');
  const extraStr = extras.length ? `, ${extras.join(', ')}` : '';
  lines.push(`- Activity: ${s.messageCount} messages, ${s.toolCallCount} tool calls${extraStr}`);

  const note = maskSecrets(s.noteSummary.replace(/\s+/g, ' ').trim());
  if (note) lines.push(`- Notes: ${note}`);

  return lines.join('\n');
}

export function buildRecapPrompt(date: string, sessions: RecapSession[]): string {
  const digests = sessions.map(buildSessionDigest).join('\n\n');
  return [
    `Write my daily accomplishments recap for a standup, covering work done on ${date}.`,
    `Below are the AI coding sessions I worked on that day. Produce markdown bullet points`,
    `grouped by project. Each bullet is one concrete accomplishment in past tense, first`,
    `person, specific and plain. Merge related sessions; omit trivial or empty ones. Do not`,
    `invent work not evidenced below. Output only the recap — no preamble.`,
    ``,
    `Sessions:`,
    digests,
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w server run test -- recap`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/recap.ts server/test/recap.test.ts
git commit -m "feat(recap): build per-session digests and the recap prompt"
```

---

### Task 6: Recap DB helpers

**Files:**
- Modify: `server/src/recap.ts`
- Test: `server/test/recap.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/test/recap.test.ts`:

```typescript
import {
  getRecap,
  saveGeneratedRecap,
  saveEditedRecap,
  listRecaps,
  previewForDate,
} from '../src/recap';

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
  it('maps a day’s sessions to lightweight previews', () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server run test -- recap`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement the DB helpers**

Append to `server/src/recap.ts`:

```typescript
// --- Persistence ------------------------------------------------------------

function safeParseIds(v: unknown): string[] {
  if (typeof v !== 'string') return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function mapRecapRow(r: any): DailyRecap {
  return {
    date: r.date,
    content: r.content,
    sessionIds: safeParseIds(r.session_ids),
    model: r.model ?? null,
    generatedAt: r.generated_at,
    editedAt: r.edited_at ?? null,
  };
}

export function getRecap(date: string, db: Database.Database = getDb()): DailyRecap | null {
  const r = db.prepare(`SELECT * FROM daily_recaps WHERE date = ?`).get(date);
  return r ? mapRecapRow(r) : null;
}

export function saveGeneratedRecap(
  date: string,
  content: string,
  sessionIds: string[],
  model: string | null,
  db: Database.Database = getDb(),
): DailyRecap {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO daily_recaps (date, content, session_ids, model, generated_at, edited_at)
     VALUES (@date, @content, @sessionIds, @model, @generatedAt, NULL)
     ON CONFLICT(date) DO UPDATE SET
       content=excluded.content,
       session_ids=excluded.session_ids,
       model=excluded.model,
       generated_at=excluded.generated_at,
       edited_at=NULL`,
  ).run({ date, content, sessionIds: JSON.stringify(sessionIds), model, generatedAt: now });
  return getRecap(date, db)!;
}

export function saveEditedRecap(
  date: string,
  content: string,
  db: Database.Database = getDb(),
): DailyRecap | null {
  const now = new Date().toISOString();
  const res = db
    .prepare(`UPDATE daily_recaps SET content=@content, edited_at=@editedAt WHERE date=@date`)
    .run({ date, content, editedAt: now });
  if (res.changes === 0) return null;
  return getRecap(date, db);
}

export function listRecaps(db: Database.Database = getDb()): RecapHistoryItem[] {
  return db
    .prepare(
      `SELECT date, generated_at AS generatedAt, edited_at AS editedAt
       FROM daily_recaps ORDER BY date DESC`,
    )
    .all() as RecapHistoryItem[];
}

export function previewForDate(
  date: string,
  db: Database.Database = getDb(),
): RecapSessionPreview[] {
  return selectSessionsForDate(date, db).map((s) => ({
    provider: s.provider,
    sessionId: s.sessionId,
    name: sessionName(s),
    projectPath: s.projectPath,
    gitBranch: s.gitBranch,
    messageCount: s.messageCount,
    toolCallCount: s.toolCallCount,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w server run test -- recap`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/recap.ts server/test/recap.test.ts
git commit -m "feat(recap): persist, list, and preview daily recaps"
```

---

### Task 7: Claude CLI runner

**Files:**
- Create: `server/src/claudeCli.ts`

No unit test: this spawns the real `claude` binary, so it's kept thin and is exercised by manual verification (Task 12). The pure logic that feeds it is already tested.

- [ ] **Step 1: Implement the runner**

Create `server/src/claudeCli.ts`:

```typescript
import { spawn } from 'node:child_process';

export interface RunClaudeOptions {
  timeoutMs?: number;
  cwd?: string;
}

// Run `claude -p` headlessly, sending the prompt over stdin (avoids ARG_MAX with
// many sessions) and returning trimmed stdout. Pure text generation — no tools,
// so no permission flags are needed.
export function runClaudeHeadless(prompt: string, opts: RunClaudeOptions = {}): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p'], { cwd: opts.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));

    child.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (e.code === 'ENOENT') {
        reject(new Error('Claude CLI not found — install it to generate recaps.'));
      } else {
        reject(e);
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Recap generation timed out after ${timeoutMs / 1000}s.`));
        return;
      }
      if (code !== 0) {
        reject(new Error(err.trim() || `claude exited with code ${code}`));
        return;
      }
      const text = out.trim();
      if (!text) {
        reject(new Error('Claude returned an empty recap.'));
        return;
      }
      resolve(text);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm -w server run typecheck`
Expected: PASS (recap.ts's `import { runClaudeHeadless } from './claudeCli.js'` now resolves).

- [ ] **Step 3: Commit**

```bash
git add server/src/claudeCli.ts
git commit -m "feat(recap): add headless claude CLI runner"
```

---

### Task 8: Generation orchestration

**Files:**
- Modify: `server/src/recap.ts`
- Test: `server/test/recap.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `server/test/recap.test.ts`:

```typescript
import { generateRecap, NoSessionsError } from '../src/recap';

describe('generateRecap', () => {
  it('builds a prompt, runs the injected runner, and saves the result', async () => {
    const db = freshDb();
    insertSession(db, { sessionId: 'g1', title: 'Ship recap', updatedAt: '2026-06-23T09:00:00' });
    let seenPrompt = '';
    const fakeRun = async (prompt: string) => {
      seenPrompt = prompt;
      return '- Shipped the recap feature';
    };
    const recap = await generateRecap('2026-06-23', fakeRun, db);
    expect(seenPrompt).toContain('### Ship recap');
    expect(recap.content).toBe('- Shipped the recap feature');
    expect(recap.sessionIds).toEqual(['claude:g1']);
    expect(getRecap('2026-06-23', db)?.content).toBe('- Shipped the recap feature');
  });

  it('throws NoSessionsError when the day is empty (no runner call)', async () => {
    const db = freshDb();
    let called = false;
    const fakeRun = async () => {
      called = true;
      return 'x';
    };
    await expect(generateRecap('2026-06-23', fakeRun, db)).rejects.toBeInstanceOf(NoSessionsError);
    expect(called).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server run test -- recap`
Expected: FAIL — `generateRecap` / `NoSessionsError` not exported.

- [ ] **Step 3: Implement orchestration**

Append to `server/src/recap.ts`:

```typescript
// --- Orchestration ----------------------------------------------------------

export class NoSessionsError extends Error {
  constructor(date: string) {
    super(`No sessions on ${date}`);
    this.name = 'NoSessionsError';
  }
}

type RecapRunner = (prompt: string) => Promise<string>;

// `run` is injectable so the orchestration is unit-testable without spawning the
// CLI; production callers use the default `runClaudeHeadless`.
export async function generateRecap(
  date: string,
  run: RecapRunner = runClaudeHeadless,
  db: Database.Database = getDb(),
): Promise<DailyRecap> {
  const sessions = selectSessionsForDate(date, db);
  if (sessions.length === 0) throw new NoSessionsError(date);
  const prompt = buildRecapPrompt(date, sessions);
  const content = await run(prompt);
  const sessionIds = sessions.map((s) => `${s.provider}:${s.sessionId}`);
  return saveGeneratedRecap(date, content.trim(), sessionIds, null, db);
}
```

- [ ] **Step 4: Run the full server suite + typecheck**

Run: `npm -w server run test && npm -w server run typecheck`
Expected: PASS (all recap tests plus the existing suites; recap.ts now compiles end-to-end).

- [ ] **Step 5: Commit**

```bash
git add server/src/recap.ts server/test/recap.test.ts
git commit -m "feat(recap): orchestrate generate -> run -> save"
```

---

### Task 9: API routes

**Files:**
- Modify: `server/src/routes/api.ts` (imports near line 1-24; routes appended before the final closing `}` of `registerApi`)

- [ ] **Step 1: Add the import**

In `server/src/routes/api.ts`, after the existing imports (e.g. after the `launch.js` import block, around line 23), add:

```typescript
import {
  getRecap,
  previewForDate,
  generateRecap,
  saveEditedRecap,
  listRecaps,
  isValidDateString,
  NoSessionsError,
} from '../recap.js';
```

- [ ] **Step 2: Register the routes**

At the end of `registerApi`, just before its closing `}`, add:

```typescript
  app.get<{ Params: { date: string } }>('/api/recap/:date', async (req, reply) => {
    const { date } = req.params;
    if (!isValidDateString(date)) {
      reply.code(400);
      return { error: 'Invalid date (expected YYYY-MM-DD)' };
    }
    return { date, recap: getRecap(date), sessions: previewForDate(date) };
  });

  app.post<{ Params: { date: string } }>('/api/recap/:date/generate', async (req, reply) => {
    const { date } = req.params;
    if (!isValidDateString(date)) {
      reply.code(400);
      return { error: 'Invalid date (expected YYYY-MM-DD)' };
    }
    try {
      const recap = await generateRecap(date);
      return { recap };
    } catch (e: any) {
      if (e instanceof NoSessionsError) {
        reply.code(409);
        return { error: e.message };
      }
      reply.code(500);
      return { error: e?.message ?? 'Failed to generate recap' };
    }
  });

  app.put<{ Params: { date: string }; Body: { content?: string } }>(
    '/api/recap/:date',
    async (req, reply) => {
      const { date } = req.params;
      if (!isValidDateString(date)) {
        reply.code(400);
        return { error: 'Invalid date (expected YYYY-MM-DD)' };
      }
      const content = typeof req.body?.content === 'string' ? req.body.content : '';
      const recap = saveEditedRecap(date, content);
      if (!recap) {
        reply.code(404);
        return { error: 'No recap for that date yet' };
      }
      return { recap };
    },
  );

  app.get('/api/recaps', async () => ({ items: listRecaps() }));
```

- [ ] **Step 3: Typecheck**

Run: `npm -w server run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/api.ts
git commit -m "feat(api): daily recap routes (load, generate, save, history)"
```

---

### Task 10: Client API + route + nav

**Files:**
- Modify: `client/src/api.ts` (import block lines 1-12; `api` object before line 125 `}`)
- Modify: `client/src/router.ts:13`
- Modify: `client/src/App.vue:61` (nav array)

- [ ] **Step 1: Add client API methods**

In `client/src/api.ts`, add to the type import (after `SessionColor,`):

```typescript
  DailyRecap,
  RecapDay,
  RecapHistoryItem,
```

Then add these methods inside the `api` object (before the closing `};`):

```typescript
  getRecapDay: (date: string) => http<RecapDay>(`/api/recap/${date}`),

  generateRecap: (date: string) =>
    http<{ recap: DailyRecap }>(`/api/recap/${date}/generate`, { method: 'POST' }),

  saveRecap: (date: string, content: string) =>
    http<{ recap: DailyRecap }>(`/api/recap/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  listRecaps: () => http<{ items: RecapHistoryItem[] }>(`/api/recaps`),
```

- [ ] **Step 2: Add the route**

In `client/src/router.ts`, add to the `routes` array (after the `sessions` route, line ~6):

```typescript
  { path: '/daily', name: 'daily', component: () => import('./pages/Daily.vue') },
```

- [ ] **Step 3: Add the nav item**

In `client/src/App.vue`, add to the `nav` array (after the `Sessions` entry, around line 61):

```typescript
  {
    to: '/daily',
    label: 'Daily',
    icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  },
```

- [ ] **Step 4: Typecheck**

Run: `npm -w client run typecheck`
Expected: FAIL — `./pages/Daily.vue` does not exist yet. (Task 11 creates it; if you prefer a green checkpoint, do Task 11 before typechecking and commit together.)

- [ ] **Step 5: Commit**

```bash
git add client/src/api.ts client/src/router.ts client/src/App.vue
git commit -m "feat(client): wire up daily recap api, route, and nav"
```

---

### Task 11: Daily.vue page

**Files:**
- Create: `client/src/pages/Daily.vue`

- [ ] **Step 1: Create the page**

Create `client/src/pages/Daily.vue`:

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../api';
import { useToast } from '../composables/useToast';
import type { DailyRecap, RecapSessionPreview, RecapHistoryItem } from '@shared/types';

const toast = useToast();

function isoLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoLocalDate(d);
}

const date = ref(yesterday());
const sessions = ref<RecapSessionPreview[]>([]);
const recap = ref<DailyRecap | null>(null);
const content = ref('');
const history = ref<RecapHistoryItem[]>([]);
const loading = ref(false);
const generating = ref(false);

const dirty = computed(() => !!recap.value && content.value !== recap.value.content);
const plainText = computed(() =>
  content.value.replace(/^#{1,6}\s*/gm, '').replace(/^\s*[-*]\s+/gm, '• '),
);

async function load() {
  loading.value = true;
  try {
    const day = await api.getRecapDay(date.value);
    sessions.value = day.sessions;
    recap.value = day.recap;
    content.value = day.recap?.content ?? '';
  } catch (e: any) {
    toast.error(e?.message ?? 'Failed to load');
  } finally {
    loading.value = false;
  }
}

async function loadHistory() {
  try {
    history.value = (await api.listRecaps()).items;
  } catch {
    /* ignore */
  }
}

async function generate() {
  generating.value = true;
  try {
    const { recap: r } = await api.generateRecap(date.value);
    recap.value = r;
    content.value = r.content;
    toast.success('Recap generated');
    loadHistory();
  } catch (e: any) {
    toast.error(e?.message ?? 'Generation failed');
  } finally {
    generating.value = false;
  }
}

async function saveEdits() {
  if (!recap.value || !dirty.value) return;
  try {
    const { recap: r } = await api.saveRecap(date.value, content.value);
    recap.value = r;
    toast.success('Saved');
  } catch (e: any) {
    toast.error(e?.message ?? 'Save failed');
  }
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${label}`);
  } catch {
    toast.error('Copy failed');
  }
}

function pick(d: string) {
  date.value = d;
  load();
}

onMounted(() => {
  load();
  loadHistory();
});
</script>

<template>
  <div class="flex gap-6 p-6 max-w-6xl mx-auto w-full">
    <div class="flex-1 min-w-0 space-y-4">
      <div class="flex items-center gap-3 flex-wrap">
        <h1 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Daily Recap</h1>
        <input
          type="date"
          v-model="date"
          @change="load"
          class="px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm text-zinc-900 dark:text-zinc-100"
        />
        <button
          class="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-sm disabled:opacity-50"
          :disabled="generating || loading"
          @click="generate"
        >
          {{ generating ? 'Generating…' : recap ? 'Regenerate' : 'Generate' }}
        </button>
      </div>

      <div class="text-xs text-zinc-500">
        Sessions included ({{ sessions.length }})
      </div>
      <ul
        v-if="sessions.length"
        class="rounded border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/60"
      >
        <li
          v-for="s in sessions"
          :key="s.provider + s.sessionId"
          class="px-3 py-2 text-sm flex items-center justify-between gap-3"
        >
          <span class="truncate text-zinc-800 dark:text-zinc-200">{{ s.name }}</span>
          <span class="shrink-0 text-[11px] text-zinc-500">
            {{ s.projectPath?.split('/').filter(Boolean).pop() || '—' }}
            · {{ s.messageCount }}m / {{ s.toolCallCount }}t
          </span>
        </li>
      </ul>
      <div v-else class="text-sm text-zinc-500 py-6 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded">
        No sessions on {{ date }}. Pick another day.
      </div>

      <div v-if="recap || generating" class="space-y-2">
        <textarea
          v-model="content"
          @blur="saveEdits"
          rows="16"
          class="w-full px-3 py-2 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm font-mono text-zinc-900 dark:text-zinc-100 leading-relaxed"
          placeholder="Generated recap will appear here…"
        ></textarea>
        <div class="flex items-center gap-2">
          <button
            class="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-sm"
            @click="copy(content, 'markdown')"
          >
            Copy Markdown
          </button>
          <button
            class="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-sm"
            @click="copy(plainText, 'text')"
          >
            Copy Text
          </button>
          <span v-if="dirty" class="text-[11px] text-amber-500">unsaved — blur to save</span>
        </div>
      </div>
    </div>

    <aside class="w-56 shrink-0 space-y-2">
      <div class="text-xs text-zinc-500">History</div>
      <ul class="space-y-0.5">
        <li v-for="h in history" :key="h.date">
          <button
            class="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
            :class="h.date === date ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'"
            @click="pick(h.date)"
          >
            {{ h.date }}
            <span v-if="h.editedAt" class="text-[10px] text-zinc-400">· edited</span>
          </button>
        </li>
        <li v-if="!history.length" class="text-[11px] text-zinc-400 px-2 py-1">No recaps yet.</li>
      </ul>
    </aside>
  </div>
</template>
```

- [ ] **Step 2: Typecheck the client**

Run: `npm -w client run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Daily.vue
git commit -m "feat(client): Daily Recap page"
```

---

### Task 12: Build, restart, manual verification

**Files:** none (verification only)

- [ ] **Step 1: Full build + tests + typecheck**

Run: `npm run build && npm run typecheck && npm -w server run test`
Expected: build succeeds; typecheck clean; all tests pass.

- [ ] **Step 2: Restart the live service**

Run: `npm run service:restart`
Expected: pm2 shows `claude-codex-session-manager` online.

- [ ] **Step 3: Smoke-test the API**

Run:
```bash
curl -s "http://127.0.0.1:8787/api/recap/$(date -v-1d +%F)" | head -c 400; echo
curl -s "http://127.0.0.1:8787/api/recaps"; echo
```
Expected: the first returns `{"date":"…","recap":null,"sessions":[…]}` with yesterday's sessions; the second returns `{"items":[…]}`.

- [ ] **Step 4: Manual UI check**

Open http://127.0.0.1:8787, click **Daily** in the sidebar. Confirm:
- Date defaults to yesterday; "Sessions included (N)" lists that day's sessions.
- **Generate** produces a recap (spinner → text); editing + blur shows "Saved"; **Copy Markdown / Copy Text** work.
- The date appears in the **History** list; clicking a past date reloads it.
- Picking a day with no sessions shows the empty state and does not call the LLM.
- If `claude` is not on PATH, Generate surfaces "Claude CLI not found…".

- [ ] **Step 5: Final commit (if any docs/notes changed)**

```bash
git add -A
git commit -m "chore(recap): verified daily recap end-to-end" --allow-empty
```

---

## Self-Review Notes

- **Spec coverage:** report shape (digest+prompt past-tense bullets — Task 5); generation via `claude -p` (Tasks 7–8); default yesterday + date picker (Task 11 `yesterday()` + `<input type=date>`); auto-include all of a day's sessions (Task 4, no checkboxes); editable draft (Task 11 textarea + `saveEdits`); copy markdown/plain + saved history (Tasks 6, 11); `daily_recaps` table (Task 2); routes (Task 9); nav section (Task 10); error/empty/timeout handling (Tasks 7, 9, 11); last-activity selection limitation documented in spec & Task 4 comment. All covered.
- **Type consistency:** `RecapSession` (server-internal), `DailyRecap` / `RecapSessionPreview` / `RecapDay` / `RecapHistoryItem` (shared) used identically across server, API, and client. Method names match: `getRecapDay`, `generateRecap`, `saveRecap`, `listRecaps`; server exports `getRecap`, `previewForDate`, `generateRecap`, `saveEditedRecap`, `listRecaps`, `isValidDateString`, `NoSessionsError`.
- **Ordering note:** Tasks 3–8 build one module; `recap.ts` imports `claudeCli.js` (Task 7), so a clean full typecheck only passes from Task 8 onward — called out in Tasks 3 and 7. Run filtered tests (`-- recap`) during 3–6.
- **No placeholders:** every code step contains complete, runnable content.
