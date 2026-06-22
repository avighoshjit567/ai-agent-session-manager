import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { Provider, TerminalApp } from '../../shared/types.js';

const SESSION_ID_RE = /^[A-Za-z0-9._-]+$/;
const WARP_CONFIG_NAME = 'claude-codex-session-manager';

export function buildResumeCommand(provider: Provider, sessionId: string): string {
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new Error(`Invalid session id: ${sessionId}`);
  }
  return provider === 'claude' ? `claude --resume ${sessionId}` : `codex resume ${sessionId}`;
}

// Fork a Claude session into a brand-new one carrying its full history, leaving
// the original untouched (`--fork-session` requires `--resume`).
export function buildClaudeForkCommand(sessionId: string): string {
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new Error(`Invalid session id: ${sessionId}`);
  }
  return `claude --resume ${sessionId} --fork-session`;
}

// Wrap a string as a single double-quoted shell argument, escaping the four
// characters the shell still interprets inside double quotes.
export function shellDoubleQuote(s: string): string {
  return `"${s.replace(/(["\\$`])/g, '\\$1')}"`;
}

// Codex has no native fork, so start a NEW codex session seeded to read the
// exported transcript of the previous one — the closest analog to a fork.
export function buildCodexSeedCommand(handoffPath: string): string {
  const prompt =
    `Read the file ${handoffPath} — it is the full transcript and context of a ` +
    `previous session. Use it as context and continue the work from where it left off.`;
  return `codex ${shellDoubleQuote(prompt)}`;
}

export function escapeForAppleScript(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Prefix a command with a `cd` into `cwd` so it always runs in the right project
// directory. `claude --resume <id>` resolves the session against the *current*
// directory's project, so launching from the wrong cwd fails with "No
// conversation found" even though the session exists. Single-quote the path at
// the shell level, escaping any embedded single quotes.
export function buildShellCommandWithCd(cwd: string, command: string): string {
  const safeCwd = cwd.replace(/'/g, `'\\''`);
  return `cd '${safeCwd}' && ${command}`;
}

export function buildTerminalAppleScript(app: TerminalApp, cwd: string, command: string): string {
  // Shell command run inside the terminal, then escaped for the AppleScript
  // string literal.
  const shellCmd = buildShellCommandWithCd(cwd, command);
  const escaped = escapeForAppleScript(shellCmd);
  if (app === 'iTerm') {
    // Reuse the current window and open a new tab when one is already open;
    // only spawn a fresh window when iTerm has none. Keeps repeated launches
    // from piling up windows.
    return [
      'tell application "iTerm"',
      '  activate',
      '  if (count of windows) = 0 then',
      '    set targetWindow to (create window with default profile)',
      '  else',
      '    set targetWindow to current window',
      '    tell targetWindow to create tab with default profile',
      '  end if',
      '  tell current session of targetWindow',
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

function yamlDoubleQuote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// Build a Warp launch-configuration YAML that opens a tab in `cwd` and runs
// `command`. Schema per Warp docs: windows[].tabs[].layout.{cwd,commands[].exec}.
// `cwd` must be an absolute path. Values are double-quoted so paths/commands with
// spaces or special characters stay valid YAML.
export function buildWarpLaunchConfig(name: string, cwd: string, command: string): string {
  return (
    [
      '---',
      `name: ${yamlDoubleQuote(name)}`,
      'windows:',
      '  - tabs:',
      `      - title: ${yamlDoubleQuote('Resume')}`,
      '        layout:',
      `          cwd: ${yamlDoubleQuote(cwd)}`,
      '          commands:',
      `            - exec: ${yamlDoubleQuote(command)}`,
    ].join('\n') + '\n'
  );
}

function openUri(uri: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('open', [uri], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`open exited with code ${code}`))));
  });
}

// Warp can't be driven by AppleScript `do script`. Instead, write a (reused)
// launch-configuration YAML to ~/.warp/launch_configurations/ and open it via
// the warp://launch URI, which opens a tab in the project directory and runs the
// resume command automatically.
async function openInWarp(projectPath: string, rawCommand: string): Promise<void> {
  const dir = path.join(os.homedir(), '.warp', 'launch_configurations');
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${WARP_CONFIG_NAME}.yaml`);
  // Belt-and-suspenders: set the tab's cwd via the layout AND `cd` inside the
  // command, since Warp's `layout.cwd` isn't always honored — without the `cd`,
  // `claude --resume` can launch in the wrong project and fail to find the session.
  const command = buildShellCommandWithCd(projectPath, rawCommand);
  await fs.promises.writeFile(file, buildWarpLaunchConfig(WARP_CONFIG_NAME, projectPath, command), 'utf8');
  await openUri(`warp://launch/${encodeURIComponent(WARP_CONFIG_NAME)}`);
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

export interface SpawnSpec {
  cmd: string;
  args: string[];
}

// Ordered list of Linux terminal emulators to try. Each opens a window, cd's
// into the project dir, runs the command, then drops to an interactive shell so
// the window stays open. Args are passed as an array, so no shell quoting is
// needed at this level — the kernel receives them verbatim.
export function buildLinuxTerminalCandidates(cwd: string, command: string): SpawnSpec[] {
  const inner = `${buildShellCommandWithCd(cwd, command)}; exec bash`;
  return [
    // Debian/Ubuntu alternatives symlink — whatever the user's default is.
    { cmd: 'x-terminal-emulator', args: ['-e', 'bash', '-c', inner] },
    { cmd: 'gnome-terminal', args: ['--', 'bash', '-c', inner] },
    { cmd: 'konsole', args: ['-e', 'bash', '-c', inner] },
    { cmd: 'xfce4-terminal', args: ['-x', 'bash', '-c', inner] },
    { cmd: 'alacritty', args: ['-e', 'bash', '-c', inner] },
    { cmd: 'kitty', args: ['bash', '-c', inner] },
    { cmd: 'xterm', args: ['-e', 'bash', '-c', inner] },
  ];
}

// Ordered list of Windows terminals to try: Windows Terminal first (opens a tab
// in the project dir), falling back to a classic console window via `start`.
// `cd /d` handles a drive-letter change; `cmd /k` keeps the window open.
export function buildWindowsTerminalCandidates(cwd: string, command: string): SpawnSpec[] {
  const inner = `cd /d "${cwd}" && ${command}`;
  return [
    { cmd: 'wt.exe', args: ['-d', cwd, 'cmd', '/k', command] },
    { cmd: 'cmd.exe', args: ['/c', 'start', '', 'cmd', '/k', inner] },
  ];
}

// Try each spawn spec in order; resolve as soon as one launches. If a candidate
// isn't installed (ENOENT) move to the next; reject only when none are present.
function spawnFirstAvailable(specs: SpawnSpec[], notFoundMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tryAt = (i: number): void => {
      if (i >= specs.length) {
        reject(new Error(notFoundMessage));
        return;
      }
      const { cmd, args } = specs[i];
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
      let settled = false;
      child.on('error', (err: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;
        if (err.code === 'ENOENT') {
          tryAt(i + 1); // not installed — try the next candidate
        } else {
          reject(err);
        }
      });
      child.on('spawn', () => {
        if (settled) return;
        settled = true;
        child.unref();
        resolve();
      });
    };
    tryAt(0);
  });
}

export function openInTerminal(
  projectPath: string,
  command: string,
  terminalApp: TerminalApp,
): Promise<void> {
  if (process.platform === 'darwin') {
    if (terminalApp === 'Warp') {
      return openInWarp(projectPath, command);
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
  // Windows / Linux: the macOS-only `terminalApp` preference doesn't apply, so
  // auto-detect an installed terminal instead.
  if (process.platform === 'win32') {
    return spawnFirstAvailable(
      buildWindowsTerminalCandidates(projectPath, command),
      'Could not open a terminal: neither Windows Terminal (wt) nor cmd.exe was found.',
    );
  }
  return spawnFirstAvailable(
    buildLinuxTerminalCandidates(projectPath, command),
    'Could not find a terminal emulator. Install one of: gnome-terminal, konsole, xfce4-terminal, alacritty, kitty, or xterm.',
  );
}
