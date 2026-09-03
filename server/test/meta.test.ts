import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import { initSchema } from '../src/db';
import { normalizeMeta, saveMeta, getMeta, MAX_DISPLAY_NAME } from '../src/meta';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

describe('normalizeMeta', () => {
  it('trims the display name', () => {
    expect(normalizeMeta({ displayName: '  Billing work  ' }).displayName).toBe('Billing work');
  });

  it('treats empty / whitespace-only names as cleared (null)', () => {
    expect(normalizeMeta({ displayName: '' }).displayName).toBeNull();
    expect(normalizeMeta({ displayName: '   ' }).displayName).toBeNull();
    expect(normalizeMeta({ displayName: undefined }).displayName).toBeNull();
  });

  it('truncates an over-long name to the max length', () => {
    const long = 'x'.repeat(MAX_DISPLAY_NAME + 50);
    expect(normalizeMeta({ displayName: long }).displayName).toHaveLength(MAX_DISPLAY_NAME);
  });

  it('keeps a valid palette color', () => {
    expect(normalizeMeta({ color: 'amber' }).color).toBe('amber');
  });

  it('rejects an unknown color (→ null)', () => {
    expect(normalizeMeta({ color: 'chartreuse' as any }).color).toBeNull();
    expect(normalizeMeta({ color: '#ff0000' as any }).color).toBeNull();
    expect(normalizeMeta({ color: undefined }).color).toBeNull();
  });
});

describe('saveMeta bookmarks', () => {
  it('stores and reads back a bookmark', () => {
    const db = freshDb();
    saveMeta('claude', 's1', { bookmarked: true }, db);
    expect(getMeta('claude', 's1', db).bookmarked).toBe(true);
  });

  it('defaults to not bookmarked', () => {
    const db = freshDb();
    expect(getMeta('claude', 'nope', db).bookmarked).toBe(false);
  });

  it('keeps the display name when toggling a bookmark', () => {
    const db = freshDb();
    saveMeta('claude', 's1', { displayName: 'Billing work', color: 'amber' }, db);
    saveMeta('claude', 's1', { bookmarked: true }, db);
    const m = getMeta('claude', 's1', db);
    expect(m.displayName).toBe('Billing work');
    expect(m.color).toBe('amber');
    expect(m.bookmarked).toBe(true);
  });

  it('keeps the bookmark when renaming', () => {
    const db = freshDb();
    saveMeta('claude', 's1', { bookmarked: true }, db);
    saveMeta('claude', 's1', { displayName: 'New name', color: null }, db);
    const m = getMeta('claude', 's1', db);
    expect(m.bookmarked).toBe(true);
    expect(m.displayName).toBe('New name');
  });

  it('removes the row once name, color, and bookmark are all cleared', () => {
    const db = freshDb();
    saveMeta('claude', 's1', { displayName: 'x', bookmarked: true }, db);
    saveMeta('claude', 's1', { displayName: null, color: null, bookmarked: false }, db);
    const row = db.prepare(`SELECT COUNT(*) AS n FROM session_meta`).get() as any;
    expect(row.n).toBe(0);
  });
});
