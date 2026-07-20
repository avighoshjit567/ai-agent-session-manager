#!/usr/bin/env node
// One-shot setup: verifies Node version, installs workspace deps (compiling
// the better-sqlite3 native binary), sanity-checks that binary loads, and
// tells the user whether ~/.claude and/or ~/.codex were found. Run with
// `npm run setup` (or `node scripts/setup.mjs`) right after cloning.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const line = '─'.repeat(64);

function step(label) {
  console.log(`\n${line}\n${label}\n${line}`);
}

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: repoRoot, stdio: 'inherit' });
}

// 1. Node version check
step('1/4  Checking Node.js version');
const REQUIRED_MAJOR = 20;
const REQUIRED_MINOR = 10;
const [major, minor] = process.versions.node.split('.').map(Number);
const meetsMinimum = major > REQUIRED_MAJOR || (major === REQUIRED_MAJOR && minor >= REQUIRED_MINOR);
console.log(`  Detected: Node ${process.versions.node}`);
if (!meetsMinimum) {
  console.error(`\n✗ Node ${REQUIRED_MAJOR}.${REQUIRED_MINOR}+ is required (this project's .nvmrc pins 22).`);
  console.error('  Install a newer Node (nvm: `nvm install 22 && nvm use`) and re-run this script.');
  process.exit(1);
}
console.log('✓ Node version OK');

// 2. Install dependencies (also compiles better-sqlite3's native binary)
step('2/4  Installing dependencies (npm install)');
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install']);
console.log('✓ Dependencies installed');

// 3. Sanity-check the better-sqlite3 native binary loads for this Node ABI
step('3/4  Verifying better-sqlite3 native binary');
try {
  execFileSync(
    process.execPath,
    ['-e', "new (require('better-sqlite3'))(':memory:')"],
    { cwd: join(repoRoot, 'server'), stdio: 'pipe' },
  );
  console.log('✓ better-sqlite3 loads correctly');
} catch (err) {
  console.error('✗ better-sqlite3 failed to load — usually means it was compiled against a different Node version.');
  console.error('  Fix: npm rebuild better-sqlite3');
  console.error(String(err?.stderr || err?.message || err));
  process.exit(1);
}

// 4. Report whether Claude Code / Codex CLI data was found
step('4/4  Looking for existing Claude Code / Codex CLI session data');
const claudeDir = join(homedir(), '.claude', 'projects');
const codexDir = join(homedir(), '.codex');
const hasClaude = existsSync(claudeDir);
const hasCodex = existsSync(codexDir);
console.log(`  ${hasClaude ? '✓' : '·'} ~/.claude/projects  ${hasClaude ? 'found' : 'not found'}`);
console.log(`  ${hasCodex ? '✓' : '·'} ~/.codex             ${hasCodex ? 'found' : 'not found'}`);
if (!hasClaude && !hasCodex) {
  console.log('\n  Neither was found — the dashboard will show 0 sessions until you use Claude Code or Codex CLI at least once.');
}

console.log(`\n${line}`);
console.log('✓ Setup complete.\n');
console.log('  Dev mode:        npm run dev        (http://localhost:5173)');
console.log('  Production:      npm run build && npm start   (http://localhost:8787)');
console.log('  Background svc:  npm run service:install       (survives closing the terminal)');
console.log(`${line}\n`);
