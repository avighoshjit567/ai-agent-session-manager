import Database from 'better-sqlite3';
import { describe, it, expect } from 'vitest';
import { initSchema } from '../src/db';

const START = String.fromCharCode(2);

function seed(db: Database.Database) {
  const ins = db.prepare(
    `INSERT INTO sessions_fts
       (provider, session_id, title, project_path, git_branch, first_user_message, body)
     VALUES (?,?,?,?,?,?,?)`,
  );
  ins.run('claude', 'a', 'Fix billing bug', '/p', 'main', 'please fix billing',
    'we changed the invoice generator and the redis cache layer');
  ins.run('claude', 'b', 'Unrelated chat', '/p', 'main', 'hello there',
    'we discussed kubernetes deployment strategy');
}

describe('FTS body search', () => {
  it('finds a session by a term that appears only in the conversation body', () => {
    const db = new Database(':memory:');
    initSchema(db);
    seed(db);
    const row = db.prepare(
      `SELECT session_id,
              snippet(sessions_fts, 6, char(2), char(3), '…', 12) AS snip
       FROM sessions_fts WHERE sessions_fts MATCH ? ORDER BY bm25(sessions_fts)`,
    ).get('redis') as any;
    expect(row.session_id).toBe('a');
    expect(row.snip).toContain(START);
    expect(String(row.snip).toLowerCase()).toContain('redis');
  });

  it('ranks the strongest match first via bm25', () => {
    const db = new Database(':memory:');
    initSchema(db);
    seed(db);
    const rows = db.prepare(
      `SELECT session_id FROM sessions_fts WHERE sessions_fts MATCH ? ORDER BY bm25(sessions_fts)`,
    ).all('billing') as any[];
    expect(rows[0].session_id).toBe('a');
  });
});
