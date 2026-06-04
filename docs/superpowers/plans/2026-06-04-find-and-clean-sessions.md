# Find & Clean Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sessions findable by full conversation content (with highlighted match snippets and better auto-titles), and give the session detail view a clean conversation-only reading mode.

**Architecture:** Server-side, the SQLite FTS5 table `sessions_fts` gains a `body` column populated from each session's user+assistant text during indexing; search MATCHes across it, ranks with `bm25`, and returns a `snippet()` excerpt. Titles are derived with a pure heuristic (no LLM). Client-side, search results render the highlighted snippet, and the detail timeline filters to user/assistant/metadata items only.

**Tech Stack:** TypeScript, Fastify, better-sqlite3 (FTS5), Vue 3 + Vite, Vitest (added here for the pure logic).

---

## File Structure

**Server**
- Create `server/src/extract.ts` — pure helpers: `deriveTitle`, `cleanForTitle`, `capWords`, `capBody`, `stripInjected`. No imports; fully unit-testable.
- Modify `server/src/db.ts` — add `body` FTS column + one-time migration + reindex flag; export `initSchema`.
- Modify `server/src/adapters/claude.ts` — derive title, collect `body`, return `body` from parse.
- Modify `server/src/adapters/codex.ts` — derive title, collect `body`, return `{ session, body }` from enrich.
- Modify `server/src/indexer.ts` — thread `body` into `upsertSession` and the FTS insert.
- Modify `server/src/index.ts` — run a one-time forced reindex when the FTS migration fired.
- Modify `server/src/search.ts` — MATCH `body`, `bm25` ordering, `snippet()` → `matchSnippet`.
- Create `server/test/extract.test.ts`, `server/test/db-migration.test.ts`, `server/test/search-fts.test.ts`.
- Modify `server/package.json` — add vitest + `test` script.

**Shared**
- Modify `shared/types.ts` — add `SessionListItem` (Session + optional `matchSnippet`).

**Client**
- Create `client/src/lib/highlight.ts` — pure `highlightSnippet` (XSS-safe).
- Create `client/src/lib/timeline.ts` — pure `visibleTimelineItems`.
- Modify `client/src/api.ts` — `sessions()` returns `SessionListItem[]`.
- Modify `client/src/components/SessionList.vue` — render match snippet; accept `SessionListItem[]`.
- Modify `client/src/components/SessionTimeline.vue` — filter to user/assistant/metadata; drop tool/reasoning branches and the `showToolResults` prop.
- Modify `client/src/pages/SessionDetail.vue` — remove "Show tool results" toggle; add an export-only "Include tool outputs" checkbox.
- Modify `client/src/pages/Sessions.vue`, `client/src/pages/Search.vue` — type refs as `SessionListItem[]`; update Search copy.
- Create `client/test/highlight.test.ts`, `client/test/timeline.test.ts`.
- Modify `client/package.json` — add vitest + `test` script.

---

## Task 1: Add Vitest to both workspaces

**Files:**
- Modify: `server/package.json`
- Modify: `client/package.json`
- Modify: `package.json` (root)

- [ ] **Step 1: Install vitest in both workspaces**

Run:
```bash
npm -w server install -D vitest@^2 && npm -w client install -D vitest@^2
```
Expected: both installs complete, `node_modules/.bin/vitest` now exists.

- [ ] **Step 2: Add `test` scripts**

In `server/package.json`, add to `"scripts"`:
```json
    "test": "vitest run"
```
In `client/package.json`, add to `"scripts"`:
```json
    "test": "vitest run"
```
In root `package.json`, add to `"scripts"`:
```json
    "test": "npm -w server run test && npm -w client run test"
```

- [ ] **Step 3: Verify install**

Run:
```bash
npm ls -w server vitest && npm ls -w client vitest
```
Expected: prints a `vitest@2.x.x` line for each workspace (no "missing").

- [ ] **Step 4: Commit**

```bash
git add server/package.json client/package.json package.json package-lock.json
git commit -m "chore: add vitest to server and client workspaces"
```

---

## Task 2: Pure title/body helpers (`extract.ts`)

**Files:**
- Create: `server/src/extract.ts`
- Test: `server/test/extract.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/test/extract.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { deriveTitle, cleanForTitle, capWords, capBody } from '../src/extract';

describe('cleanForTitle', () => {
  it('strips system-reminder noise and takes the first non-empty line', () => {
    const raw = '<system-reminder>do X</system-reminder>\n\n  Fix the billing bug  \nmore text';
    expect(cleanForTitle(raw)).toBe('Fix the billing bug');
  });

  it('collapses internal whitespace', () => {
    expect(cleanForTitle('hello    world')).toBe('hello world');
  });

  it('returns empty string for null/empty', () => {
    expect(cleanForTitle(null)).toBe('');
    expect(cleanForTitle('')).toBe('');
  });
});

describe('capWords', () => {
  it('returns text unchanged when under the cap', () => {
    expect(capWords('short title', 80)).toBe('short title');
  });

  it('truncates on a word boundary with an ellipsis', () => {
    const long = 'this is a very long title that keeps going well beyond the eighty character cap limit here';
    const out = capWords(long, 80);
    expect(out.length).toBeLessThanOrEqual(81); // 80 + ellipsis char
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/); // no trailing space before ellipsis
  });
});

describe('deriveTitle', () => {
  it('prefers a real ai-title', () => {
    expect(deriveTitle('Refactor auth', 'please refactor the auth module')).toBe('Refactor auth');
  });

  it('falls back to the cleaned first user message', () => {
    expect(deriveTitle(null, '<system-reminder>x</system-reminder>\nSet up SSL redirect')).toBe('Set up SSL redirect');
  });

  it('returns null when nothing usable remains', () => {
    expect(deriveTitle('  ', '<system-reminder>only noise</system-reminder>')).toBeNull();
  });
});

describe('capBody', () => {
  it('truncates to the max length', () => {
    expect(capBody('a'.repeat(10), 4)).toBe('aaaa');
  });
  it('returns empty for empty input', () => {
    expect(capBody('', 4)).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm -w server run test
```
Expected: FAIL — cannot resolve `../src/extract` (module does not exist).

- [ ] **Step 3: Implement `extract.ts`**

Create `server/src/extract.ts`:
```ts
// Pure, dependency-free helpers for deriving session titles and search bodies.

const TITLE_MAX = 80;

const INJECTED_TAGS = [
  'ide_opened_file',
  'ide_selection',
  'system-reminder',
  'command-name',
  'command-message',
  'command-args',
  'local-command-stdout',
];

export function stripInjected(text: string): string {
  let out = text;
  for (const tag of INJECTED_TAGS) {
    out = out.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g'), '');
  }
  return out;
}

export function cleanForTitle(raw: string | null | undefined): string {
  if (!raw) return '';
  const stripped = stripInjected(raw);
  const firstLine = stripped
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return (firstLine ?? '').replace(/\s+/g, ' ').trim();
}

export function capWords(text: string, max = TITLE_MAX): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  const base = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return base.trimEnd() + '…';
}

export function deriveTitle(
  aiTitle: string | null | undefined,
  firstUserMessage: string | null | undefined,
): string | null {
  const ai = (aiTitle ?? '').trim();
  if (ai) return capWords(ai);
  const cleaned = cleanForTitle(firstUserMessage);
  if (!cleaned) return null;
  return capWords(cleaned);
}

export function capBody(text: string, maxChars = 200_000): string {
  if (!text) return '';
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm -w server run test
```
Expected: PASS — all `extract` tests green.

- [ ] **Step 5: Commit**

```bash
git add server/src/extract.ts server/test/extract.test.ts
git commit -m "feat(server): add pure title/body extraction helpers"
```

---

## Task 3: FTS `body` column + migration (`db.ts`)

**Files:**
- Modify: `server/src/db.ts`
- Test: `server/test/db-migration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/test/db-migration.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm -w server run test -- db-migration
```
Expected: FAIL — `initSchema`, `ftsReindexRequired`, `clearFtsReindexRequired` are not exported.

- [ ] **Step 3: Implement the migration + flag in `db.ts`**

In `server/src/db.ts`, add the flag near the top (after the `let db` line):
```ts
let ftsReindex = false;
export function ftsReindexRequired(): boolean {
  return ftsReindex;
}
export function clearFtsReindexRequired(): void {
  ftsReindex = false;
}
```

Change the signature from `function initSchema(` to:
```ts
export function initSchema(d: Database.Database): void {
```

Immediately AFTER the `for (const [name, type] of newCols)` ALTER loop and BEFORE the `d.exec(\`` block that creates indexes/FTS/notes/settings, insert:
```ts
  // FTS5 cannot ALTER ADD COLUMN. If an older sessions_fts exists without `body`,
  // drop it here and flag a one-time forced reindex to repopulate the column.
  const existingFtsCols = (
    d.prepare(`PRAGMA table_info(sessions_fts)`).all() as any[]
  ).map((c) => c.name as string);
  if (existingFtsCols.length > 0 && !existingFtsCols.includes('body')) {
    d.exec(`DROP TABLE sessions_fts`);
    ftsReindex = true;
  }
```

In the `CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(` block, add the `body` column right after `first_user_message,`:
```sql
    CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
      provider UNINDEXED,
      session_id UNINDEXED,
      title,
      project_path,
      git_branch,
      first_user_message,
      body,
      tokenize = 'porter unicode61'
    );
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm -w server run test -- db-migration
```
Expected: PASS — both migration tests green.

- [ ] **Step 5: Commit**

```bash
git add server/src/db.ts server/test/db-migration.test.ts
git commit -m "feat(server): add FTS body column with one-time reindex migration"
```

---

## Task 4: Search over `body` + snippet + ranking (`search.ts`, `shared/types.ts`)

**Files:**
- Modify: `shared/types.ts`
- Modify: `server/src/search.ts`
- Test: `server/test/search-fts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/test/search-fts.test.ts`:
```ts
import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import { initSchema } from '../src/db';

const START = String.fromCharCode(2);

function seed(db: Database.Database) {
  const ins = db.prepare(
    `INSERT INTO sessions_fts
       (provider, session_id, title, project_path, git_branch, first_user_message, body)
     VALUES (?,?,?,?,?,?,?)`,
  );
  ins.run('claude', 'a', 'Fix billing bug', '/p', 'main', 'please fix billing',
    'we changed the invoice generator and the redis cache layer');
  ins.run('claude', 'b', 'Unrelated chat', '/p', 'main', 'hello there',
    'we discussed kubernetes deployment strategy');
}

describe('FTS body search', () => {
  it('finds a session by a term that appears only in the conversation body', () => {
    const db = new Database(':memory:');
    initSchema(db);
    seed(db);
    const row = db.prepare(
      `SELECT session_id,
              snippet(sessions_fts, 6, char(2), char(3), '…', 12) AS snip
       FROM sessions_fts WHERE sessions_fts MATCH ? ORDER BY bm25(sessions_fts)`,
    ).get('redis') as any;
    expect(row.session_id).toBe('a');
    expect(row.snip).toContain(START);
    expect(String(row.snip).toLowerCase()).toContain('redis');
  });

  it('ranks the strongest match first via bm25', () => {
    const db = new Database(':memory:');
    initSchema(db);
    seed(db);
    const rows = db.prepare(
      `SELECT session_id FROM sessions_fts WHERE sessions_fts MATCH ? ORDER BY bm25(sessions_fts)`,
    ).all('billing') as any[];
    expect(rows[0].session_id).toBe('a');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm -w server run test -- search-fts
```
Expected: FAIL — the `body` column / 7-column insert does not exist yet on a DB built by the *current* `initSchema` if Task 3 wasn't applied; if Task 3 is applied this test should already PASS (it validates Task 3's schema). If it PASSES here, that's fine — it locks in the column index (6) and snippet/bm25 behavior. Proceed regardless.

- [ ] **Step 3: Add the `SessionListItem` type**

In `shared/types.ts`, after the `Session` interface, add:
```ts
export interface SessionListItem extends Session {
  // Highlighted FTS snippet of the body match, using  /  sentinels.
  // Present only for content search results; null otherwise.
  matchSnippet?: string | null;
}
```

- [ ] **Step 4: Wire body search, snippet, and ranking into `search.ts`**

In `server/src/search.ts`, change the type import line to:
```ts
import type { Session, SessionFilter, SessionListItem } from '../../shared/types.js';
```

Update the `listSessions` return type:
```ts
export function listSessions(filter: SessionFilter): { items: SessionListItem[]; total: number } {
```

After the block that sets `joinFts`/`where.push('sessions_fts MATCH @q')` and before `const whereSql = ...`, add:
```ts
  const hasQuery = !!(filter.q && filter.q.trim());
  const snippetSelect = hasQuery
    ? `, snippet(sessions_fts, 6, char(2), char(3), '…', 12) AS matchSnippet`
    : '';
  const orderSql = hasQuery
    ? `ORDER BY bm25(sessions_fts)`
    : `ORDER BY COALESCE(s.updated_at, s.created_at) DESC`;
```

Replace the existing `rows` query and the `return` at the end of `listSessions` with:
```ts
  const rows = db
    .prepare(
      `SELECT ${COLS}${snippetSelect} FROM sessions s ${joinFts} ${whereSql}
       ${orderSql}
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...args, limit, offset }) as any[];

  return {
    items: rows.map((r) => ({ ...toSession(r), matchSnippet: r.matchSnippet ?? null })),
    total: totalRow.c,
  };
```

(The body MATCH itself needs no extra code: `sessions_fts MATCH @q` already searches every indexed column, which now includes `body`.)

- [ ] **Step 5: Run the test + typecheck to verify**

Run:
```bash
npm -w server run test -- search-fts && npm -w server run typecheck
```
Expected: PASS — search-fts tests green AND server typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts server/src/search.ts server/test/search-fts.test.ts
git commit -m "feat(server): search conversation body with bm25 ranking and snippets"
```

---

## Task 5: Populate `body` + derived titles during indexing (adapters + indexer + startup)

**Files:**
- Modify: `server/src/adapters/claude.ts`
- Modify: `server/src/adapters/codex.ts`
- Modify: `server/src/indexer.ts`
- Modify: `server/src/index.ts`

This task is verified by typecheck + a manual dev-run checkpoint (no unit test — it reads real session files).

- [ ] **Step 1: Claude adapter — derive title and collect body**

In `server/src/adapters/claude.ts`:

Add to the imports at the top:
```ts
import { deriveTitle, capBody, stripInjected } from '../extract.js';
```

Change the `ClaudeParseResult` interface to carry the body:
```ts
interface ClaudeParseResult {
  session: Session;
  events: ClaudeEvent[];
  body: string;
}
```

Inside `parseClaudeSession`, add a body accumulator next to the other `let` declarations (e.g. after `let hasSubagents = false;`):
```ts
  const bodyParts: string[] = [];
```

In the `if (ev.type === 'user' && !ev.isSidechain)` block, after `messageCount++;`, collect user text into the body:
```ts
      const userText = extractText(ev.message);
      if (userText) bodyParts.push(stripInjected(userText));
```
(Keep the existing `if (!firstUserMessage) { firstUserMessage = extractText(ev.message); }` line as-is.)

In the `if (ev.type === 'assistant')` block, inside the existing `if (m && Array.isArray(m.content))` loop, collect assistant text alongside the tool-use count:
```ts
      if (m && Array.isArray(m.content)) {
        for (const c of m.content) {
          if (c && c.type === 'tool_use') toolCallCount++;
          if (c && c.type === 'text' && typeof c.text === 'string') bodyParts.push(c.text);
        }
      }
```

Replace the `firstUserMessage` and `title` handling at the `const session: Session = {` construction. First, just before building `session`, add:
```ts
  const cleanedFirst = firstUserMessage ? cleanFirstMessage(firstUserMessage) : null;
  const derivedTitle = deriveTitle(title, cleanedFirst);
  const body = capBody(bodyParts.join('\n'));
```
Then in the `session` object literal, change the `title` and `firstUserMessage` fields to:
```ts
    title: derivedTitle,
    ...
    firstUserMessage: cleanedFirst,
```
(Replace the existing `title,` and `firstUserMessage: firstUserMessage ? cleanFirstMessage(firstUserMessage) : null,` lines.)

Finally, change the return statement:
```ts
  return { session, events, body };
```

- [ ] **Step 2: Codex adapter — derive title and collect body**

In `server/src/adapters/codex.ts`:

Add to the imports at the top:
```ts
import { deriveTitle, capBody } from '../extract.js';
```

In `listCodexThreads`, change the `title` field of the constructed `session` from `title: r.title || null,` to:
```ts
        title: deriveTitle(r.title || null, r.first_user_message || null),
```

Change `enrichCodexSession`'s signature and body to also return the conversation body:
```ts
export async function enrichCodexSession(session: Session): Promise<{ session: Session; body: string }> {
  if (!session.sourcePath || !fs.existsSync(session.sourcePath)) {
    return { session, body: '' };
  }
  let messageCount = 0;
  let toolCallCount = 0;
  let contextWindow: number | null = null;
  let lastContextTokens: number | null = null;
  const bodyParts: string[] = [];

  for await (const ev of readJsonl(session.sourcePath)) {
    if (!ev || typeof ev !== 'object') continue;
    const evType = ev.type;
    const p = ev.payload ?? {};
    const pType = p.type;

    if (evType === 'event_msg') {
      if (pType === 'user_message' || pType === 'agent_message') {
        messageCount++;
        const txt = typeof p.message === 'string' ? p.message : extractCodexText(p);
        if (txt) bodyParts.push(txt);
      }
      if (pType === 'task_started' && typeof p.model_context_window === 'number') {
        contextWindow = p.model_context_window;
      }
      if (pType === 'token_count' && p.info && typeof p.info === 'object') {
        const info = p.info as Record<string, unknown>;
        const cand = num(info.total_token_usage_input) || num(info.total_input_tokens) || num(info.input_tokens);
        if (cand > 0) lastContextTokens = cand;
      }
    } else if (evType === 'response_item') {
      if (pType === 'function_call' || pType === 'custom_tool_call') toolCallCount++;
    }
  }

  return {
    session: {
      ...session,
      messageCount,
      toolCallCount,
      contextWindow,
      lastContextTokens,
    },
    body: capBody(bodyParts.join('\n')),
  };
}
```

- [ ] **Step 3: Indexer — thread body into upsert + FTS insert**

In `server/src/indexer.ts`:

In the Claude loop, change:
```ts
        const { session } = await parseClaudeSession(f);
        upsertSession(session, f.mtime);
```
to:
```ts
        const { session, body } = await parseClaudeSession(f);
        upsertSession(session, f.mtime, body);
```

In the Codex loop, change:
```ts
        const enriched = await enrichCodexSession(session);
        upsertSession(enriched, mtime);
```
to:
```ts
        const { session: enriched, body } = await enrichCodexSession(session);
        upsertSession(enriched, mtime, body);
```

Change `upsertSession`'s signature:
```ts
function upsertSession(s: Session, mtime: number, body: string): void {
```

In the FTS refresh block at the end of `upsertSession`, add the `body` column to the insert:
```ts
  db.prepare(
    `INSERT INTO sessions_fts (provider, session_id, title, project_path, git_branch, first_user_message, body)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    s.provider,
    s.sessionId,
    s.title ?? '',
    s.projectPath ?? '',
    s.gitBranch ?? '',
    s.firstUserMessage ?? '',
    body ?? '',
  );
```

- [ ] **Step 4: Startup — run a one-time forced reindex after migration**

In `server/src/index.ts`, change the import:
```ts
import { runFullIndex } from './indexer.js';
```
to:
```ts
import { runFullIndex } from './indexer.js';
import { getDb, ftsReindexRequired, clearFtsReindexRequired } from './db.js';
```

Replace the "Kick off initial index" block with:
```ts
  // Ensure schema/migrations are applied before reading the reindex flag.
  getDb();
  const force = ftsReindexRequired();
  if (force) {
    app.log.info('FTS schema migrated — running a one-time full reindex to populate search bodies.');
  }
  runFullIndex({ force })
    .then((s) => {
      clearFtsReindexRequired();
      app.log.info(
        `Initial index complete: claude=${s.claudeSessions} codex=${s.codexSessions} errors=${s.errors.length}`,
      );
    })
    .catch((e) => {
      app.log.error({ err: e }, 'Initial index failed');
    });
```

- [ ] **Step 5: Typecheck**

Run:
```bash
npm -w server run typecheck
```
Expected: PASS — no type errors (confirms the `enrichCodexSession`/`parseClaudeSession`/`upsertSession` signature changes line up at every call site).

- [ ] **Step 6: Manual dev-run checkpoint**

Run the app and confirm content search works end to end:
```bash
npm run dev
```
Then in the browser (default http://127.0.0.1:5173 or the printed client URL):
1. Wait for the initial index log line to appear in the server output.
2. Go to **Search**, type a word you know appears *inside* a conversation (not in any title), and confirm a session is returned with a highlighted snippet.
3. Confirm Codex sessions and previously-untitled sessions now show a readable title in the list.

Expected: content matches appear; titles are populated. Stop the dev server when done (Ctrl-C).

- [ ] **Step 7: Commit**

```bash
git add server/src/adapters/claude.ts server/src/adapters/codex.ts server/src/indexer.ts server/src/index.ts
git commit -m "feat(server): index conversation bodies and derive titles during indexing"
```

---

## Task 6: Client — highlighted match snippets in the list

**Files:**
- Create: `client/src/lib/highlight.ts`
- Test: `client/test/highlight.test.ts`
- Modify: `client/src/api.ts`
- Modify: `client/src/components/SessionList.vue`
- Modify: `client/src/pages/Sessions.vue`
- Modify: `client/src/pages/Search.vue`

- [ ] **Step 1: Write the failing test**

Create `client/test/highlight.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { highlightSnippet } from '../src/lib/highlight';

const S = '';
const E = '';

describe('highlightSnippet', () => {
  it('returns empty string when there is no highlight sentinel', () => {
    expect(highlightSnippet('plain text')).toBe('');
    expect(highlightSnippet(null)).toBe('');
    expect(highlightSnippet(undefined)).toBe('');
  });

  it('wraps sentinel-marked terms in <mark> tags', () => {
    const out = highlightSnippet(`use ${S}redis${E} cache`);
    expect(out).toContain('<mark');
    expect(out).toContain('redis');
    expect(out).toContain('</mark>');
  });

  it('escapes HTML in the surrounding content (no injection)', () => {
    const out = highlightSnippet(`<img src=x> ${S}hit${E}`);
    expect(out).toContain('&lt;img src=x&gt;');
    expect(out).not.toContain('<img');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm -w client run test -- highlight
```
Expected: FAIL — cannot resolve `../src/lib/highlight`.

- [ ] **Step 3: Implement `highlight.ts`**

Create `client/src/lib/highlight.ts`:
```ts
// Converts an FTS5 snippet (using  /  sentinels around matched terms)
// into safe highlighted HTML. All non-sentinel content is HTML-escaped, so
// arbitrary conversation text can never inject markup.
const START = '';
const END = '';

export function highlightSnippet(raw: string | null | undefined): string {
  if (!raw || !raw.includes(START)) return '';
  const escaped = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .split(START)
    .join('<mark class="bg-amber-200/70 dark:bg-amber-400/25 text-inherit rounded-sm px-0.5">')
    .split(END)
    .join('</mark>');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm -w client run test -- highlight
```
Expected: PASS — all highlight tests green.

- [ ] **Step 5: Update the client API return type**

In `client/src/api.ts`, change the type import to include `SessionListItem`:
```ts
import type {
  Session,
  SessionListItem,
  TimelineItem,
  ProjectSummary,
  Note,
  Provider,
  SessionFilter,
} from '@shared/types';
```
Change the `sessions` method's return generic from `{ items: Session[]; total: number }` to:
```ts
    return http<{ items: SessionListItem[]; total: number }>(
```

- [ ] **Step 6: Render the snippet in `SessionList.vue`**

In `client/src/components/SessionList.vue`:

Change the type import:
```ts
import type { SessionListItem } from '@shared/types';
```
Change the props line to:
```ts
const props = defineProps<{ sessions: SessionListItem[]; loading?: boolean }>();
```
Add the highlight import below the other imports:
```ts
import { highlightSnippet } from '../lib/highlight';
```
Update every `Session` type annotation in the helper functions (`open`, `preview`, `resumeCmd`) to `SessionListItem` (they are structurally compatible — just keep the script typechecking).

In the template, inside the title cell (`<td class="px-3 py-2.5 max-w-[420px]">`), directly after the `<div ... line-clamp-2">{{ preview(s) }}</div>` line, add:
```html
            <div
              v-if="highlightSnippet(s.matchSnippet)"
              class="mt-1 text-[11.5px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-snug"
              v-html="highlightSnippet(s.matchSnippet)"
            ></div>
```

- [ ] **Step 7: Type the page refs as `SessionListItem[]`**

In `client/src/pages/Sessions.vue`, change the import `import type { Session, SessionFilter } from '@shared/types';` to:
```ts
import type { SessionListItem, SessionFilter } from '@shared/types';
```
and change `const items = ref<Session[]>([]);` to:
```ts
const items = ref<SessionListItem[]>([]);
```

In `client/src/pages/Search.vue`, change `import type { Session } from '@shared/types';` to:
```ts
import type { SessionListItem } from '@shared/types';
```
and change `const items = ref<Session[]>([]);` to:
```ts
const items = ref<SessionListItem[]>([]);
```
Also update the description line so it reflects content search — change:
```html
      <p class="text-sm text-zinc-500">Searches titles, project paths, branches, and first prompts.</p>
```
to:
```html
      <p class="text-sm text-zinc-500">Searches full conversation content — titles, prompts, and everything said in the session.</p>
```

- [ ] **Step 8: Typecheck the client**

Run:
```bash
npm -w client run typecheck
```
Expected: PASS — no type errors.

- [ ] **Step 9: Commit**

```bash
git add client/src/lib/highlight.ts client/test/highlight.test.ts client/src/api.ts client/src/components/SessionList.vue client/src/pages/Sessions.vue client/src/pages/Search.vue
git commit -m "feat(client): show highlighted content-match snippets in session list"
```

---

## Task 7: Client — clean conversation-only detail view

**Files:**
- Create: `client/src/lib/timeline.ts`
- Test: `client/test/timeline.test.ts`
- Modify: `client/src/components/SessionTimeline.vue`
- Modify: `client/src/pages/SessionDetail.vue`

- [ ] **Step 1: Write the failing test**

Create `client/test/timeline.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { visibleTimelineItems } from '../src/lib/timeline';
import type { TimelineItem } from '@shared/types';

function item(type: TimelineItem['type'], id: string): TimelineItem {
  return { id, provider: 'claude', sessionId: 's', type, timestamp: null, content: 'x' };
}

describe('visibleTimelineItems', () => {
  it('keeps user, assistant, and metadata items', () => {
    const items = [item('user', '1'), item('assistant', '2'), item('metadata', '3')];
    expect(visibleTimelineItems(items).map((i) => i.id)).toEqual(['1', '2', '3']);
  });

  it('removes tool_call, tool_result, reasoning, and system items', () => {
    const items = [
      item('user', '1'),
      item('tool_call', '2'),
      item('tool_result', '3'),
      item('reasoning', '4'),
      item('system', '5'),
      item('assistant', '6'),
    ];
    expect(visibleTimelineItems(items).map((i) => i.id)).toEqual(['1', '6']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
npm -w client run test -- timeline
```
Expected: FAIL — cannot resolve `../src/lib/timeline`.

- [ ] **Step 3: Implement `timeline.ts`**

Create `client/src/lib/timeline.ts`:
```ts
import type { TimelineItem } from '@shared/types';

// The clean detail view shows only the human/assistant conversation, plus the
// thin metadata dividers that mark session/compaction boundaries. Tool calls,
// tool results, reasoning, and system items are intentionally hidden here
// (the Markdown export still includes tool outputs when requested).
const VISIBLE: ReadonlySet<TimelineItem['type']> = new Set([
  'user',
  'assistant',
  'metadata',
]);

export function visibleTimelineItems(items: TimelineItem[]): TimelineItem[] {
  return items.filter((it) => VISIBLE.has(it.type));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
npm -w client run test -- timeline
```
Expected: PASS — both timeline tests green.

- [ ] **Step 5: Filter the timeline component**

Replace the entire contents of `client/src/components/SessionTimeline.vue` `<script setup>` block with:
```ts
import { computed } from 'vue';
import type { TimelineItem } from '@shared/types';
import CopyButton from './CopyButton.vue';
import { visibleTimelineItems } from '../lib/timeline';

const props = defineProps<{ items: TimelineItem[] }>();

const visible = computed(() => visibleTimelineItems(props.items));

function fmtTs(ts: string | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString();
}
```

In the template, change the loop source from `items` to `visible`:
```html
    <template v-for="it in visible" :key="it.id">
```
Delete the three template branches that are no longer reachable: the `tool_call` block (`<div v-else-if="it.type === 'tool_call'" ...>`), the `tool_result` block (`<details v-else-if="it.type === 'tool_result' && showToolResults" ...>`), and the `reasoning` block (`<details v-else-if="it.type === 'reasoning'" ...>`). Keep the `user`, `assistant`, and `metadata` branches and the empty-state `<div v-if="items.length === 0">`.

(The `truncate` helper and the `showToolResults` prop are now unused and have been removed by the script replacement above.)

- [ ] **Step 6: Update `SessionDetail.vue` — remove the timeline toggle, keep export option**

In `client/src/pages/SessionDetail.vue`:

Rename the ref. Change:
```ts
const showToolResults = ref(false);
```
to:
```ts
const includeToolOutputs = ref(false);
```

In `doExport`, change `includeToolOutputs: showToolResults.value,` to:
```ts
      includeToolOutputs: includeToolOutputs.value,
```

In the template controls row, remove the "Show tool results" checkbox label entirely:
```html
            <label class="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 cursor-pointer">
              <input type="checkbox" v-model="showToolResults" class="accent-zinc-500" />
              Show tool results
            </label>
```
Then, inside the `<div class="ml-auto flex items-center gap-2">` export group, add an export-scoped checkbox immediately before the export `<button>`:
```html
              <label class="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 cursor-pointer">
                <input type="checkbox" v-model="includeToolOutputs" class="accent-zinc-500" />
                Include tool outputs
              </label>
```

Change the timeline usage from:
```html
          <SessionTimeline :items="timeline" :show-tool-results="showToolResults" />
```
to:
```html
          <SessionTimeline :items="timeline" />
```

- [ ] **Step 7: Typecheck the client**

Run:
```bash
npm -w client run typecheck
```
Expected: PASS — no type errors (confirms the removed prop/ref are not referenced anywhere).

- [ ] **Step 8: Manual dev-run checkpoint**

Run:
```bash
npm run dev
```
Open a session with tool calls and confirm:
1. The detail view shows only your messages and the assistant's replies (plus any thin metadata divider lines).
2. No tool-call/reasoning/tool-result blocks appear.
3. "Include tool outputs" + Export Markdown still produces an export with tool outputs when checked.

Expected: clean reading view; export option intact. Stop the dev server when done.

- [ ] **Step 9: Commit**

```bash
git add client/src/lib/timeline.ts client/test/timeline.test.ts client/src/components/SessionTimeline.vue client/src/pages/SessionDetail.vue
git commit -m "feat(client): clean conversation-only session detail view"
```

---

## Task 8: Full verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Run all tests**

Run:
```bash
npm test
```
Expected: PASS — server and client suites all green.

- [ ] **Step 2: Run full typecheck**

Run:
```bash
npm run typecheck
```
Expected: PASS — both workspaces clean.

- [ ] **Step 3: Production build**

Run:
```bash
npm run build
```
Expected: client and server builds succeed with no errors.

- [ ] **Step 4: Commit (only if any fixups were needed)**

```bash
git add -A
git commit -m "chore: verification fixups for find-and-clean-sessions"
```
(Skip if nothing changed.)

---

## Self-Review Notes

- **Spec coverage:** Full-content search (Tasks 3–5), match snippets (Tasks 4, 6), better titles (Tasks 2, 5), clean detail view (Task 7), metadata dividers kept (Task 7, `VISIBLE` set), export keeps tool outputs (Task 7). One-time reindex migration (Tasks 3, 5). All spec sections map to tasks.
- **Type consistency:** `deriveTitle`/`capBody`/`stripInjected`/`cleanForTitle`/`capWords` (extract.ts) used identically in adapters. `SessionListItem` defined in Task 4, consumed in Task 6. `enrichCodexSession` returns `{ session, body }` (Task 5 step 2) and is destructured that way in the indexer (Task 5 step 3). `parseClaudeSession` returns `{ session, events, body }` and is destructured in the indexer. `upsertSession(s, mtime, body)` matches both call sites. FTS column index `6` (body) is consistent between the schema (Task 3), search snippet (Task 4), and the test (Task 4). Sentinels ``/`` are consistent between `char(2)`/`char(3)` in SQL and `highlightSnippet` in the client.
- **No placeholders:** every code step contains complete code.
