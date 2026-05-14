# Claude & Codex Session Manager

> A local, read-only browser for your **Claude Code** and **OpenAI Codex CLI** sessions. Find that thing you asked the AI three weeks ago, check how much context you've burned, and copy the exact command to resume any session in your terminal.

![Status: alpha](https://img.shields.io/badge/status-alpha-orange)
![Node](https://img.shields.io/badge/node-%E2%89%A520.10-brightgreen)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)

---

## Why

Both Claude Code and Codex CLI store every session as JSONL files on your disk. They're a goldmine — every prompt you've sent, every file you've changed, every model reply — but the CLIs don't give you a way to *browse* them. This app does:

- Cross-provider search across **all** your past AI work
- Per-session **context usage %** with "needs compact?" guidance
- One-click **copy resume command** (`claude --resume <id>` / `codex resume <id>`)
- **Markdown export** of any session for sharing or archival
- Private **notes & tags** stored separately from the AI's own files

The originals in `~/.claude/` and `~/.codex/` are never touched.

## Features

- **Unified session list** across Claude and Codex with provider filters, project filters, branch filters, FTS5-powered text search.
- **Session detail page** with full conversation timeline (user / assistant / reasoning / tool calls / tool results), with secret masking and resume command at the top.
- **Context window tracker** — knows your model's window (200K / 1M for Claude, value from Codex's `task_started` event), shows % used, recommends `/compact` when over 75%.
- **Token breakdown** — input, output, cache write, cache read, all in one card.
- **Dashboard** with totals, active sessions (last hour), top projects.
- **Markdown export** organized by project under `~/Documents/ai-session-exports/`.
- **Private notes** with status (important / follow-up / archived / lesson), tags, summary, follow-ups, lessons learned — stored in your app data folder, never inside `~/.claude` or `~/.codex`.
- **Watch mode** — `chokidar` watches `~/.claude/projects` and `~/.codex/sessions`; index refreshes automatically when sessions update.
- **Secret masking** — best-effort regex masking of API keys, JWTs, private key blocks, and `.env`-style assignments in previews and exports.

## Requirements

- **Node.js 20.10 or newer** (Node 22 recommended — `.nvmrc` pins to 22)
- macOS, Linux, or Windows
- An existing install of [Claude Code](https://docs.claude.com/claude-code) and/or [OpenAI Codex CLI](https://github.com/openai/codex) — the app reads whatever is there

## Quick start

```bash
# 1. Clone
git clone https://github.com/avighoshjit567/ai-agent-session-manager.git
cd ai-agent-session-manager

# 2. (Recommended) match Node version
nvm use   # reads .nvmrc → Node 22

# 3. Install dependencies (compiles the better-sqlite3 native binary)
npm install

# 4. Run in dev mode (server + Vite client with hot reload)
npm run dev
# open http://localhost:5173
```

On first launch the indexer scans your `~/.claude/projects/**/*.jsonl` and `~/.codex/sessions/**/*.jsonl` files — should complete in well under a second even for hundreds of sessions.

### Production single-process build

```bash
npm run build
npm start
# open http://localhost:8787
```

`npm start` serves the built Vue client and the Fastify API from one port — no separate dev server needed.

### Configuration

Environment variables (all optional):

| Variable    | Default     | Description                                |
| ----------- | ----------- | ------------------------------------------ |
| `PORT`      | `8787`      | HTTP port for the server                   |
| `HOST`      | `127.0.0.1` | Bind address. Keep it on loopback.         |
| `LOG_LEVEL` | `info`      | Pino log level: `trace` to `fatal`         |

## Where things are stored

| Purpose             | Path                                                                |
| ------------------- | ------------------------------------------------------------------- |
| Source of truth     | `~/.claude/` and `~/.codex/` (read-only)                            |
| Index cache (DB)    | App data dir — see below                                            |
| Private notes       | App data dir / `notes/<provider>-<session_id>.md`                   |
| Markdown exports    | `~/Documents/ai-session-exports/<project>/<date>-<provider>-…md`    |

**App data directory:**

- macOS: `~/Library/Application Support/claude-codex-session-manager/`
- Linux: `$XDG_DATA_HOME/claude-codex-session-manager/` or `~/.local/share/claude-codex-session-manager/`
- Windows: `%APPDATA%\claude-codex-session-manager\`

The whole app data directory is safe to delete — it'll rebuild from your `~/.claude` and `~/.codex` files on next launch. Your notes won't survive a delete though, so back those up if you've written any.

## Privacy & safety

- **Read-only on source data.** The app opens Claude's JSONL files and Codex's SQLite databases in read mode only. Your original session files are never modified.
- **Auth files are never read.** `~/.codex/auth.json`, `~/.codex/config.toml`, `~/.claude/settings.json`, and `~/.claude/settings.local.json` are explicitly excluded.
- **Full-content indexing is OFF.** Only session titles, project paths, branch names, and the first user message of each session are indexed for search. Tool outputs are not indexed.
- **Best-effort secret masking** in previews and exports — regex patterns for `sk-*`, `ghp_*`, JWTs, `BEGIN PRIVATE KEY` blocks, AWS keys, and `.env`-style assignments. This is not a security boundary; if your sessions contain real secrets, don't share the exports.
- **Loopback-only server by default** — `HOST=127.0.0.1`. Don't bind to `0.0.0.0` unless you know what you're doing.

## How it works

```
┌─────────────────────────┐    ┌──────────────────────────┐
│  ~/.claude/projects/    │    │  ~/.codex/sessions/      │
│    *.jsonl  (truth)     │    │  ~/.codex/state_*.sqlite │
└───────────┬─────────────┘    └────────────┬─────────────┘
            │                               │
            └────────┬──────────────────────┘
                     │ Adapters parse + normalize
                     ▼
            ┌─────────────────────┐      Watcher (chokidar)
            │ Indexer (TypeScript)│ ◀──── debounced re-scan
            └──────────┬──────────┘
                       ▼
            ┌──────────────────────┐
            │   SQLite + FTS5      │  ← index cache only
            │  (app data dir)      │
            └──────────┬───────────┘
                       ▼
            ┌──────────────────────┐
            │  Fastify API         │
            │  /api/sessions, …    │
            └──────────┬───────────┘
                       ▼
            ┌──────────────────────┐
            │  Vue 3 + Vite + TW   │
            │   localhost:5173/87  │
            └──────────────────────┘
```

- **`server/src/adapters/claude.ts`** — parses Claude's JSONL events: user, assistant (text/thinking/tool_use), tool_result. Strips IDE-injected wrappers (`<ide_opened_file>`, `<system-reminder>`).
- **`server/src/adapters/codex.ts`** — reads Codex's `state_*.sqlite` for thread metadata, then parses each rollout JSONL. Handles `event_msg/{user,agent}_message`, `response_item/function_call`, etc. Skips developer/system role messages (the "permissions instructions" block).
- **`server/src/indexer.ts`** — orchestrates both adapters, upserts into SQLite, refreshes the FTS5 row, and cleans up entries for deleted sessions.
- **`server/src/db.ts`** — schema with idempotent migrations: new columns are added via `ALTER TABLE` so upgrading doesn't lose your notes.

## Troubleshooting

**"better-sqlite3 was compiled against a different Node.js version"**

The native module was built for a different Node than you're running. Fix:

```bash
npm rebuild better-sqlite3
```

The server has a startup health check that catches this and prints the same instruction — if you see it, run the command above.

**Dashboard shows 0 sessions**

1. Confirm `~/.claude/projects/` or `~/.codex/sessions/` actually exist and contain `.jsonl` files
2. Click **Rebuild index** in the sidebar
3. Check the server console for parse errors

**Port already in use**

```bash
PORT=9000 npm run dev   # or any free port
```

The Vite proxy in `client/vite.config.ts` is hardcoded to `127.0.0.1:8787`; if you change `PORT`, update that too.

**Context window shows wrong value for Claude**

The app guesses your Claude context window from the model name and observed input sizes. If the model name in your session isn't recognized, the default is 200K. If you observe a value that's clearly wrong, open an issue with the model string from a sample session — the lookup table in `server/src/adapters/claude.ts` is easy to extend.

## Roadmap

- Session relationship visualization (Claude's `parentUuid`, Codex's `thread_spawn_edges`)
- Optional opt-in full-content search (assistant messages, tool calls)
- Cross-session diff: "what did Claude vs. Codex do for the same task?"
- GitHub PR linking by branch + timestamp
- Bundle as a Tauri app (drop the localhost step entirely)

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Tech stack

- **Server:** TypeScript, Fastify 5, better-sqlite3 (with FTS5), chokidar
- **Client:** Vue 3 + Vite 6 + TypeScript, Tailwind CSS v4, vue-router
- **Build:** Plain npm workspaces, no monorepo tooling

## License

MIT — see [LICENSE](LICENSE).
