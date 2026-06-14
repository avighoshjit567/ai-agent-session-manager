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
async function openInWarp(projectPath: string, command: string): Promise<void> {
  const dir = path.join(os.homedir(), '.warp', 'launch_configurations');
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${WARP_CONFIG_NAME}.yaml`);
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
