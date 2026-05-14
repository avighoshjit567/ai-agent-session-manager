# Contributing

Thanks for your interest. This is a small project — keep PRs focused and we'll merge quickly.

## Setup

```bash
git clone https://github.com/<your-fork>/ai-agent-session-manager.git
cd ai-agent-session-manager
nvm use           # Node 22 from .nvmrc
npm install
npm run dev
```

The dev server runs Vite (5173) + Fastify (8787) with hot reload on both.

## Project layout

```
shared/        # TypeScript types shared by server and client
server/        # Fastify API + adapters + indexer (Node, TypeScript)
  src/
    adapters/  # Per-provider session parsing
    routes/    # Fastify route handlers
client/        # Vue 3 + Vite + Tailwind
  src/
    pages/     # Route-level pages
    components/
    composables/
```

## Before you submit

1. **Type-check**: `npm run typecheck` (both packages)
2. **Build**: `npm run build` — must succeed
3. **Manual test**: run `npm run dev`, open the affected pages, exercise your change
4. **Don't bundle unrelated changes** — one focused PR per change

## Areas where contributions are welcome

- **New adapter event types** — if your Claude or Codex CLI version emits an event we don't handle, add it. Adapter files are `server/src/adapters/claude.ts` and `codex.ts`.
- **Model context window map** — extend the `CLAUDE_CONTEXT_WINDOWS` table in `server/src/adapters/claude.ts` when new Claude models ship.
- **Secret masking patterns** — `server/src/privacy.ts`. Add patterns for token formats you've actually seen leak.
- **Cross-platform polish** — the path resolution in `server/src/paths.ts` handles macOS / Linux / Windows. If something is off on your platform, fix and explain in the PR.
- **Tauri packaging** — desktop bundle is on the roadmap; happy to take a PR.

## Style

- Follow the patterns already in the file you're editing.
- Don't reach for new dependencies without a strong reason.
- Comments are for *why*, not *what* — well-named identifiers handle the rest.

## Commit messages

Conventional-ish, short:

```
fix: codex user_message events were never parsed
feat: context window detection for Sonnet 4.6 1M variant
docs: clarify cross-platform app data paths
```

No template required.
