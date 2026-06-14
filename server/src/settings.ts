import Database from 'better-sqlite3';
import { getDb } from './db.js';
import type { AppSettings, TerminalApp } from '../../shared/types.js';

const DEFAULTS: AppSettings = { editorCommand: 'code', terminalApp: 'Terminal' };
const VALID_TERMINALS: TerminalApp[] = ['Terminal', 'iTerm', 'Warp'];

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
