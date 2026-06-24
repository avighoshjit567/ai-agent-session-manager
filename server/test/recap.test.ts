import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import { initSchema } from '../src/db';
import {
  isValidDateString,
  localDayWindow,
} from '../src/recap';

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

describe('isValidDateString', () => {
  it('accepts a YYYY-MM-DD date', () => {
    expect(isValidDateString('2026-06-23')).toBe(true);
  });
  it('rejects malformed or impossible dates', () => {
    expect(isValidDateString('2026-6-23')).toBe(false);
    expect(isValidDateString('not-a-date')).toBe(false);
    expect(isValidDateString('2026-13-40')).toBe(false);
  });
});

describe('localDayWindow', () => {
  it('spans local midnight to next local midnight', () => {
    const { startMs, endMs } = localDayWindow('2026-06-23');
    expect(startMs).toBe(new Date(2026, 5, 23, 0, 0, 0, 0).getTime());
    expect(endMs).toBe(new Date(2026, 5, 24, 0, 0, 0, 0).getTime());
  });
});
