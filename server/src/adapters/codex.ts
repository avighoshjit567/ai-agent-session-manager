import fs from 'node:fs';
import readline from 'node:readline';
import Database from 'better-sqlite3';
import { findCodexStateDb } from '../paths.js';
import type { Session, TimelineItem } from '../../../shared/types.js';
import { deriveTitle, capBody } from '../extract.js';

interface CodexThreadRow {
  id: string;
  rollout_path: string;
  created_at: number;
  updated_at: number;
  cwd: string;
  title: string;
  first_user_message: string | null;
  git_branch: string | null;
  archived: number;
  tokens_used: number;
  model: string | null;
}

function openCodexDb(): Database.Database | null {
  const dbPath = findCodexStateDb();
  if (!dbPath) return null;
  try {
    // Open read-only to keep their file safe
    return new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch {
    return null;
  }
}

export function listCodexThreads(): Array<{ session: Session; mtime: number }> {
  const db = openCodexDb();
  if (!db) return [];
  try {
    // Defensive: probe columns and only select what exists
    const cols = new Set(
      (db.prepare(`PRAGMA table_info(threads)`).all() as any[]).map((c) => c.name),
    );
    const wanted = [
      'id',
      'rollout_path',
      'created_at',
      'updated_at',
      'cwd',
      'title',
      'first_user_message',
      'git_branch',
      'archived',
      'tokens_used',
      'model',
    ].filter((c) => cols.has(c));
    if (wanted.length === 0) return [];
    const sql = `SELECT ${wanted.join(', ')} FROM threads`;
    const rows = db.prepare(sql).all() as CodexThreadRow[];
    return rows.map((r) => {
      let mtime = 0;
      try {
        if (r.rollout_path && fs.existsSync(r.rollout_path)) {
          mtime = fs.statSync(r.rollout_path).mtimeMs;
        }
      } catch {
        // ignore
      }
      const session: Session = {
        provider: 'codex',
        sessionId: r.id,
        title: deriveTitle(r.title || null, r.first_user_message || null),
        projectPath: r.cwd || null,
        gitBranch: r.git_branch || null,
        createdAt: r.created_at ? new Date(r.created_at * 1000).toISOString() : null,
        updatedAt: r.updated_at ? new Date(r.updated_at * 1000).toISOString() : null,
        firstUserMessage: r.first_user_message ? truncate(r.first_user_message, 500) : null,
        sourcePath: r.rollout_path || '',
        archived: !!r.archived,
        messageCount: 0, // filled by adapter on demand
        toolCallCount: 0,
        hasSubagents: false,
        hasTodos: false,
        model: r.model || null,
        tokensUsed: r.tokens_used ?? null,
        parentSessionId: null,
        inputTokens: null,
        outputTokens: null,
        cacheReadTokens: null,
        cacheCreationTokens: null,
        lastContextTokens: null,
        contextWindow: null,
      };
      return { session, mtime };
    });
  } finally {
    db.close();
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/**
 * Walk the rollout JSONL to fill message/tool counts and pull context-window
 * info from the most recent task_started event.
 */
export async function enrichCodexSession(session: Session): Promise<{ session: Session; body: string }> {
  if (!session.sourcePath || !fs.existsSync(session.sourcePath)) {
    return { session, body: '' };
  }
  let messageCount = 0;
  let toolCallCount = 0;
  let contextWindow: number | null = null;
  let lastContextTokens: number | null = null;
  const bodyParts: string[] = [];

  for await (const ev of readJsonl(session.sourcePath)) {
    if (!ev || typeof ev !== 'object') continue;
    const evType = ev.type;
    const p = ev.payload ?? {};
    const pType = p.type;

    if (evType === 'event_msg') {
      if (pType === 'user_message' || pType === 'agent_message') {
        messageCount++;
        const txt = typeof p.message === 'string' ? p.message : extractCodexText(p);
        if (txt) bodyParts.push(txt);
      }
      if (pType === 'task_started' && typeof p.model_context_window === 'number') {
        contextWindow = p.model_context_window;
      }
      if (pType === 'token_count' && p.info && typeof p.info === 'object') {
        // info shape varies by version; pick the most useful fields when present
        const info = p.info as Record<string, unknown>;
        const cand = num(info.total_token_usage_input) || num(info.total_input_tokens) || num(info.input_tokens);
        if (cand > 0) lastContextTokens = cand;
      }
    } else if (evType === 'response_item') {
      if (pType === 'function_call' || pType === 'custom_tool_call') toolCallCount++;
    }
  }

  return {
    session: {
      ...session,
      messageCount,
      toolCallCount,
      contextWindow,
      lastContextTokens,
    },
    body: capBody(bodyParts.join('\n')),
  };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export async function buildCodexTimeline(session: Session): Promise<TimelineItem[]> {
  const out: TimelineItem[] = [];
  if (!session.sourcePath || !fs.existsSync(session.sourcePath)) return out;
  let idx = 0;
  let seenSessionMeta = false;

  for await (const ev of readJsonl(session.sourcePath)) {
    if (!ev || typeof ev !== 'object') continue;
    const id = `${session.sessionId}:${idx++}`;
    const ts: string | null = typeof ev.timestamp === 'string' ? ev.timestamp : null;
    const evType = ev.type;
    const p = ev.payload ?? {};
    const pType = p.type;

    if (evType === 'session_meta') {
      if (!seenSessionMeta) {
        out.push({
          id,
          provider: 'codex',
          sessionId: session.sessionId,
          type: 'metadata',
          timestamp: ts,
          content: `Session started${p.cli_version ? ` · codex ${p.cli_version}` : ''}${p.cwd ? ` · ${p.cwd}` : ''}`,
        });
        seenSessionMeta = true;
      }
      continue;
    }

    // ----- event_msg -----
    if (evType === 'event_msg') {
      switch (pType) {
        case 'user_message': {
          const txt = typeof p.message === 'string' ? p.message : extractCodexText(p);
          if (txt) {
            out.push({
              id,
              provider: 'codex',
              sessionId: session.sessionId,
              type: 'user',
              timestamp: ts,
              content: txt,
            });
          }
          break;
        }
        case 'agent_message': {
          const txt = typeof p.message === 'string' ? p.message : extractCodexText(p);
          if (txt) {
            out.push({
              id,
              provider: 'codex',
              sessionId: session.sessionId,
              type: 'assistant',
              timestamp: ts,
              content: txt,
            });
          }
          break;
        }
        case 'task_started':
        case 'task_complete':
        case 'token_count':
        case 'patch_apply_start':
        case 'patch_apply_end':
        case 'compaction':
        case 'context_compacted':
          // noise — skip
          break;
        default:
          // unknown event_msg subtype — skip silently
          break;
      }
      continue;
    }

    // ----- response_item (mirrors the model API request/response shape) -----
    if (evType === 'response_item') {
      // Skip role=developer/system messages (these are the system/permissions prompt).
      // User and assistant message text is already captured via event_msg/{user,agent}_message,
      // so we skip response_item/message entirely to avoid duplicates.
      if (pType === 'message') {
        continue;
      }
      if (pType === 'function_call' || pType === 'custom_tool_call') {
        out.push({
          id,
          provider: 'codex',
          sessionId: session.sessionId,
          type: 'tool_call',
          timestamp: ts,
          toolName: p.name ?? p.tool_name ?? null,
          content:
            typeof p.arguments === 'string'
              ? p.arguments
              : safeStringify(p.arguments ?? p.input),
        });
        continue;
      }
      if (pType === 'function_call_output' || pType === 'custom_tool_call_output') {
        let body: string;
        if (typeof p.output === 'string') {
          // custom_tool_call_output wraps in JSON {"output": "..."}; unwrap for readability
          body = p.output;
          if (pType === 'custom_tool_call_output' && body.startsWith('{')) {
            try {
              const parsed = JSON.parse(body);
              if (typeof parsed?.output === 'string') body = parsed.output;
            } catch {
              // keep raw
            }
          }
        } else {
          body = safeStringify(p.output ?? p.result);
        }
        out.push({
          id,
          provider: 'codex',
          sessionId: session.sessionId,
          type: 'tool_result',
          timestamp: ts,
          content: body,
        });
        continue;
      }
      if (pType === 'reasoning') {
        // Reasoning content is often encrypted/empty — only include if there's actual text
        const txt = extractCodexText(p);
        if (txt && txt.length > 0 && txt !== '{}') {
          out.push({
            id,
            provider: 'codex',
            sessionId: session.sessionId,
            type: 'reasoning',
            timestamp: ts,
            content: txt,
          });
        }
        continue;
      }
      continue;
    }

    // turn_context and unknown top-level types are skipped
  }
  return out;
}

function extractCodexText(p: any): string {
  if (!p) return '';
  if (typeof p.text === 'string') return p.text;
  if (typeof p.message === 'string') return p.message;
  if (typeof p.content === 'string') return p.content;
  if (Array.isArray(p.content)) {
    return p.content
      .map((c: any) => (typeof c === 'string' ? c : c?.text ?? ''))
      .filter(Boolean)
      .join('\n');
  }
  return safeStringify(p);
}

function safeStringify(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

async function* readJsonl(file: string): AsyncGenerator<any> {
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    try {
      yield JSON.parse(t);
    } catch {
      // skip
    }
  }
}
