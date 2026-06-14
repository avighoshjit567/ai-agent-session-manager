import { describe, it, expect } from 'vitest';
import {
  buildResumeCommand,
  escapeForAppleScript,
  buildTerminalAppleScript,
  buildWarpLaunchConfig,
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
