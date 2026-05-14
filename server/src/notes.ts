import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './db.js';
import { PATHS, ensureAppDirs } from './paths.js';
import type { Note, Provider } from '../../shared/types.js';

export function getNote(provider: Provider, sessionId: string): Note {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT provider, session_id AS sessionId, status, tags, summary,
              follow_ups AS followUps, lessons, updated_at AS updatedAt
       FROM notes WHERE provider = ? AND session_id = ?`,
    )
    .get(provider, sessionId) as any;
  if (!row) {
    return {
      provider,
      sessionId,
      status: 'none',
      tags: [],
      summary: '',
      followUps: '',
      lessons: '',
      updatedAt: '',
    };
  }
  return {
    ...row,
    tags: safeParseTags(row.tags),
  };
}

export function saveNote(input: Note): Note {
  ensureAppDirs();
  const db = getDb();
  const updatedAt = new Date().toISOString();
  const tagsJson = JSON.stringify(input.tags ?? []);
  db.prepare(
    `INSERT INTO notes (provider, session_id, status, tags, summary, follow_ups, lessons, updated_at)
     VALUES (@provider, @sessionId, @status, @tags, @summary, @followUps, @lessons, @updatedAt)
     ON CONFLICT(provider, session_id) DO UPDATE SET
       status=excluded.status,
       tags=excluded.tags,
       summary=excluded.summary,
       follow_ups=excluded.follow_ups,
       lessons=excluded.lessons,
       updated_at=excluded.updated_at`,
  ).run({
    provider: input.provider,
    sessionId: input.sessionId,
    status: input.status,
    tags: tagsJson,
    summary: input.summary ?? '',
    followUps: input.followUps ?? '',
    lessons: input.lessons ?? '',
    updatedAt,
  });

  // Mirror to a markdown file for portability
  const filePath = path.join(PATHS.notesDir, `${input.provider}-${input.sessionId}.md`);
  const md = renderNoteMarkdown({ ...input, updatedAt });
  try {
    fs.writeFileSync(filePath, md, 'utf8');
  } catch {
    // ignore disk errors; DB row is the source for the app
  }

  return { ...input, updatedAt };
}

function renderNoteMarkdown(n: Note): string {
  return [
    `# Notes — ${n.provider}/${n.sessionId}`,
    ``,
    `Status: ${n.status}`,
    `Tags: ${n.tags.join(', ')}`,
    `Updated: ${n.updatedAt}`,
    ``,
    `## Summary`,
    n.summary || '_(empty)_',
    ``,
    `## Follow-ups`,
    n.followUps || '_(empty)_',
    ``,
    `## Lessons`,
    n.lessons || '_(empty)_',
    ``,
  ].join('\n');
}

function safeParseTags(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v !== 'string') return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
