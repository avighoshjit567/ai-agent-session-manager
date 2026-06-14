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

export function buildWarpNewWindowUri(cwd: string): string {
  // Documented Warp URI for opening a window at a working directory.
  return `warp://action/new_window?path=${encodeURIComponent(cwd)}`;
}

function copyToClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('pbcopy', { stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pbcopy exited with code ${code}`))));
    child.stdin?.end(text);
  });
}

function openUri(uri: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('open', [uri], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`open exited with code ${code}`))));
  });
}

// Warp can't be driven by AppleScript `do script`, so open it at the project
// directory via its documented URI and put the resume command on the clipboard
// for the user to paste.
async function openInWarp(projectPath: string, command: string): Promise<void> {
  await copyToClipboard(command);
  await openUri(buildWarpNewWindowUri(projectPath));
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
