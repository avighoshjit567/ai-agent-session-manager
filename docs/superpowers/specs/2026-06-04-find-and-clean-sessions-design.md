# Design: Easier session finding + a clean conversation-only detail view

Date: 2026-06-04
Status: Approved (pending spec review)

## Problem

Two pains in the Claude & Codex session manager:

1. **Sessions are hard to find.** Search (`sessions_fts`) only indexes title, project
   path, branch, and the first user message. If you remember something said *inside*
   a conversation, search can't find it. Titles are also often missing or just a noisy
   truncated first prompt, so the list is hard to scan and identify.
2. **The session detail view is cluttered.** It interleaves tool calls, reasoning, and
   tool results with the actual conversation. The user wants a polished view showing
   only their own messages and the assistant's replies.

## Goals

- Find a session by **anything that was said in it** (full conversation content), with a
  visible reason (snippet) for why each result matched.
- Give every session a **useful title**, including Codex sessions that have none today.
- A session detail view that shows **only user + assistant messages**, with subtle
  metadata dividers retained for flow.

## Non-goals (YAGNI)

- LLM-generated summaries/titles (heuristic only; no external API calls).
- A separate per-message `messages` table or "jump to matching message".
- Semantic / vector search.
- Date-range filter UI.

## Approach

Chosen approach for content search: **add a `body` column to the existing FTS table**
(vs. a separate messages table, or query-time grep). Reuses existing FTS5 machinery,
ranks with `bm25`, and produces highlighted match excerpts via `snippet()` with the
least new code. One-time reindex required.

## Detailed design

### 1. Full-content search (server)

**Schema (`server/src/db.ts`)**
- `sessions_fts` gains a `body` column. FTS5 cannot `ALTER ... ADD COLUMN`, so this is a
  migration: detect the old FTS shape, `DROP TABLE sessions_fts`, recreate it with the new
  column set (`title, project_path, git_branch, first_user_message, body`), and force a
  full reindex on next startup so existing rows get a `body`.
- Migration must be idempotent and safe to run repeatedly (guard on whether `body` exists,
  e.g. via `PRAGMA table_info(sessions_fts)` / `pragma_table_info`).

**Indexing (`server/src/indexer.ts` + adapters)**
- Each adapter, when parsing a session, produces a `body` string: the concatenated text of
  all `user` + `assistant` messages, in order, separated by newlines.
- The `body` is **capped at ~200 KB per session** (truncate with a trailing marker) to bound
  DB size. Log/skip silently on cap — no error.
- `upsertSession` writes `body` into the `sessions_fts` insert alongside the existing fields.
- `body` is carried on the parse result, not on the persisted `sessions` table (it only lives
  in FTS). The `Session` type does not gain a `body` field.

**Search (`server/src/search.ts`)**
- The FTS `MATCH` now spans all indexed columns including `body`.
- Results are ordered by `bm25(sessions_fts)` (best match first) when a query `q` is present;
  otherwise the current `updated_at DESC` ordering is preserved.
- When `q` is present, each row also returns a `matchSnippet`: `snippet(sessions_fts, <body col
  index>, '<mark>', '</mark>', '…', 12)`. Falls back to `null` when no body match.

**API / types (`shared/types.ts`)**
- Add an optional `matchSnippet?: string | null` to the search result item shape (returned only
  by search/list calls that pass `q`). It is not a stored `Session` field.

### 2. Search results show why they matched (client)

- `SessionList.vue` (or a thin wrapper) renders `matchSnippet` under the title when present,
  with the `<mark>` highlight styled (e.g. subtle yellow/violet background). Rendered via a
  sanitized highlight — only `<mark>` tags from our own `snippet()` output are allowed; all
  other text is escaped to avoid HTML injection from conversation content.
- `Search.vue` description updated to reflect that it now searches full conversation content.
- Sessions page filter box benefits automatically (same backend).

### 3. Better titles (server, heuristic)

- New helper `deriveTitle(rawFirstUserMessage, aiTitle?)` (shared util used by both adapters):
  1. If a real `ai-title` exists, use it.
  2. Else clean the first user message: strip `<system-reminder>` blocks, leading slash-command
     tokens, and boilerplate; take the first non-empty line; collapse whitespace; cap ~80 chars
     with an ellipsis on a word boundary.
  3. If nothing usable remains, leave `title` null (UI still falls back to "(no title)").
- Applied in both `adapters/claude.ts` and `adapters/codex.ts` so Codex sessions get titles.
- Existing `cleanFirstMessage` logic is reused/extended rather than duplicated.

### 4. Clean session detail view (client)

- `SessionDetail.vue` / `SessionTimeline.vue`: by default render **only `user` and `assistant`**
  items, plus the existing thin **`metadata` divider** lines (kept for flow/understanding).
- `tool_call`, `tool_result`, and `reasoning` items are **not rendered** in this view. The
  "Show tool results" checkbox is removed from the detail header.
- No server change — the timeline endpoint still returns all item types; filtering is in the
  component. Nothing is lost.
- Markdown **export keeps its existing "include tool outputs" option** for when the full trace
  is needed.

## Data flow

```
source files ──parse──> { session meta, body, derivedTitle }
                              │
                  upsertSession ─> sessions (meta) + sessions_fts (meta + body)
                              │
   search(q) ─> FTS MATCH (incl. body) ─bm25─> rows + snippet() ─> client list (title + highlight)
   open ─> timeline endpoint (all items) ─> SessionTimeline filters to user/assistant/metadata
```

## Error handling

- FTS migration: wrapped so a failure to drop/recreate logs and leaves the app usable
  (search degrades to previous columns rather than crashing).
- `body` extraction failures for a single session are caught per-session (existing
  per-session try/catch in the indexer) and do not abort the run.
- Snippet rendering escapes all non-`<mark>` HTML.

## Testing

- Search: a session whose match term appears only mid-conversation is returned; a session
  with the term in the title ranks at/above one matching only in body; snippet contains the
  term wrapped in `<mark>`.
- Migration: running against an old DB (no `body` column) recreates FTS and reindexes; running
  again is a no-op.
- Titles: Codex session with a multi-line first message gets a concise single-line title;
  system-reminder noise is stripped; ai-title is preferred when present.
- Clean view: detail view shows no tool_call/tool_result/reasoning items; metadata dividers and
  user/assistant messages still render; export with tool outputs still works.

## Rollout

- One forced reindex on first run after upgrade (existing `runFullIndex({ force })` path).
  Reindex cost is bounded by existing parsing; acceptable for a local tool.
