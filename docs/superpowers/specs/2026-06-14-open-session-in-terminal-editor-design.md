# Design: Open a session in the terminal or editor

Date: 2026-06-14
Status: Approved (pending spec review)

## Problem

Once you find a session in the manager, the only way to act on it is to copy the
resume command and paste it into a terminal yourself, then separately open the
project in an editor. Two quick actions on the session detail page would close that
loop: jump straight back into the conversation in a terminal, or open the project
folder in an editor.

## Goals

- **Open in terminal**: open a terminal already `cd`'d into the session's project
  folder AND auto-run the resume command (`claude --resume <id>` / `codex resume <id>`),
  so the session resumes immediately.
- **Open in editor**: open the session's project folder in the configured editor.
- Both the editor and terminal app are **configurable in Settings**, with macOS
  defaults (VS Code `code`, `Terminal`).

## Non-goals (YAGNI)

- Windows / Linux terminal support (editor spawn happens to work cross-platform, but
  terminal launching is macOS-only in this version).
- Buttons on session-list rows (detail page only for now).
- Opening a specific file or line.
- Free-text terminal app (AppleScript is app-specific, so the terminal is a fixed
  dropdown of supported apps).

## Approach

Chosen: **`osascript` (AppleScript) for the terminal, direct `spawn` for the editor.**
The terminal opens via an app-specific AppleScript that `cd`s and runs the resume
command; the editor opens by spawning the configured CLI with the project path as a
separate argv. This is the only approach that satisfies the "auto-run resume" goal
(rejected alternatives: `open -a <app> <path>` can't run a command; a temp `.command`
script ignores the iTerm preference and leaves temp files).

Because AppleScript differs per terminal app, the terminal picker is a **dropdown of
supported apps (`Terminal`, `iTerm`)** rather than free text, guaranteeing the resume
command actually runs.

## Detailed design

### Settings storage (`server/src/settings.ts`)

A new module over the existing `settings` table (`key TEXT PRIMARY KEY, value TEXT`).

```ts
export interface AppSettings {
  editorCommand: string;   // default 'code'
  terminalApp: 'Terminal' | 'iTerm'; // default 'Terminal'
}
export function getSettings(): AppSettings;          // returns defaults for missing keys
export function saveSettings(p: Partial<AppSettings>): AppSettings; // upserts provided keys
```

- `getSettings` reads rows `editorCommand` / `terminalApp`; any missing key falls back
  to its default. An unrecognized `terminalApp` value falls back to `Terminal`.
- `saveSettings` upserts only the provided keys and returns the full merged settings.

### Launch helpers (`server/src/launch.ts`)

Pure (unit-testable) helpers + the side-effecting launchers.

```ts
const SESSION_ID_RE = /^[A-Za-z0-9._-]+$/;

export function buildResumeCommand(provider: Provider, sessionId: string): string;
// throws if sessionId fails SESSION_ID_RE
// claude -> `claude --resume <id>` ; codex -> `codex resume <id>`

export function escapeForAppleScript(s: string): string;
// escapes backslash and double-quote for embedding inside an AppleScript string literal

export function buildTerminalAppleScript(
  app: 'Terminal' | 'iTerm',
  cwd: string,
  command: string,
): string;
// Terminal.app: tell application "Terminal" to do script "cd <cwd> && <command>" + activate
// iTerm:        tell application "iTerm" ... create window with default profile ... write text "cd <cwd> && <command>"
// cwd and command are passed through escapeForAppleScript; the shell-level `cd <cwd>`
// wraps cwd in single quotes after escaping any embedded single quotes.

export async function openInEditor(projectPath: string, editorCommand: string): Promise<void>;
// spawn(editorCommand, [projectPath], { detached: true, stdio: 'ignore' }).unref()
// rejects if spawn errors (e.g. ENOENT command not found)

export async function openInTerminal(
  projectPath: string,
  command: string,
  terminalApp: 'Terminal' | 'iTerm',
): Promise<void>;
// throws if process.platform !== 'darwin'
// spawn('osascript', ['-e', script], ...) where script = buildTerminalAppleScript(...)
```

Notes:
- The editor spawn passes `projectPath` as a discrete argv element (never through a
  shell), so a path with spaces/special chars cannot inject.
- The shell command embedded in AppleScript is `cd <single-quoted cwd> && <resume cmd>`.
  The resume command contains only the provider keyword and a validated sessionId, so
  it has no shell metacharacters.

### API (`server/src/routes/api.ts`)

- `GET /api/settings` → `getSettings()`
- `PUT /api/settings` (body: `Partial<AppSettings>`) → `saveSettings(body)`
- `POST /api/sessions/:provider/:sessionId/open-editor`
  - look up session via `getSession`; 404 if unknown.
  - if `projectPath` is null or does not exist on disk → 400 `{ error: 'no project path' }`.
  - else `await openInEditor(projectPath, getSettings().editorCommand)`; on spawn error → 500 `{ error: <message> }`.
- `POST /api/sessions/:provider/:sessionId/open-terminal`
  - same session/path lookup + validation.
  - `cmd = buildResumeCommand(provider, sessionId)`; `await openInTerminal(projectPath, cmd, getSettings().terminalApp)`.
  - non-macOS or osascript failure → 500 `{ error: <message> }`.

Both endpoints return `{ ok: true }` on success.

### Client

- `client/src/api.ts`:
  - `getSettings(): Promise<AppSettings>`
  - `saveSettings(p: Partial<AppSettings>): Promise<AppSettings>`
  - `openInEditor(provider, sessionId): Promise<{ ok: true }>`
  - `openInTerminal(provider, sessionId): Promise<{ ok: true }>`
- `client/src/pages/SessionDetail.vue`: in the Resume row, add two buttons —
  **Terminal** and **Editor** — each calling the matching endpoint and showing a
  success toast ("Opening in Terminal…" / "Opening in editor…") or an error toast with
  the server message.
- `client/src/pages/Settings.vue`: a new "Integrations" section at the top with an
  editor-command text input (default `code`) and a terminal-app `<select>` (`Terminal` /
  `iTerm`), loaded from `GET /api/settings` on mount and saved via `PUT /api/settings`
  (a Save button, mirroring the Private notes pattern).
- `shared/types.ts`: add `AppSettings` (and the `'Terminal' | 'iTerm'` literal).

## Error handling

| Condition | Result |
|---|---|
| Unknown session | 404, toast "Session not found" |
| `projectPath` null / not on disk | 400, toast "No project folder recorded for this session." |
| Editor command not found (ENOENT) | 500, toast "Couldn't launch '<cmd>' — make sure it's installed and on your PATH." |
| Terminal launch on non-macOS | 500, toast "Open in terminal is only supported on macOS." |
| `osascript` failure | 500, toast with the error message |
| `sessionId` fails format guard | 400 (defensive; should never happen for indexed sessions) |

## Security

- The open-endpoints accept only `provider` + `sessionId`. The folder path comes from
  the indexed session record, never from the client.
- `sessionId` is validated against `^[A-Za-z0-9._-]+$` before it is placed into the
  resume command.
- `cwd` and `command` are escaped for AppleScript; `cwd` is additionally single-quoted
  at the shell level.
- Editor launch passes the path as argv (no shell interpolation).
- `editorCommand` is user-configured on the user's own machine (trusted); it is run via
  `spawn` without a shell, with the project path as its sole argument.

## Testing

- `buildResumeCommand`: correct command per provider; throws on a bad sessionId.
- `escapeForAppleScript`: escapes `"` and `\`.
- `buildTerminalAppleScript`: contains the `cd` + command for Terminal; uses the iTerm
  form for `iTerm`; embeds escaped cwd/command.
- `getSettings`: returns defaults on an empty DB; reads stored values; coerces an unknown
  `terminalApp` to `Terminal`. `saveSettings`: persists and merges partial updates.
  (Tested against an in-memory SQLite DB via the exported `initSchema`, like the search tests.)
- Actual editor/terminal launching is verified manually on macOS.

## Rollout

Pure additive feature — no migration. New settings default in code, so existing
installs work without any stored settings rows.
