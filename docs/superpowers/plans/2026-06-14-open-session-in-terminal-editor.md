# Open Session in Terminal / Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Open in terminal" (cd + auto-run resume command) and "Open in editor" actions to the session detail page, with the editor command and terminal app configurable in Settings.

**Architecture:** Two new server modules — `settings.ts` (read/write the existing `settings` table) and `launch.ts` (pure command/AppleScript builders + `spawn`-based launchers). Four new API endpoints. Client gets two buttons in the detail Resume row and an Integrations section in Settings. Pure builders are unit-tested; actual launching is verified manually on macOS.

**Tech Stack:** TypeScript (ESM/NodeNext), Fastify, better-sqlite3, Vue 3 + Vite, Vitest, macOS `osascript`.

---

## File Structure

- `shared/types.ts` — add `TerminalApp` + `AppSettings`.
- `server/src/settings.ts` (new) — `getSettings(db?)`, `saveSettings(partial, db?)` over the `settings` table.
- `server/src/launch.ts` (new) — pure: `buildResumeCommand`, `escapeForAppleScript`, `buildTerminalAppleScript`; side-effecting: `openInEditor`, `openInTerminal`.
- `server/src/routes/api.ts` — 4 endpoints: GET/PUT `/api/settings`, POST open-editor, POST open-terminal.
- `server/test/settings.test.ts`, `server/test/launch.test.ts` (new).
- `client/src/api.ts` — 4 client methods + cleaner error messages.
- `client/src/pages/SessionDetail.vue` — Terminal/Editor buttons in the Resume row.
- `client/src/pages/Settings.vue` — Integrations section.

---

## Task 1: Shared types + settings module

**Files:**
- Modify: `shared/types.ts`
- Create: `server/src/settings.ts`
- Test: `server/test/settings.test.ts`

- [ ] **Step 1: Add shared types**

In `shared/types.ts`, append:
```ts
export type TerminalApp = 'Terminal' | 'iTerm';

export interface AppSettings {
  editorCommand: string;
  terminalApp: TerminalApp;
}
```

- [ ] **Step 2: Write the failing test**

Create `server/test/settings.test.ts`:
```ts
import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import { initSchema } from '../src/db';
import { getSettings, saveSettings } from '../src/settings';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

describe('settings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(getSettings(freshDb())).toEqual({ editorCommand: 'code', terminalApp: 'Terminal' });
  });

  it('persists and merges partial updates', () => {
    const db = freshDb();
    saveSettings({ editorCommand: 'cursor' }, db);
    expect(getSettings(db)).toEqual({ editorCommand: 'cursor', terminalApp: 'Terminal' });
    saveSettings({ terminalApp: 'iTerm' }, db);
    expect(getSettings(db)).toEqual({ editorCommand: 'cursor', terminalApp: 'iTerm' });
  });

  it('coerces an unknown terminalApp back to the default', () => {
    const db = freshDb();
    db.prepare(`INSERT INTO settings (key, value) VALUES ('terminalApp', 'bogus')`).run();
    expect(getSettings(db).terminalApp).toBe('Terminal');
  });

  it('ignores a blank editor command and uses the default', () => {
    const db = freshDb();
    saveSettings({ editorCommand: '   ' }, db);
    expect(getSettings(db).editorCommand).toBe('code');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm -w server run test -- settings`
Expected: FAIL — cannot resolve `../src/settings`.

- [ ] **Step 4: Implement `settings.ts`**

Create `server/src/settings.ts`:
```ts
import Database from 'better-sqlite3';
import { getDb } from './db.js';
import type { AppSettings, TerminalApp } from '../../shared/types.js';

const DEFAULTS: AppSettings = { editorCommand: 'code', terminalApp: 'Terminal' };
const VALID_TERMINALS: TerminalApp[] = ['Terminal', 'iTerm'];

export function getSettings(db: Database.Database = getDb()): AppSettings {
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as Array<{ key: string; value: string }>;
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const editorCommand = (map.get('editorCommand') ?? '').trim() || DEFAULTS.editorCommand;
  const rawTerminal = map.get('terminalApp') as TerminalApp | undefined;
  const terminalApp = rawTerminal && VALID_TERMINALS.includes(rawTerminal) ? rawTerminal : DEFAULTS.terminalApp;
  return { editorCommand, terminalApp };
}

export function saveSettings(partial: Partial<AppSettings>, db: Database.Database = getDb()): AppSettings {
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  if (typeof partial.editorCommand === 'string') {
    upsert.run({ key: 'editorCommand', value: partial.editorCommand });
  }
  if (typeof partial.terminalApp === 'string') {
    upsert.run({ key: 'terminalApp', value: partial.terminalApp });
  }
  return getSettings(db);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm -w server run test -- settings`
Expected: PASS — all 4 settings tests green.

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts server/src/settings.ts server/test/settings.test.ts
git commit -m "feat(server): add app settings module (editor command, terminal app)"
```

---

## Task 2: Launch helpers (`launch.ts`)

**Files:**
- Create: `server/src/launch.ts`
- Test: `server/test/launch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/test/launch.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  buildResumeCommand,
  escapeForAppleScript,
  buildTerminalAppleScript,
} from '../src/launch';

describe('buildResumeCommand', () => {
  it('builds the claude resume command', () => {
    expect(buildResumeCommand('claude', 'abc-123')).toBe('claude --resume abc-123');
  });
  it('builds the codex resume command', () => {
    expect(buildResumeCommand('codex', 'abc-123')).toBe('codex resume abc-123');
  });
  it('rejects a session id with shell metacharacters', () => {
    expect(() => buildResumeCommand('claude', 'a; rm -rf /')).toThrow();
  });
});

describe('escapeForAppleScript', () => {
  it('escapes backslashes and double quotes', () => {
    expect(escapeForAppleScript('a"b\\c')).toBe('a\\"b\\\\c');
  });
});

describe('buildTerminalAppleScript', () => {
  it('uses Terminal.app do script form with cd and command', () => {
    const s = buildTerminalAppleScript('Terminal', '/Users/me/proj', 'claude --resume x');
    expect(s).toContain('tell application "Terminal"');
    expect(s).toContain('do script');
    expect(s).toContain("cd '/Users/me/proj' && claude --resume x");
  });
  it('uses the iTerm write-text form', () => {
    const s = buildTerminalAppleScript('iTerm', '/Users/me/proj', 'codex resume x');
    expect(s).toContain('tell application "iTerm"');
    expect(s).toContain('write text');
  });
  it('escapes a double quote in the cwd for the AppleScript string literal', () => {
    const s = buildTerminalAppleScript('Terminal', '/Users/me/a"b', 'claude --resume x');
    expect(s).toContain('\\"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm -w server run test -- launch`
Expected: FAIL — cannot resolve `../src/launch`.

- [ ] **Step 3: Implement `launch.ts`**

Create `server/src/launch.ts`:
```ts
import { spawn } from 'node:child_process';
import type { Provider, TerminalApp } from '../../shared/types.js';

const SESSION_ID_RE = /^[A-Za-z0-9._-]+$/;

export function buildResumeCommand(provider: Provider, sessionId: string): string {
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new Error(`Invalid session id: ${sessionId}`);
  }
  return provider === 'claude' ? `claude --resume ${sessionId}` : `codex resume ${sessionId}`;
}

export function escapeForAppleScript(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildTerminalAppleScript(app: TerminalApp, cwd: string, command: string): string {
  // Shell command run inside the terminal; single-quote the cwd at the shell level
  // (escaping any embedded single quotes), then escape the whole thing for the
  // AppleScript string literal.
  const safeCwd = cwd.replace(/'/g, `'\\''`);
  const shellCmd = `cd '${safeCwd}' && ${command}`;
  const escaped = escapeForAppleScript(shellCmd);
  if (app === 'iTerm') {
    return [
      'tell application "iTerm"',
      '  activate',
      '  set newWindow to (create window with default profile)',
      '  tell current session of newWindow',
      `    write text "${escaped}"`,
      '  end tell',
      'end tell',
    ].join('\n');
  }
  return [
    'tell application "Terminal"',
    `  do script "${escaped}"`,
    '  activate',
    'end tell',
  ].join('\n');
}

export function openInEditor(projectPath: string, editorCommand: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(editorCommand, [projectPath], { detached: true, stdio: 'ignore' });
    child.on('error', reject);
    child.on('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

export function openInTerminal(
  projectPath: string,
  command: string,
  terminalApp: TerminalApp,
): Promise<void> {
  if (process.platform !== 'darwin') {
    return Promise.reject(new Error('Open in terminal is only supported on macOS.'));
  }
  const script = buildTerminalAppleScript(terminalApp, projectPath, command);
  return new Promise((resolve, reject) => {
    const child = spawn('osascript', ['-e', script], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`osascript exited with code ${code}`)),
    );
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm -w server run test -- launch`
Expected: PASS — all launch builder tests green.

- [ ] **Step 5: Commit**

```bash
git add server/src/launch.ts server/test/launch.test.ts
git commit -m "feat(server): add editor/terminal launch helpers"
```

---

## Task 3: API endpoints

**Files:**
- Modify: `server/src/routes/api.ts`

Verified by typecheck + a `/api/settings` curl (launching is verified manually in Task 6).

- [ ] **Step 1: Add imports**

In `server/src/routes/api.ts`, add at the top with the other imports:
```ts
import fs from 'node:fs';
import { getSettings, saveSettings } from '../settings.js';
import { openInEditor, openInTerminal, buildResumeCommand } from '../launch.js';
```
Change the shared type import line to include `AppSettings`:
```ts
import type { Provider, SessionFilter, AppSettings } from '../../../shared/types.js';
```

- [ ] **Step 2: Add the endpoints**

In `server/src/routes/api.ts`, immediately before the final closing `}` of `registerApi` (after the `/api/index/status` handler), add:
```ts
  app.get('/api/settings', async () => getSettings());

  app.put<{ Body: Partial<AppSettings> }>('/api/settings', async (req) =>
    saveSettings(req.body ?? {}),
  );

  app.post<{ Params: { provider: Provider; sessionId: string } }>(
    '/api/sessions/:provider/:sessionId/open-editor',
    async (req, reply) => {
      const { provider, sessionId } = req.params;
      const s = getSession(provider, sessionId);
      if (!s) {
        reply.code(404);
        return { error: 'Session not found' };
      }
      if (!s.projectPath || !fs.existsSync(s.projectPath)) {
        reply.code(400);
        return { error: 'No project folder recorded for this session.' };
      }
      const editorCommand = getSettings().editorCommand;
      try {
        await openInEditor(s.projectPath, editorCommand);
        return { ok: true };
      } catch {
        reply.code(500);
        return {
          error: `Couldn't launch '${editorCommand}' — make sure it's installed and on your PATH.`,
        };
      }
    },
  );

  app.post<{ Params: { provider: Provider; sessionId: string } }>(
    '/api/sessions/:provider/:sessionId/open-terminal',
    async (req, reply) => {
      const { provider, sessionId } = req.params;
      const s = getSession(provider, sessionId);
      if (!s) {
        reply.code(404);
        return { error: 'Session not found' };
      }
      if (!s.projectPath || !fs.existsSync(s.projectPath)) {
        reply.code(400);
        return { error: 'No project folder recorded for this session.' };
      }
      try {
        const cmd = buildResumeCommand(provider, sessionId);
        await openInTerminal(s.projectPath, cmd, getSettings().terminalApp);
        return { ok: true };
      } catch (e: any) {
        reply.code(500);
        return { error: e?.message ?? 'Failed to open terminal' };
      }
    },
  );
```

- [ ] **Step 3: Typecheck**

Run: `npm -w server run typecheck`
Expected: PASS — no type errors. Also run `npm -w server run test` to confirm existing tests still pass.

- [ ] **Step 4: Smoke-test the settings endpoint**

Run (starts the built server briefly, hits the endpoint, stops it):
```bash
npm -w server run build && (PORT=8791 node server/dist/server/src/index.js & SRV=$!; sleep 2; \
  echo "GET:"; curl -s http://127.0.0.1:8791/api/settings; echo; \
  echo "PUT:"; curl -s -X PUT -H 'content-type: application/json' -d '{"terminalApp":"iTerm"}' http://127.0.0.1:8791/api/settings; echo; \
  kill $SRV)
```
Expected: GET prints `{"editorCommand":"code","terminalApp":"Terminal"}` (or your stored values); PUT echoes back the merged settings with `"terminalApp":"iTerm"`.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/api.ts
git commit -m "feat(server): settings + open-in-editor/terminal API endpoints"
```

---

## Task 4: Client API methods + clearer errors

**Files:**
- Modify: `client/src/api.ts`

- [ ] **Step 1: Improve error parsing in `http`**

In `client/src/api.ts`, replace the existing error block inside `http`:
```ts
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
```
with:
```ts
  if (!res.ok) {
    const text = await res.text();
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = JSON.parse(text);
      if (body && typeof body.error === 'string') message = body.error;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
```

- [ ] **Step 2: Add `AppSettings` to the type import**

In `client/src/api.ts`, change the `import type { ... } from '@shared/types';` block to also include `AppSettings`:
```ts
import type {
  Session,
  SessionListItem,
  TimelineItem,
  ProjectSummary,
  Note,
  Provider,
  SessionFilter,
  AppSettings,
} from '@shared/types';
```

- [ ] **Step 3: Add the API methods**

In `client/src/api.ts`, inside the `export const api = { ... }` object, after the `indexStatus` method add:
```ts
  getSettings: () => http<AppSettings>('/api/settings'),

  saveSettings: (p: Partial<AppSettings>) =>
    http<AppSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(p) }),

  openInEditor: (provider: Provider, sessionId: string) =>
    http<{ ok: true }>(`/api/sessions/${provider}/${sessionId}/open-editor`, { method: 'POST' }),

  openInTerminal: (provider: Provider, sessionId: string) =>
    http<{ ok: true }>(`/api/sessions/${provider}/${sessionId}/open-terminal`, { method: 'POST' }),
```
(Add a trailing comma after `indexStatus`'s closing `)` if needed so the object stays valid.)

- [ ] **Step 4: Typecheck**

Run: `npm -w client run typecheck`
Expected: PASS — no type errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/api.ts
git commit -m "feat(client): API methods for settings and open-in-editor/terminal"
```

---

## Task 5: Client UI — detail buttons + Settings Integrations

**Files:**
- Modify: `client/src/pages/SessionDetail.vue`
- Modify: `client/src/pages/Settings.vue`

- [ ] **Step 1: Add open actions to SessionDetail script**

In `client/src/pages/SessionDetail.vue`, in the `<script setup>` block, after the existing `const exportPath = ref<string | null>(null);` line, add:
```ts
const opening = ref(false);

async function openTerminal() {
  if (!session.value) return;
  opening.value = true;
  try {
    await api.openInTerminal(session.value.provider as Provider, session.value.sessionId);
    toast.success('Opening in terminal…');
  } catch (e: any) {
    toast.error(e?.message ?? 'Failed to open terminal');
  } finally {
    opening.value = false;
  }
}

async function openEditor() {
  if (!session.value) return;
  opening.value = true;
  try {
    await api.openInEditor(session.value.provider as Provider, session.value.sessionId);
    toast.success('Opening in editor…');
  } catch (e: any) {
    toast.error(e?.message ?? 'Failed to open editor');
  } finally {
    opening.value = false;
  }
}
```

- [ ] **Step 2: Add the buttons to the Resume row**

In `client/src/pages/SessionDetail.vue`, in the "Resume command row", immediately after the `<ResumeCommand :provider="session.provider" :session-id="session.sessionId" />` line, add:
```html
            <button
              class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-[11px] text-zinc-700 dark:text-zinc-300 transition-colors disabled:opacity-50"
              :disabled="opening"
              @click="openTerminal"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" x2="20" y1="19" y2="19" />
              </svg>
              Terminal
            </button>
            <button
              class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-[11px] text-zinc-700 dark:text-zinc-300 transition-colors disabled:opacity-50"
              :disabled="opening"
              @click="openEditor"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              Editor
            </button>
```

- [ ] **Step 3: Add Integrations section to Settings script**

In `client/src/pages/Settings.vue`, change the script. Replace:
```ts
import { onMounted, ref } from 'vue';
import { api } from '../api';
```
with:
```ts
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { useToast } from '../composables/useToast';
import type { AppSettings } from '@shared/types';

const toast = useToast();
const settings = ref<AppSettings>({ editorCommand: 'code', terminalApp: 'Terminal' });
const savingSettings = ref(false);

async function loadSettings() {
  settings.value = await api.getSettings();
}

async function persistSettings() {
  savingSettings.value = true;
  try {
    settings.value = await api.saveSettings(settings.value);
    toast.success('Settings saved');
  } catch (e: any) {
    toast.error(e?.message ?? 'Failed to save settings');
  } finally {
    savingSettings.value = false;
  }
}
```
Then change `onMounted(refresh);` to:
```ts
onMounted(() => {
  refresh();
  loadSettings();
});
```

- [ ] **Step 4: Add the Integrations section to Settings template**

In `client/src/pages/Settings.vue`, immediately after the `<h1 ...>Settings</h1>` line, add:
```html
    <section class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4 mb-6">
      <h2 class="font-medium text-zinc-800 dark:text-zinc-200 mb-2">Integrations</h2>
      <p class="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
        Used by the <strong>Terminal</strong> and <strong>Editor</strong> buttons on a session.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label class="block">
          <span class="text-xs text-zinc-500">Editor command</span>
          <input
            v-model="settings.editorCommand"
            placeholder="code"
            class="mt-1 w-full px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 text-sm font-mono"
          />
        </label>
        <label class="block">
          <span class="text-xs text-zinc-500">Terminal app</span>
          <select
            v-model="settings.terminalApp"
            class="mt-1 w-full px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 text-sm"
          >
            <option value="Terminal">Terminal</option>
            <option value="iTerm">iTerm</option>
          </select>
        </label>
      </div>
      <button
        class="mt-3 px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-sm disabled:opacity-50"
        :disabled="savingSettings"
        @click="persistSettings"
      >
        {{ savingSettings ? 'Saving…' : 'Save' }}
      </button>
    </section>
```

- [ ] **Step 5: Typecheck + build**

Run: `npm -w client run typecheck && npm -w client run build`
Expected: PASS — no type errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/SessionDetail.vue client/src/pages/Settings.vue
git commit -m "feat(client): open-in-terminal/editor buttons + Integrations settings"
```

---

## Task 6: Verification sweep + manual launch test

**Files:** none (verification only)

- [ ] **Step 1: Full test + typecheck + build**

Run:
```bash
npm test && npm run typecheck && npm run build
```
Expected: all server + client tests pass; both workspaces typecheck clean; build succeeds.

- [ ] **Step 2: Manual launch test (macOS)**

Run `npm start` (or restart the running server), hard-refresh the app, open any session that has a real project folder, then:
1. Click **Editor** → the project opens in VS Code (or your configured editor). A success toast appears.
2. Click **Terminal** → Terminal.app opens, `cd`s into the project, and runs the resume command. A success toast appears.
3. In **Settings → Integrations**, change Terminal app to `iTerm`, Save, return to a session, click **Terminal** → iTerm opens and runs resume.
4. Open a session with no project folder (if available) → clicking either button shows the "No project folder recorded…" toast.

Expected: all behaviors as described. Stop the dev server when done.

- [ ] **Step 3: Commit (only if fixups were needed)**

```bash
git add -A
git commit -m "chore: verification fixups for open-in-terminal/editor"
```
(Skip if nothing changed.)

---

## Self-Review Notes

- **Spec coverage:** Open-in-editor (Tasks 2,3,5), open-in-terminal with auto-run resume (Tasks 2,3,5), configurable editor command + terminal app (Tasks 1,3,5), detail-page placement (Task 5), settings storage on the `settings` table (Task 1), error handling for missing path / spawn failure / non-macOS (Task 3 + Task 4 error parsing + Task 5 toasts), security via sessionId guard + AppleScript escaping + argv editor spawn (Task 2), unit tests for builders + settings (Tasks 1,2). All spec sections map to tasks.
- **Type consistency:** `AppSettings`/`TerminalApp` defined in Task 1, consumed identically in `settings.ts`, `launch.ts`, `routes/api.ts`, and `client/src/api.ts`. `getSettings(db?)`/`saveSettings(partial, db?)` signatures match their call sites (routes call with no db arg; tests pass an in-memory db). `buildResumeCommand`/`buildTerminalAppleScript`/`openInEditor`/`openInTerminal` signatures match between `launch.ts` and `routes/api.ts`.
- **No placeholders:** every code step contains complete code.
