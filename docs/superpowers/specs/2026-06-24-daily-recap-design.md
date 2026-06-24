# Daily Recap — Design Spec

**Date:** 2026-06-24
**Status:** Draft for review
**Author:** Avijit Ghosh (with Claude)

## 1. Problem & Goal

The user runs an agentic workflow: multiple Claude/Codex sessions per day, each
driving a different task. Every morning they need to submit a daily update
("what I worked on"). Reconstructing that by hand from many sessions is tedious.

**Goal:** a new **Daily Recap** section that, for a chosen day (default
*yesterday*), gathers that day's sessions and produces an **accomplishments
recap** — a concise, editable, copy-ready standup update — and keeps a history of
past recaps.

### Locked decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Report shape | Accomplishments recap (grouped bullets of tasks worked on) |
| Generation | AI via the `claude` CLI headless (`claude -p`), reusing existing auth — no API key |
| Default scope | Yesterday's activity; a date picker allows any day |
| Curation | Auto-include all of the day's sessions; the **generated text** is editable |
| Output | Copy to clipboard (markdown + plain text) **and** save each day's recap as history |
| Generation strategy | **Approach A** — one `claude -p` call over compact per-session digests (not full transcripts) |

### Non-goals (v1 / YAGNI)

- Pushing to Slack / Jira / email (copy-to-clipboard only).
- Deep per-session transcript summaries (approach B) — possible future toggle.
- Checkbox selection of which sessions are included (auto-include is enough).
- Scheduled/auto pre-generation (cron) — noted as a future enhancement.
- Multi-user.

## 2. User Flow

1. User opens **Daily** in the nav. Date defaults to **yesterday**.
2. The page shows **"Sessions included (N)"** — a read-only list of that day's
   sessions (name, project, message/tool counts) so the user sees the input.
3. User clicks **Generate** (labeled **Regenerate** if a recap already exists).
   A spinner shows while `claude -p` runs.
4. The generated markdown appears in an **editable** text area. The user tweaks
   wording, then clicks **Copy Markdown** or **Copy Text**.
5. The recap is **saved** for that date. A **History** list lets the user revisit
   or re-copy past days. Edits autosave (on blur) and are persisted.
6. If there are **no sessions** for the day, no LLM call is made; the page shows
   "No sessions on <date>" and invites picking another date.

## 3. Architecture

New, isolated server module + one new client page. No changes to existing
indexing/launch logic.

```
client/src/pages/Daily.vue ──► /api/recap/:date         (GET  load day: saved recap + session preview)
                              ►/api/recap/:date/generate (POST run claude, save, return recap)
                              ►/api/recap/:date          (PUT  save edited content)
                              ►/api/recaps               (GET  history list)
                                        │
                          server/src/routes/api.ts (thin handlers)
                                        │
                          server/src/recap.ts ──────────► server/src/claudeCli.ts
                          (select / digest / prompt /     (runClaudeHeadless: spawn `claude -p`,
                           DB get·save·list / orchestrate) write prompt to stdin, capture stdout)
                                        │
                          SQLite: daily_recaps table
```

### 3.1 Data model

New table (created in `server/src/db.ts`, following the existing `CREATE TABLE
IF NOT EXISTS` + migration pattern):

```sql
CREATE TABLE IF NOT EXISTS daily_recaps (
  date         TEXT PRIMARY KEY,   -- 'YYYY-MM-DD', the day being recapped (server local time)
  content      TEXT NOT NULL,      -- markdown recap (generated, then user-editable)
  session_ids  TEXT NOT NULL,      -- JSON array of "provider:sessionId" included at generation time
  model        TEXT,               -- model string if the CLI reports one, else null
  generated_at TEXT NOT NULL,      -- ISO timestamp of last generation
  edited_at    TEXT                -- ISO timestamp of last manual edit, null if never edited
);
```

One row per date. Regenerating overwrites `content`, `session_ids`, `model`,
`generated_at` and resets `edited_at` to null. Manual save updates `content` and
`edited_at`.

### 3.2 Session selection — `selectSessionsForDate(date): RecapSession[]`

- Compute the local-time day window `[startOfDay(date), startOfDay(date)+24h)`.
- Include a session when its **last activity** falls in the window:
  `COALESCE(updated_at, iso(mtime))` ∈ window.
- Exclude `archived = 1`.
- Order chronologically (activity ascending); the prompt groups by project.
- **Known limitation (documented):** selection uses *last activity*, so a session
  worked on across midnight is attributed to the day it was last touched. This is
  good enough for a daily standup; a future refinement could scan per-message
  timestamps for exact day membership.

`RecapSession` carries the fields needed for the digest and the UI preview:
`provider, sessionId, displayName|title, projectPath, gitBranch, model,
firstUserMessage, messageCount, toolCallCount, hasSubagents, hasTodos,
noteSummary`.

### 3.3 Per-session digest — `buildSessionDigest(s): string` (pure, tested)

Compact markdown block per session, with `maskSecrets()` applied to free text and
long fields trimmed (~280 chars):

```
### <display name or title> — <project basename> (<git_branch>)
- Intent: <first_user_message, trimmed + masked>
- Activity: <messageCount> messages, <toolCallCount> tool calls[, subagents][, todos]
- Notes: <note.summary, masked>        # line omitted when empty
```

### 3.4 Prompt — `buildRecapPrompt(date, digests): string` (pure, tested)

One instruction followed by all digests, e.g.:

> Write my daily accomplishments recap for a standup, covering work done on
> **<date>**. Below are the AI coding sessions I worked on that day. Produce
> markdown bullet points grouped by project. Each bullet is one concrete
> accomplishment in past tense, first person, specific and plain. Merge related
> sessions; omit trivial/empty ones. Do not invent work not evidenced below.
> Output only the recap — no preamble.
>
> Sessions:
> <digests>

### 3.5 LLM runner — `runClaudeHeadless(prompt, opts): Promise<string>`

(`server/src/claudeCli.ts`, deliberately thin and isolated so it can be mocked.)

- `spawn('claude', ['-p'], { stdio: ['pipe','pipe','pipe'] })`, write the prompt
  to **stdin** (avoids `ARG_MAX` limits with many sessions), close stdin.
- Capture stdout = recap text. Apply a timeout (default **90s**).
- Errors: `ENOENT` → `"Claude CLI not found — install it to generate recaps."`;
  non-zero exit → error including stderr; empty/whitespace stdout → treated as
  failure.
- No tools / no `--dangerously-skip-permissions` needed (pure text generation).

### 3.6 Orchestration — `generateRecap(date): Promise<DailyRecap>`

`selectSessionsForDate` → if empty, throw a typed "no sessions" condition (handler
returns a friendly empty state, no LLM call) → else build digests → build prompt →
`runClaudeHeadless` → `saveRecap(date, content, sessionIds, model)` → return row.

### 3.7 DB helpers (in `recap.ts`)

`getRecap(date)`, `saveGeneratedRecap(...)`, `saveEditedRecap(date, content)`,
`listRecaps()`.

## 4. API

| Method & path | Purpose | Response |
|---|---|---|
| `GET /api/recap/:date` | Load a day: saved recap (or null) **plus** session preview | `{ date, recap: DailyRecap \| null, sessions: RecapSessionPreview[] }` |
| `POST /api/recap/:date/generate` | Run claude, save, return recap (long-running) | `{ recap: DailyRecap }` or `{ error }` |
| `PUT /api/recap/:date` | Save edited content | `{ recap: DailyRecap }` |
| `GET /api/recaps` | History list | `{ items: { date, generatedAt, editedAt }[] }` |

- `:date` validated against `^\d{4}-\d{2}-\d{2}$`; invalid → 400.
- Future dates are allowed but yield an empty session set.

## 5. Client

- **Route:** `/daily`, name `daily`, lazy `Daily.vue` (matches existing router).
- **Nav:** add a **Daily** link alongside Dashboard / Projects / Sessions /
  Settings in `App.vue`.
- **`Daily.vue` layout:**
  - Header: "Daily Recap", a date input (default yesterday), and a
    **Generate/Regenerate** button with spinner + disabled-while-running state.
  - Main: **Sessions included (N)** read-only list; below it an **editable
    textarea** prefilled with generated/saved markdown, plus **Copy Markdown** /
    **Copy Text** buttons. Edits autosave on blur via `PUT`.
  - Side: **History** list of past recap dates (click to load).
  - Empty state when the day has no sessions.
  - Markdown preview is a nice-to-have, not required for v1 (plain textarea ships).
- **`api.ts`:** add `getRecap(date)`, `generateRecap(date)`, `saveRecap(date,
  content)`, `listRecaps()`.
- **`shared/types.ts`:** add `DailyRecap` and `RecapSessionPreview`.

## 6. Error Handling

| Condition | Behavior |
|---|---|
| `claude` CLI missing | API returns a clear error; UI shows install hint; prior content kept |
| Generation timeout/non-zero exit | Error surfaced; existing saved content untouched |
| No sessions for the day | No LLM call; friendly empty state |
| Empty LLM output | Treated as failure (not saved) |
| Invalid date param | 400 |

## 7. Testing

- **`server/test/recap.test.ts`** (in-memory DB, like existing tests):
  - `selectSessionsForDate`: window boundary inclusivity, `archived` excluded,
    `mtime` fallback when `updated_at` null.
  - `buildSessionDigest`: trimming, secret masking, note line omitted when empty.
  - `buildRecapPrompt`: contains the date, the instruction, and every digest.
  - date validation helper.
- **DB migration test:** `daily_recaps` table exists after migration.
- `runClaudeHeadless` is intentionally thin and **not** unit-tested (spawns the
  real CLI); the testable logic lives in the pure builders.
- Client `vue-tsc` typecheck passes.

## 8. Future Enhancements (not in v1)

- "Deep summary" toggle (approach B) for a chosen day.
- Scheduled pre-generation so the recap is ready in the morning (the app already
  runs under pm2; a cron or internal timer could call `generateRecap`).
- Push to Slack / Jira / email.
- Group-by toggles (project vs chronological) and per-session include/exclude.
