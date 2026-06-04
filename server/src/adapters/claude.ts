import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { PATHS, decodeClaudeProjectPath } from '../paths.js';
import type { Session, TimelineItem } from '../../../shared/types.js';
import { deriveTitle, capBody, stripInjected } from '../extract.js';

interface ClaudeEvent {
  type?: string;
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  isSidechain?: boolean;
  message?: any;
  toolUseResult?: any;
  // for ai-title events
  text?: string;
  title?: string;
  aiTitle?: string;
}

export interface ClaudeSessionFile {
  sessionId: string;
  filePath: string;
  projectDir: string;
  projectPath: string;
  mtime: number;
}

export function listClaudeSessionFiles(): ClaudeSessionFile[] {
  if (!fs.existsSync(PATHS.claudeProjects)) return [];
  const out: ClaudeSessionFile[] = [];
  const projectDirs = fs.readdirSync(PATHS.claudeProjects, { withFileTypes: true });
  for (const d of projectDirs) {
    if (!d.isDirectory()) continue;
    const projectDir = path.join(PATHS.claudeProjects, d.name);
    const projectPath = decodeClaudeProjectPath(d.name);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(projectDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.jsonl')) continue;
      const filePath = path.join(projectDir, e.name);
      const sessionId = e.name.replace(/\.jsonl$/, '');
      let stat: fs.Stats;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }
      out.push({
        sessionId,
        filePath,
        projectDir,
        projectPath,
        mtime: stat.mtimeMs,
      });
    }
  }
  return out;
}

interface ClaudeParseResult {
  session: Session;
  events: ClaudeEvent[];
  body: string;
}

// Known Claude model context windows. Default is 200K; the "[1m]" variants
// expose a 1M window. We also bump to 1M when we observe input > 250K.
const CLAUDE_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-7[1m]': 1_000_000,
  'claude-sonnet-4-6[1m]': 1_000_000,
  'claude-opus-4-7': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-haiku-4-5': 200_000,
  'claude-3-7-sonnet': 200_000,
  'claude-3-5-sonnet': 200_000,
};

function lookupContextWindow(model: string | null, observedMaxInput: number): number {
  let base = 200_000;
  if (model) {
    if (CLAUDE_CONTEXT_WINDOWS[model] !== undefined) base = CLAUDE_CONTEXT_WINDOWS[model];
    else if (/\[1m\]/i.test(model)) base = 1_000_000;
  }
  // Any observed input above 200K means the user is on the 1M variant of their
  // model (the only extended tier Anthropic currently exposes for Opus/Sonnet).
  if (observedMaxInput > 200_000) return 1_000_000;
  return base;
}

export async function parseClaudeSession(file: ClaudeSessionFile): Promise<ClaudeParseResult> {
  const events = await readJsonl(file.filePath);

  let title: string | null = null;
  let firstUserMessage: string | null = null;
  let createdAt: string | null = null;
  let updatedAt: string | null = null;
  let gitBranch: string | null = null;
  let model: string | null = null;
  const parentSessionId: string | null = null;
  let messageCount = 0;
  let toolCallCount = 0;
  let hasSubagents = false;
  const bodyParts: string[] = [];

  // Token accounting
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let lastContextTokens: number | null = null;
  let observedMaxInput = 0;

  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    if (ev.timestamp) {
      if (!createdAt) createdAt = ev.timestamp;
      updatedAt = ev.timestamp;
    }
    if (ev.gitBranch && !gitBranch) gitBranch = ev.gitBranch;
    if (ev.isSidechain) hasSubagents = true;

    if (ev.type === 'ai-title') {
      const t = (ev as any).aiTitle ?? (ev as any).title ?? (ev as any).text;
      if (typeof t === 'string' && t.trim()) title = t.trim();
    }

    if (ev.type === 'user' && !ev.isSidechain) {
      messageCount++;
      const userText = extractText(ev.message);
      if (userText) bodyParts.push(stripInjected(userText));
      if (!firstUserMessage) {
        firstUserMessage = userText;
      }
    }
    if (ev.type === 'assistant') {
      messageCount++;
      const m = ev.message;
      if (m && typeof m === 'object') {
        if (!model && typeof m.model === 'string') model = m.model;
        if (m.usage && typeof m.usage === 'object') {
          const u = m.usage as Record<string, unknown>;
          const inp = num(u.input_tokens);
          const out = num(u.output_tokens);
          const cacheC = num(u.cache_creation_input_tokens);
          const cacheR = num(u.cache_read_input_tokens);
          inputTokens += inp;
          outputTokens += out;
          cacheCreationTokens += cacheC;
          cacheReadTokens += cacheR;
          const ctx = inp + cacheC + cacheR;
          if (ctx > observedMaxInput) observedMaxInput = ctx;
          // last assistant turn = current context size at resume time
          lastContextTokens = ctx;
        }
      }
      if (m && Array.isArray(m.content)) {
        for (const c of m.content) {
          if (c && c.type === 'tool_use') toolCallCount++;
          if (c && c.type === 'text' && typeof c.text === 'string') bodyParts.push(c.text);
        }
      }
    }
  }

  const contextWindow = lookupContextWindow(model, observedMaxInput);
  const tokensUsed = inputTokens + outputTokens; // rough "spend" — excludes cache reads

  // Check for subagents directory
  const subagentDir = path.join(file.projectDir, file.sessionId, 'subagents');
  if (!hasSubagents && fs.existsSync(subagentDir)) {
    try {
      const items = fs.readdirSync(subagentDir);
      if (items.length > 0) hasSubagents = true;
    } catch {
      // ignore
    }
  }

  // Check todos
  let hasTodos = false;
  const todosFile = path.join(PATHS.claudeTodos, `${file.sessionId}-agent-${file.sessionId}.json`);
  if (fs.existsSync(todosFile)) hasTodos = true;

  const cleanedFirst = firstUserMessage ? cleanFirstMessage(firstUserMessage) : null;
  const derivedTitle = deriveTitle(title, cleanedFirst);
  const body = capBody(bodyParts.join('\n'));

  const session: Session = {
    provider: 'claude',
    sessionId: file.sessionId,
    title: derivedTitle,
    projectPath: file.projectPath,
    gitBranch,
    createdAt,
    updatedAt,
    firstUserMessage: cleanedFirst,
    sourcePath: file.filePath,
    archived: false,
    messageCount,
    toolCallCount,
    hasSubagents,
    hasTodos,
    model,
    tokensUsed: tokensUsed > 0 ? tokensUsed : null,
    parentSessionId,
    inputTokens: inputTokens > 0 ? inputTokens : null,
    outputTokens: outputTokens > 0 ? outputTokens : null,
    cacheReadTokens: cacheReadTokens > 0 ? cacheReadTokens : null,
    cacheCreationTokens: cacheCreationTokens > 0 ? cacheCreationTokens : null,
    lastContextTokens,
    contextWindow: lastContextTokens !== null ? contextWindow : null,
  };

  return { session, events, body };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export async function buildClaudeTimeline(file: ClaudeSessionFile): Promise<TimelineItem[]> {
  const events = await readJsonl(file.filePath);
  const out: TimelineItem[] = [];
  let idx = 0;
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    const id = `${file.sessionId}:${idx++}`;
    if (ev.type === 'user') {
      // Filter out tool_result-only user turns — those are tool outputs being
      // fed back to the model, not human input
      if (isToolResultOnlyTurn(ev.message)) {
        out.push({
          id,
          provider: 'claude',
          sessionId: file.sessionId,
          type: 'tool_result',
          timestamp: ev.timestamp ?? null,
          content: extractToolResultText(ev.message),
        });
        continue;
      }
      const txt = stripInjectedTags(extractText(ev.message));
      if (!txt) continue;
      out.push({
        id,
        provider: 'claude',
        sessionId: file.sessionId,
        type: 'user',
        timestamp: ev.timestamp ?? null,
        content: txt,
        metadata: { isSidechain: !!ev.isSidechain },
      });
    } else if (ev.type === 'assistant') {
      const m = ev.message;
      if (m && Array.isArray(m.content)) {
        for (const c of m.content) {
          if (!c) continue;
          if (c.type === 'text') {
            const t = typeof c.text === 'string' ? c.text : '';
            if (!t.trim()) continue;
            out.push({
              id: `${id}:${out.length}`,
              provider: 'claude',
              sessionId: file.sessionId,
              type: 'assistant',
              timestamp: ev.timestamp ?? null,
              content: t,
              metadata: { model: m.model },
            });
          } else if (c.type === 'thinking') {
            const t = typeof c.thinking === 'string' ? c.thinking : '';
            if (!t.trim()) continue; // skip empty/encrypted thinking
            out.push({
              id: `${id}:${out.length}`,
              provider: 'claude',
              sessionId: file.sessionId,
              type: 'reasoning',
              timestamp: ev.timestamp ?? null,
              content: t,
            });
          } else if (c.type === 'tool_use') {
            out.push({
              id: `${id}:${out.length}`,
              provider: 'claude',
              sessionId: file.sessionId,
              type: 'tool_call',
              timestamp: ev.timestamp ?? null,
              toolName: c.name ?? null,
              content: safeStringify(c.input),
              metadata: { toolUseId: c.id },
            });
          }
        }
      }
    } else if (ev.type === 'ai-title') {
      // Skip — title is already shown in the header
      continue;
    }
    // Skip attachment, file-history-snapshot, last-prompt, queue-operation — pure noise
  }
  return out;
}

function isToolResultOnlyTurn(message: any): boolean {
  if (!message || !Array.isArray(message.content)) return false;
  return (
    message.content.length > 0 &&
    message.content.every((c: any) => c && c.type === 'tool_result')
  );
}

function extractToolResultText(message: any): string {
  if (!message || !Array.isArray(message.content)) return '';
  const parts: string[] = [];
  for (const c of message.content) {
    if (!c) continue;
    if (typeof c.content === 'string') parts.push(c.content);
    else if (Array.isArray(c.content)) {
      for (const inner of c.content) {
        if (typeof inner === 'string') parts.push(inner);
        else if (inner?.type === 'text' && typeof inner.text === 'string') parts.push(inner.text);
      }
    }
  }
  return parts.join('\n').trim();
}

function stripInjectedTags(text: string | null): string {
  if (!text) return '';
  let out = text;
  out = out.replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g, '');
  out = out.replace(/<ide_selection>[\s\S]*?<\/ide_selection>/g, '');
  out = out.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  out = out.replace(/<command-name>[\s\S]*?<\/command-name>/g, '');
  out = out.replace(/<command-message>[\s\S]*?<\/command-message>/g, '');
  out = out.replace(/<command-args>[\s\S]*?<\/command-args>/g, '');
  out = out.replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '');
  return out.trim();
}

function extractText(message: any): string | null {
  if (!message) return null;
  if (typeof message === 'string') return message;
  if (Array.isArray(message.content)) {
    const parts: string[] = [];
    for (const c of message.content) {
      if (!c) continue;
      if (typeof c === 'string') parts.push(c);
      else if (c.type === 'text' && typeof c.text === 'string') parts.push(c.text);
      else if (c.type === 'tool_result' && typeof c.content === 'string') parts.push(c.content);
    }
    return parts.join('\n').trim() || null;
  }
  if (typeof message.content === 'string') return message.content;
  return null;
}

function cleanFirstMessage(text: string): string {
  // Strip leading IDE-injected wrappers and system reminders
  let out = text;
  out = out.replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g, '');
  out = out.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
  out = out.replace(/<command-name>[\s\S]*?<\/command-name>/g, '');
  out = out.replace(/<command-message>[\s\S]*?<\/command-message>/g, '');
  out = out.trim();
  if (out.length > 500) out = out.slice(0, 500) + '…';
  return out;
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

async function readJsonl(file: string): Promise<ClaudeEvent[]> {
  const out: ClaudeEvent[] = [];
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // skip malformed line
    }
  }
  return out;
}
