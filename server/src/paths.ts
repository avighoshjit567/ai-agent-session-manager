import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const home = os.homedir();
const APP_NAME = 'claude-codex-session-manager';

/**
 * OS-appropriate per-user app data directory.
 *  - macOS: ~/Library/Application Support/<app>
 *  - Linux: $XDG_DATA_HOME/<app> or ~/.local/share/<app>
 *  - Windows: %APPDATA%/<app> or ~/AppData/Roaming/<app>
 */
function resolveAppData(): string {
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_NAME);
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    return path.join(appData, APP_NAME);
  }
  // linux / other unix
  const xdg = process.env.XDG_DATA_HOME ?? path.join(home, '.local', 'share');
  return path.join(xdg, APP_NAME);
}

function resolveDocumentsDir(): string {
  // Both macOS and Windows ship a Documents folder; on Linux it's user-configured.
  // If ~/Documents doesn't exist, fall back to the home directory.
  const candidate = path.join(home, 'Documents');
  try {
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    // ignore
  }
  return home;
}

const appDataDir = resolveAppData();

export const PATHS = {
  home,
  claudeRoot: path.join(home, '.claude'),
  claudeProjects: path.join(home, '.claude', 'projects'),
  claudeSessions: path.join(home, '.claude', 'sessions'),
  claudeTodos: path.join(home, '.claude', 'todos'),
  codexRoot: path.join(home, '.codex'),
  codexSessions: path.join(home, '.codex', 'sessions'),
  codexArchived: path.join(home, '.codex', 'archived_sessions'),
  appData: appDataDir,
  notesDir: path.join(appDataDir, 'notes'),
  exportsDir: path.join(resolveDocumentsDir(), 'ai-session-exports'),
};

export function ensureAppDirs(): void {
  fs.mkdirSync(PATHS.appData, { recursive: true });
  fs.mkdirSync(PATHS.notesDir, { recursive: true });
}

export function indexDbPath(): string {
  return path.join(PATHS.appData, 'index.sqlite');
}

/**
 * Find the Codex state SQLite file. The version suffix (state_5.sqlite) bumps
 * over time — pick the highest-numbered file that exists.
 */
export function findCodexStateDb(): string | null {
  if (!fs.existsSync(PATHS.codexRoot)) return null;
  const entries = fs.readdirSync(PATHS.codexRoot);
  const candidates = entries
    .filter((f) => /^state_\d+\.sqlite$/.test(f))
    .map((f) => ({
      name: f,
      version: parseInt(f.match(/^state_(\d+)/)?.[1] ?? '0', 10),
    }))
    .sort((a, b) => b.version - a.version);
  if (candidates.length === 0) return null;
  return path.join(PATHS.codexRoot, candidates[0].name);
}

export function decodeClaudeProjectPath(encoded: string): string {
  if (!encoded.startsWith('-')) return encoded;
  return '/' + encoded.slice(1).replace(/-/g, '/');
}
