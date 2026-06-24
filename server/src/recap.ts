import Database from 'better-sqlite3';
import { getDb } from './db.js';
import { maskSecrets } from './privacy.js';
import { runClaudeHeadless } from './claudeCli.js';
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

// --- Session selection ------------------------------------------------------

export interface RecapSession {
  provider: Provider;
  sessionId: string;
  title: string | null;
  displayName: string | null;
  projectPath: string | null;
  gitBranch: string | null;
  model: string | null;
  firstUserMessage: string | null;
  messageCount: number;
  toolCallCount: number;
  hasSubagents: boolean;
  hasTodos: boolean;
  noteSummary: string;
  activityMs: number;
}

function activityMs(updatedAt: string | null, mtime: number | null): number {
  if (updatedAt) {
    const t = Date.parse(updatedAt);
    if (!Number.isNaN(t)) return t;
  }
  return mtime ?? 0;
}

export function selectSessionsForDate(
  date: string,
  db: Database.Database = getDb(),
): RecapSession[] {
  const { startMs, endMs } = localDayWindow(date);
  const rows = db
    .prepare(
      `SELECT s.provider, s.session_id AS sessionId, s.title,
              s.project_path AS projectPath, s.git_branch AS gitBranch, s.model,
              s.first_user_message AS firstUserMessage,
              s.message_count AS messageCount, s.tool_call_count AS toolCallCount,
              s.has_subagents AS hasSubagents, s.has_todos AS hasTodos,
              s.updated_at AS updatedAt, s.mtime AS mtime,
              m.display_name AS displayName,
              COALESCE(n.summary, '') AS noteSummary
       FROM sessions s
       LEFT JOIN session_meta m ON m.provider = s.provider AND m.session_id = s.session_id
       LEFT JOIN notes n ON n.provider = s.provider AND n.session_id = s.session_id
       WHERE s.archived = 0`,
    )
    .all() as any[];

  return rows
    .map((r) => ({
      provider: r.provider as Provider,
      sessionId: r.sessionId as string,
      title: r.title ?? null,
      displayName: r.displayName ?? null,
      projectPath: r.projectPath ?? null,
      gitBranch: r.gitBranch ?? null,
      model: r.model ?? null,
      firstUserMessage: r.firstUserMessage ?? null,
      messageCount: r.messageCount ?? 0,
      toolCallCount: r.toolCallCount ?? 0,
      hasSubagents: !!r.hasSubagents,
      hasTodos: !!r.hasTodos,
      noteSummary: r.noteSummary ?? '',
      activityMs: activityMs(r.updatedAt ?? null, r.mtime ?? null),
    }))
    .filter((s) => s.activityMs >= startMs && s.activityMs < endMs)
    .sort((a, b) => a.activityMs - b.activityMs);
}

// --- Prompt building --------------------------------------------------------

function sessionName(s: RecapSession): string {
  return (
    s.displayName ||
    s.title ||
    (s.firstUserMessage ?? '').slice(0, 60) ||
    s.sessionId.slice(0, 8)
  );
}

function projectName(s: RecapSession): string {
  if (!s.projectPath) return 'no project';
  const parts = s.projectPath.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? s.projectPath;
}

export function buildSessionDigest(s: RecapSession): string {
  const branch = s.gitBranch ? ` (${s.gitBranch})` : '';
  const lines: string[] = [`### ${sessionName(s)} — ${projectName(s)}${branch}`];

  const intent = maskSecrets((s.firstUserMessage ?? '').replace(/\s+/g, ' ').trim()).slice(0, 280);
  if (intent) lines.push(`- Intent: ${intent}`);

  const extras: string[] = [];
  if (s.hasSubagents) extras.push('subagents');
  if (s.hasTodos) extras.push('todos');
  const extraStr = extras.length ? `, ${extras.join(', ')}` : '';
  lines.push(`- Activity: ${s.messageCount} messages, ${s.toolCallCount} tool calls${extraStr}`);

  const note = maskSecrets(s.noteSummary.replace(/\s+/g, ' ').trim());
  if (note) lines.push(`- Notes: ${note}`);

  return lines.join('\n');
}

export function buildRecapPrompt(date: string, sessions: RecapSession[]): string {
  const digests = sessions.map(buildSessionDigest).join('\n\n');
  return [
    `Write my daily accomplishments recap for a standup, covering work done on ${date}.`,
    `Below are the AI coding sessions I worked on that day. Produce markdown bullet points`,
    `grouped by project. Each bullet is one concrete accomplishment in past tense, first`,
    `person, specific and plain. Merge related sessions; omit trivial or empty ones. Do not`,
    `invent work not evidenced below. Output only the recap — no preamble.`,
    ``,
    `Sessions:`,
    digests,
  ].join('\n');
}

// --- Persistence ------------------------------------------------------------

function safeParseIds(v: unknown): string[] {
  if (typeof v !== 'string') return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function mapRecapRow(r: any): DailyRecap {
  return {
    date: r.date,
    content: r.content,
    sessionIds: safeParseIds(r.session_ids),
    model: r.model ?? null,
    generatedAt: r.generated_at,
    editedAt: r.edited_at ?? null,
  };
}

export function getRecap(date: string, db: Database.Database = getDb()): DailyRecap | null {
  const r = db.prepare(`SELECT * FROM daily_recaps WHERE date = ?`).get(date);
  return r ? mapRecapRow(r) : null;
}

export function saveGeneratedRecap(
  date: string,
  content: string,
  sessionIds: string[],
  model: string | null,
  db: Database.Database = getDb(),
): DailyRecap {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO daily_recaps (date, content, session_ids, model, generated_at, edited_at)
     VALUES (@date, @content, @sessionIds, @model, @generatedAt, NULL)
     ON CONFLICT(date) DO UPDATE SET
       content=excluded.content,
       session_ids=excluded.session_ids,
       model=excluded.model,
       generated_at=excluded.generated_at,
       edited_at=NULL`,
  ).run({ date, content, sessionIds: JSON.stringify(sessionIds), model, generatedAt: now });
  return getRecap(date, db)!;
}

export function saveEditedRecap(
  date: string,
  content: string,
  db: Database.Database = getDb(),
): DailyRecap | null {
  const now = new Date().toISOString();
  const res = db
    .prepare(`UPDATE daily_recaps SET content=@content, edited_at=@editedAt WHERE date=@date`)
    .run({ date, content, editedAt: now });
  if (res.changes === 0) return null;
  return getRecap(date, db);
}

export function listRecaps(db: Database.Database = getDb()): RecapHistoryItem[] {
  return db
    .prepare(
      `SELECT date, generated_at AS generatedAt, edited_at AS editedAt
       FROM daily_recaps ORDER BY date DESC`,
    )
    .all() as RecapHistoryItem[];
}

export function previewForDate(
  date: string,
  db: Database.Database = getDb(),
): RecapSessionPreview[] {
  return selectSessionsForDate(date, db).map((s) => ({
    provider: s.provider,
    sessionId: s.sessionId,
    name: sessionName(s),
    projectPath: s.projectPath,
    gitBranch: s.gitBranch,
    messageCount: s.messageCount,
    toolCallCount: s.toolCallCount,
  }));
}

// --- Orchestration ----------------------------------------------------------

export class NoSessionsError extends Error {
  constructor(date: string) {
    super(`No sessions on ${date}`);
    this.name = 'NoSessionsError';
  }
}

type RecapRunner = (prompt: string) => Promise<string>;

// `run` is injectable so the orchestration is unit-testable without spawning the
// CLI; production callers use the default `runClaudeHeadless`.
export async function generateRecap(
  date: string,
  run: RecapRunner = runClaudeHeadless,
  db: Database.Database = getDb(),
): Promise<DailyRecap> {
  const sessions = selectSessionsForDate(date, db);
  if (sessions.length === 0) throw new NoSessionsError(date);
  const prompt = buildRecapPrompt(date, sessions);
  const content = await run(prompt);
  const sessionIds = sessions.map((s) => `${s.provider}:${s.sessionId}`);
  return saveGeneratedRecap(date, content.trim(), sessionIds, null, db);
}
