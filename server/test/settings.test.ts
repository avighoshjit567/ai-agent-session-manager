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
