import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from './paths.js';
import { maskSecrets } from './privacy.js';
import { getSession } from './search.js';
import { buildClaudeTimeline, listClaudeSessionFiles } from './adapters/claude.js';
import { buildCodexTimeline } from './adapters/codex.js';
import { getNote } from './notes.js';
import type { Session, TimelineItem, Provider } from '../../shared/types.js';

export interface ExportOptions {
  includeToolOutputs?: boolean;
  maskSecrets?: boolean;
}

export async function exportSessionMarkdown(
  provider: Provider,
  sessionId: string,
  opts: ExportOptions = {},
): Promise<{ path: string; content: string }> {
  const session = getSession(provider, sessionId);
  if (!session) throw new Error('Session not found');
  const timeline = await loadTimeline(session);
  const note = getNote(provider, sessionId);
  const md = renderMarkdown(session, timeline, note, opts);

  const projectName = session.projectPath ? path.basename(session.projectPath) : 'unknown-project';
  const date = (session.createdAt ?? session.updatedAt ?? new Date().toISOString()).slice(0, 10);
  const titleSlug = slug(session.title ?? session.firstUserMessage ?? sessionId).slice(0, 60);
  const dir = path.join(PATHS.exportsDir, projectName);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${date}-${provider}-${titleSlug || sessionId.slice(0, 8)}.md`;
  const fullPath = path.join(dir, fileName);
  fs.writeFileSync(fullPath, md, 'utf8');
  return { path: fullPath, content: md };
}

async function loadTimeline(session: Session): Promise<TimelineItem[]> {
  if (session.provider === 'claude') {
    const files = listClaudeSessionFiles();
    const file = files.find((f) => f.sessionId === session.sessionId);
    if (!file) return [];
    return buildClaudeTimeline(file);
  }
  return buildCodexTimeline(session);
}

function renderMarkdown(
  s: Session,
  items: TimelineItem[],
  note: ReturnType<typeof getNote>,
  opts: ExportOptions,
): string {
  const mask = opts.maskSecrets !== false;
  const apply = (txt: string | null): string => (mask ? maskSecrets(txt ?? '') : txt ?? '');

  const lines: string[] = [];
  lines.push(`# ${s.title ?? s.firstUserMessage?.slice(0, 80) ?? 'Untitled session'}`);
  lines.push('');
  lines.push(`Provider: ${s.provider}`);
  if (s.projectPath) lines.push(`Project: ${s.projectPath}`);
  if (s.gitBranch) lines.push(`Branch: ${s.gitBranch}`);
  if (s.createdAt) lines.push(`Started: ${s.createdAt}`);
  if (s.updatedAt) lines.push(`Updated: ${s.updatedAt}`);
  if (s.model) lines.push(`Model: ${s.model}`);
  if (s.tokensUsed) lines.push(`Tokens: ${s.tokensUsed}`);
  lines.push('');

  if (s.firstUserMessage) {
    lines.push(`## First Request`);
    lines.push('');
    lines.push(apply(s.firstUserMessage));
    lines.push('');
  }

  if (note.summary || note.followUps || note.lessons || note.tags.length) {
    lines.push(`## Private Notes`);
    lines.push('');
    if (note.status !== 'none') lines.push(`Status: **${note.status}**`);
    if (note.tags.length) lines.push(`Tags: ${note.tags.join(', ')}`);
    if (note.summary) {
      lines.push('');
      lines.push('### Summary');
      lines.push(note.summary);
    }
    if (note.followUps) {
      lines.push('');
      lines.push('### Follow-ups');
      lines.push(note.followUps);
    }
    if (note.lessons) {
      lines.push('');
      lines.push('### Lessons');
      lines.push(note.lessons);
    }
    lines.push('');
  }

  lines.push(`## Timeline`);
  lines.push('');
  for (const it of items) {
    if (!opts.includeToolOutputs && it.type === 'tool_result') continue;
    const ts = it.timestamp ? ` _(${it.timestamp})_` : '';
    if (it.type === 'user') {
      lines.push(`### User${ts}`);
      lines.push('');
      lines.push(apply(it.content));
    } else if (it.type === 'assistant') {
      lines.push(`### Assistant${ts}`);
      lines.push('');
      lines.push(apply(it.content));
    } else if (it.type === 'reasoning') {
      lines.push(`### Reasoning${ts}`);
      lines.push('');
      lines.push('```');
      lines.push(apply(it.content));
      lines.push('```');
    } else if (it.type === 'tool_call') {
      lines.push(`### Tool call: ${it.toolName ?? 'tool'}${ts}`);
      lines.push('');
      lines.push('```');
      lines.push(apply(it.content));
      lines.push('```');
    } else if (it.type === 'tool_result') {
      lines.push(`### Tool result${ts}`);
      lines.push('');
      lines.push('```');
      lines.push(apply(it.content));
      lines.push('```');
    } else if (it.type === 'metadata') {
      lines.push(`> ${apply(it.content)}${ts}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
