import Database from 'better-sqlite3';
import { getDb } from './db.js';
import { maskSecrets } from './privacy.js';
import type {
  Provider,
  DailyRecap,
  RecapSessionPreview,
  RecapHistoryItem,
} from '../../shared/types.js';

// --- Date helpers -----------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// Local-time [startMs, endMs) for the given calendar day. Using the (y, m-1, d)
// Date constructor anchors the window to the server's local timezone, and d+1
// rolls month/year boundaries correctly.
export function localDayWindow(date: string): { startMs: number; endMs: number } {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { startMs: start.getTime(), endMs: end.getTime() };
}
