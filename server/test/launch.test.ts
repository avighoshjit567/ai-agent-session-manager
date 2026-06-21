import { describe, it, expect } from 'vitest';
import {
  buildResumeCommand,
  escapeForAppleScript,
  buildTerminalAppleScript,
  buildWarpLaunchConfig,
  buildClaudeForkCommand,
  buildShellCommandWithCd,
  shellDoubleQuote,
  buildCodexSeedCommand,
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
  it('reuses the current iTerm window as a new tab, falling back to a new window', () => {
    const s = buildTerminalAppleScript('iTerm', '/Users/me/proj', 'codex resume x');
    expect(s).toContain('if (count of windows) = 0 then');
    expect(s).toContain('create window with default profile');
    expect(s).toContain('create tab with default profile');
  });
  it('escapes a double quote in the cwd for the AppleScript string literal', () => {
    const s = buildTerminalAppleScript('Terminal', '/Users/me/a"b', 'claude --resume x');
    expect(s).toContain('\\"');
  });
});

describe('buildShellCommandWithCd', () => {
  it('prefixes a cd into the single-quoted cwd', () => {
    expect(buildShellCommandWithCd('/Users/me/proj', 'claude --resume x')).toBe(
      "cd '/Users/me/proj' && claude --resume x",
    );
  });
  it('escapes single quotes in the cwd', () => {
    expect(buildShellCommandWithCd("/Users/me/a'b", 'claude --resume x')).toBe(
      "cd '/Users/me/a'\\''b' && claude --resume x",
    );
  });
});

describe('buildClaudeForkCommand', () => {
  it('forks a resumed session into a new one', () => {
    expect(buildClaudeForkCommand('abc-123')).toBe('claude --resume abc-123 --fork-session');
  });
  it('rejects a session id with shell metacharacters', () => {
    expect(() => buildClaudeForkCommand('a; rm -rf /')).toThrow();
  });
});

describe('shellDoubleQuote', () => {
  it('wraps a plain string in double quotes', () => {
    expect(shellDoubleQuote('hello world')).toBe('"hello world"');
  });
  it('escapes double quotes, backslashes, $ and backticks', () => {
    expect(shellDoubleQuote('a"b\\c$d`e')).toBe('"a\\"b\\\\c\\$d\\`e"');
  });
});

describe('buildCodexSeedCommand', () => {
  it('starts a new codex session that reads the handoff file', () => {
    const cmd = buildCodexSeedCommand('/Users/me/exports/2026-06-16-codex-foo.md');
    expect(cmd.startsWith('codex "')).toBe(true);
    expect(cmd).toContain('/Users/me/exports/2026-06-16-codex-foo.md');
    expect(cmd.endsWith('"')).toBe(true);
  });
  it('safely quotes a path containing spaces and quotes', () => {
    const cmd = buildCodexSeedCommand('/Users/me/My "Docs"/a b.md');
    expect(cmd).toContain('My \\"Docs\\"');
    // The whole prompt remains a single double-quoted shell argument.
    expect(cmd.startsWith('codex "')).toBe(true);
    expect(cmd.endsWith('"')).toBe(true);
  });
});

describe('buildWarpLaunchConfig', () => {
  it('produces YAML with the cwd and resume command under commands', () => {
    const yaml = buildWarpLaunchConfig('cfg', '/Users/me/proj', 'claude --resume x');
    expect(yaml).toContain('name: "cfg"');
    expect(yaml).toContain('cwd: "/Users/me/proj"');
    expect(yaml).toContain('- exec: "claude --resume x"');
  });
  it('double-quotes and escapes values containing quotes', () => {
    const yaml = buildWarpLaunchConfig('cfg', '/Users/me/a"b', 'claude --resume x');
    expect(yaml).toContain('cwd: "/Users/me/a\\"b"');
  });
});
