import { getDb } from './db.js';
import type { Session, SessionFilter, SessionListItem } from '../../shared/types.js';

const COLS = `
  s.provider AS provider, s.session_id AS sessionId, s.title AS title,
  s.project_path AS projectPath, s.git_branch AS gitBranch,
  s.created_at AS createdAt, s.updated_at AS updatedAt,
  s.first_user_message AS firstUserMessage, s.source_path AS sourcePath,
  s.archived AS archived, s.message_count AS messageCount,
  s.tool_call_count AS toolCallCount,
  s.has_subagents AS hasSubagents, s.has_todos AS hasTodos,
  s.model AS model, s.tokens_used AS tokensUsed,
  s.parent_session_id AS parentSessionId,
  s.input_tokens AS inputTokens, s.output_tokens AS outputTokens,
  s.cache_read_tokens AS cacheReadTokens,
  s.cache_creation_tokens AS cacheCreationTokens,
  s.last_context_tokens AS lastContextTokens,
  s.context_window AS contextWindow
`;

export function listSessions(filter: SessionFilter): { items: SessionListItem[]; total: number } {
  const db = getDb();
  const where: string[] = [];
  const args: Record<string, any> = {};

  if (filter.provider && filter.provider !== 'all') {
    where.push('s.provider = @provider');
    args.provider = filter.provider;
  }
  if (filter.projectPath) {
    where.push('s.project_path = @projectPath');
    args.projectPath = filter.projectPath;
  }
  if (filter.branch) {
    where.push('s.git_branch = @branch');
    args.branch = filter.branch;
  }
  if (typeof filter.archived === 'boolean') {
    where.push('s.archived = @archived');
    args.archived = filter.archived ? 1 : 0;
  }
  if (filter.hasTools) {
    where.push('s.tool_call_count > 0');
  }
  if (filter.hasSubagents) {
    where.push('s.has_subagents = 1');
  }
  if (filter.from) {
    where.push('(s.updated_at >= @from OR s.created_at >= @from)');
    args.from = filter.from;
  }
  if (filter.to) {
    where.push('(s.updated_at <= @to OR s.created_at <= @to)');
    args.to = filter.to;
  }

  let joinFts = '';
  if (filter.q && filter.q.trim()) {
    joinFts = `JOIN sessions_fts ON sessions_fts.provider = s.provider AND sessions_fts.session_id = s.session_id`;
    where.push('sessions_fts MATCH @q');
    args.q = ftsQuery(filter.q);
  }

  const hasQuery = !!(filter.q && filter.q.trim());
  const snippetSelect = hasQuery
    ? `, snippet(sessions_fts, 6, char(2), char(3), '…', 12) AS matchSnippet`
    : '';
  const orderSql = hasQuery
    ? `ORDER BY bm25(sessions_fts)`
    : `ORDER BY COALESCE(s.updated_at, s.created_at) DESC`;

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(filter.limit ?? 50, 200);
  const offset = filter.offset ?? 0;

  const totalRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM sessions s ${joinFts} ${whereSql}`,
    )
    .get(args) as { c: number };

  const rows = db
    .prepare(
      `SELECT ${COLS}${snippetSelect} FROM sessions s ${joinFts} ${whereSql}
       ${orderSql}
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...args, limit, offset }) as any[];

  return {
    items: rows.map((r) => ({ ...toSession(r), matchSnippet: r.matchSnippet ?? null })),
    total: totalRow.c,
  };
}

export function getSession(provider: string, sessionId: string): Session | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT ${COLS} FROM sessions s WHERE s.provider = ? AND s.session_id = ?`)
    .get(provider, sessionId) as any;
  return row ? toSession(row) : null;
}

export function listProjects(): Array<{
  projectPath: string;
  sessionCount: number;
  latestUpdatedAt: string | null;
  providers: string[];
  branches: string[];
}> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT project_path AS projectPath,
              COUNT(*) AS sessionCount,
              MAX(COALESCE(updated_at, created_at)) AS latestUpdatedAt,
              GROUP_CONCAT(DISTINCT provider) AS providers,
              GROUP_CONCAT(DISTINCT git_branch) AS branches
       FROM sessions
       WHERE project_path IS NOT NULL AND project_path != ''
       GROUP BY project_path
       ORDER BY latestUpdatedAt DESC NULLS LAST`,
    )
    .all() as any[];
  return rows.map((r) => ({
    projectPath: r.projectPath,
    sessionCount: r.sessionCount,
    latestUpdatedAt: r.latestUpdatedAt,
    providers: (r.providers ?? '').split(',').filter(Boolean),
    branches: (r.branches ?? '').split(',').filter(Boolean),
  }));
}

export function dashboardStats(): {
  totalSessions: number;
  claudeSessions: number;
  codexSessions: number;
  recent: Session[];
  active: Session[];
  topProjects: ReturnType<typeof listProjects>;
} {
  const db = getDb();
  const totals = db.prepare(`SELECT provider, COUNT(*) AS c FROM sessions GROUP BY provider`).all() as any[];
  let claudeSessions = 0;
  let codexSessions = 0;
  for (const t of totals) {
    if (t.provider === 'claude') claudeSessions = t.c;
    if (t.provider === 'codex') codexSessions = t.c;
  }
  const recent = (
    db
      .prepare(
        `SELECT ${COLS} FROM sessions s ORDER BY COALESCE(s.updated_at, s.created_at) DESC LIMIT 10`,
      )
      .all() as any[]
  ).map(toSession);

  // Active = updated within the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const active = (
    db
      .prepare(
        `SELECT ${COLS} FROM sessions s
         WHERE COALESCE(s.updated_at, s.created_at) >= ?
         ORDER BY COALESCE(s.updated_at, s.created_at) DESC LIMIT 5`,
      )
      .all(oneHourAgo) as any[]
  ).map(toSession);

  const topProjects = listProjects().slice(0, 5);

  return {
    totalSessions: claudeSessions + codexSessions,
    claudeSessions,
    codexSessions,
    recent,
    active,
    topProjects,
  };
}

function ftsQuery(raw: string): string {
  // Quote tokens to be safe with FTS5 syntax; allow simple AND of words.
  const tokens = raw
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '""')}"`);
  return tokens.join(' ');
}

function toSession(r: any): Session {
  return {
    provider: r.provider,
    sessionId: r.sessionId,
    title: r.title,
    projectPath: r.projectPath,
    gitBranch: r.gitBranch,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    firstUserMessage: r.firstUserMessage,
    sourcePath: r.sourcePath,
    archived: !!r.archived,
    messageCount: r.messageCount,
    toolCallCount: r.toolCallCount,
    hasSubagents: !!r.hasSubagents,
    hasTodos: !!r.hasTodos,
    model: r.model,
    tokensUsed: r.tokensUsed,
    parentSessionId: r.parentSessionId,
    inputTokens: r.inputTokens ?? null,
    outputTokens: r.outputTokens ?? null,
    cacheReadTokens: r.cacheReadTokens ?? null,
    cacheCreationTokens: r.cacheCreationTokens ?? null,
    lastContextTokens: r.lastContextTokens ?? null,
    contextWindow: r.contextWindow ?? null,
  };
}
