import { getDb } from './db.js';
import {
  listClaudeSessionFiles,
  parseClaudeSession,
  type ClaudeSessionFile,
} from './adapters/claude.js';
import { listCodexThreads, enrichCodexSession } from './adapters/codex.js';
import type { Session } from '../../shared/types.js';

export interface IndexStats {
  startedAt: string;
  finishedAt: string | null;
  claudeSessions: number;
  codexSessions: number;
  errors: string[];
}

let lastStats: IndexStats | null = null;
let inProgress = false;

export function getIndexStats(): IndexStats | null {
  return lastStats;
}

export function isIndexing(): boolean {
  return inProgress;
}

export async function runFullIndex(opts: { force?: boolean } = {}): Promise<IndexStats> {
  if (inProgress) {
    throw new Error('Indexing already in progress');
  }
  inProgress = true;
  const stats: IndexStats = {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    claudeSessions: 0,
    codexSessions: 0,
    errors: [],
  };
  try {
    const db = getDb();
    // Snapshot of known mtimes
    const knownMtimes = new Map<string, number>();
    const rows = db.prepare(`SELECT provider, session_id, mtime FROM sessions`).all() as any[];
    for (const r of rows) knownMtimes.set(`${r.provider}:${r.session_id}`, r.mtime ?? 0);

    // ---- Claude ----
    const claudeFiles = listClaudeSessionFiles();
    for (const f of claudeFiles) {
      const key = `claude:${f.sessionId}`;
      const known = knownMtimes.get(key);
      if (!opts.force && known && Math.abs(known - f.mtime) < 500) {
        stats.claudeSessions++;
        continue;
      }
      try {
        const { session } = await parseClaudeSession(f);
        upsertSession(session, f.mtime);
        stats.claudeSessions++;
      } catch (e: any) {
        stats.errors.push(`claude ${f.sessionId}: ${e?.message ?? e}`);
      }
    }

    // ---- Codex ----
    const codexRows = listCodexThreads();
    for (const { session, mtime } of codexRows) {
      const key = `codex:${session.sessionId}`;
      const known = knownMtimes.get(key);
      if (!opts.force && known && mtime && Math.abs(known - mtime) < 500) {
        stats.codexSessions++;
        continue;
      }
      try {
        const enriched = await enrichCodexSession(session);
        upsertSession(enriched, mtime);
        stats.codexSessions++;
      } catch (e: any) {
        stats.errors.push(`codex ${session.sessionId}: ${e?.message ?? e}`);
      }
    }

    cleanupMissing(claudeFiles, codexRows.map((r) => r.session.sessionId));
  } finally {
    stats.finishedAt = new Date().toISOString();
    lastStats = stats;
    inProgress = false;
  }
  return stats;
}

function upsertSession(s: Session, mtime: number): void {
  const db = getDb();
  const indexedAt = new Date().toISOString();
  const sql = `
    INSERT INTO sessions (
      provider, session_id, title, project_path, git_branch,
      created_at, updated_at, first_user_message, source_path, archived,
      message_count, tool_call_count, has_subagents, has_todos,
      model, tokens_used, parent_session_id, indexed_at, mtime,
      input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
      last_context_tokens, context_window
    ) VALUES (
      @provider, @sessionId, @title, @projectPath, @gitBranch,
      @createdAt, @updatedAt, @firstUserMessage, @sourcePath, @archived,
      @messageCount, @toolCallCount, @hasSubagents, @hasTodos,
      @model, @tokensUsed, @parentSessionId, @indexedAt, @mtime,
      @inputTokens, @outputTokens, @cacheReadTokens, @cacheCreationTokens,
      @lastContextTokens, @contextWindow
    )
    ON CONFLICT(provider, session_id) DO UPDATE SET
      title=excluded.title,
      project_path=excluded.project_path,
      git_branch=excluded.git_branch,
      created_at=excluded.created_at,
      updated_at=excluded.updated_at,
      first_user_message=excluded.first_user_message,
      source_path=excluded.source_path,
      archived=excluded.archived,
      message_count=excluded.message_count,
      tool_call_count=excluded.tool_call_count,
      has_subagents=excluded.has_subagents,
      has_todos=excluded.has_todos,
      model=excluded.model,
      tokens_used=excluded.tokens_used,
      parent_session_id=excluded.parent_session_id,
      indexed_at=excluded.indexed_at,
      mtime=excluded.mtime,
      input_tokens=excluded.input_tokens,
      output_tokens=excluded.output_tokens,
      cache_read_tokens=excluded.cache_read_tokens,
      cache_creation_tokens=excluded.cache_creation_tokens,
      last_context_tokens=excluded.last_context_tokens,
      context_window=excluded.context_window
  `;
  db.prepare(sql).run({
    provider: s.provider,
    sessionId: s.sessionId,
    title: s.title,
    projectPath: s.projectPath,
    gitBranch: s.gitBranch,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    firstUserMessage: s.firstUserMessage,
    sourcePath: s.sourcePath,
    archived: s.archived ? 1 : 0,
    messageCount: s.messageCount,
    toolCallCount: s.toolCallCount,
    hasSubagents: s.hasSubagents ? 1 : 0,
    hasTodos: s.hasTodos ? 1 : 0,
    model: s.model,
    tokensUsed: s.tokensUsed,
    parentSessionId: s.parentSessionId,
    indexedAt,
    mtime,
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
    cacheReadTokens: s.cacheReadTokens,
    cacheCreationTokens: s.cacheCreationTokens,
    lastContextTokens: s.lastContextTokens,
    contextWindow: s.contextWindow,
  });

  // Refresh FTS row
  db.prepare(`DELETE FROM sessions_fts WHERE provider = ? AND session_id = ?`).run(
    s.provider,
    s.sessionId,
  );
  db.prepare(
    `INSERT INTO sessions_fts (provider, session_id, title, project_path, git_branch, first_user_message)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    s.provider,
    s.sessionId,
    s.title ?? '',
    s.projectPath ?? '',
    s.gitBranch ?? '',
    s.firstUserMessage ?? '',
  );
}

function cleanupMissing(claudeFiles: ClaudeSessionFile[], codexIds: string[]): void {
  const db = getDb();
  const claudeIds = new Set(claudeFiles.map((f) => f.sessionId));
  const codexSet = new Set(codexIds);
  const rows = db.prepare(`SELECT provider, session_id FROM sessions`).all() as any[];
  const del = db.prepare(`DELETE FROM sessions WHERE provider = ? AND session_id = ?`);
  const delFts = db.prepare(`DELETE FROM sessions_fts WHERE provider = ? AND session_id = ?`);
  const tx = db.transaction((toRemove: Array<[string, string]>) => {
    for (const [provider, id] of toRemove) {
      del.run(provider, id);
      delFts.run(provider, id);
    }
  });
  const toRemove: Array<[string, string]> = [];
  for (const r of rows) {
    if (r.provider === 'claude' && !claudeIds.has(r.session_id)) toRemove.push(['claude', r.session_id]);
    if (r.provider === 'codex' && !codexSet.has(r.session_id)) toRemove.push(['codex', r.session_id]);
  }
  if (toRemove.length > 0) tx(toRemove);
}

export function reindexSingle(provider: 'claude' | 'codex', sessionId: string): void {
  // Best-effort: trigger a full incremental run; live updates use this as a placeholder.
  void runFullIndex().catch(() => {
    // swallow — next full index will catch up
  });
  void provider;
  void sessionId;
}
