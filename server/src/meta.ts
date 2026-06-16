import { getDb } from './db.js';
import { ensureAppDirs } from './paths.js';
import { SESSION_COLORS } from '../../shared/types.js';
import type { Provider, SessionColor, SessionMeta } from '../../shared/types.js';

export const MAX_DISPLAY_NAME = 120;

export interface MetaInput {
  displayName?: string | null;
  color?: string | null;
}

// Pure: clamp a raw meta payload to a safe, stored shape. Empty names clear the
// label; unknown colors are dropped (→ null).
export function normalizeMeta(input: MetaInput): { displayName: string | null; color: SessionColor | null } {
  const name = (input.displayName ?? '').trim();
  const displayName = name ? name.slice(0, MAX_DISPLAY_NAME) : null;
  const color = (SESSION_COLORS as readonly string[]).includes(input.color ?? '')
    ? (input.color as SessionColor)
    : null;
  return { displayName, color };
}

export function getMeta(provider: Provider, sessionId: string): SessionMeta {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT display_name AS displayName, color FROM session_meta
       WHERE provider = ? AND session_id = ?`,
    )
    .get(provider, sessionId) as { displayName: string | null; color: SessionColor | null } | undefined;
  return {
    provider,
    sessionId,
    displayName: row?.displayName ?? null,
    color: row?.color ?? null,
  };
}

export function saveMeta(provider: Provider, sessionId: string, input: MetaInput): SessionMeta {
  ensureAppDirs();
  const db = getDb();
  const { displayName, color } = normalizeMeta(input);
  const updatedAt = new Date().toISOString();

  if (displayName === null && color === null) {
    // Nothing left to store — remove the row so the session reverts cleanly.
    db.prepare(`DELETE FROM session_meta WHERE provider = ? AND session_id = ?`).run(provider, sessionId);
  } else {
    db.prepare(
      `INSERT INTO session_meta (provider, session_id, display_name, color, updated_at)
       VALUES (@provider, @sessionId, @displayName, @color, @updatedAt)
       ON CONFLICT(provider, session_id) DO UPDATE SET
         display_name=excluded.display_name,
         color=excluded.color,
         updated_at=excluded.updated_at`,
    ).run({ provider, sessionId, displayName, color, updatedAt });
  }

  // Keep the custom name searchable immediately (no-op if not yet indexed).
  try {
    db.prepare(
      `UPDATE sessions_fts SET display_name = ? WHERE provider = ? AND session_id = ?`,
    ).run(displayName ?? '', provider, sessionId);
  } catch {
    // FTS row may not exist yet; the next index will populate it.
  }

  return { provider, sessionId, displayName, color };
}
