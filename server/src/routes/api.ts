import type { FastifyInstance } from 'fastify';
import {
  dashboardStats,
  getSession,
  listProjects,
  listSessions,
} from '../search.js';
import { runFullIndex, getIndexStats, isIndexing } from '../indexer.js';
import { buildClaudeTimeline, listClaudeSessionFiles } from '../adapters/claude.js';
import { buildCodexTimeline } from '../adapters/codex.js';
import { getNote, saveNote } from '../notes.js';
import { saveMeta } from '../meta.js';
import { exportSessionMarkdown } from '../export.js';
import { maskSecrets } from '../privacy.js';
import fs from 'node:fs';
import { getSettings, saveSettings } from '../settings.js';
import {
  openInEditor,
  openInTerminal,
  buildResumeCommand,
  buildClaudeForkCommand,
  buildCodexSeedCommand,
} from '../launch.js';
import {
  getRecap,
  previewForDate,
  generateRecap,
  saveEditedRecap,
  listRecaps,
  isValidDateString,
  NoSessionsError,
} from '../recap.js';
import type { Provider, SessionFilter, AppSettings } from '../../../shared/types.js';

export async function registerApi(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/dashboard', async () => dashboardStats());

  app.get('/api/projects', async () => listProjects());

  app.get<{ Querystring: SessionFilter & { [k: string]: string } }>(
    '/api/sessions',
    async (req) => {
      const q = req.query as any;
      const filter: SessionFilter = {
        provider: (q.provider as any) || 'all',
        projectPath: q.projectPath || undefined,
        branch: q.branch || undefined,
        archived:
          q.archived === '1' || q.archived === 'true'
            ? true
            : q.archived === '0' || q.archived === 'false'
            ? false
            : undefined,
        hasTools: q.hasTools === '1' || q.hasTools === 'true',
        hasSubagents: q.hasSubagents === '1' || q.hasSubagents === 'true',
        q: q.q || undefined,
        from: q.from || undefined,
        to: q.to || undefined,
        limit: q.limit ? Math.min(parseInt(q.limit, 10), 200) : 50,
        offset: q.offset ? parseInt(q.offset, 10) : 0,
      };
      return listSessions(filter);
    },
  );

  app.get<{ Params: { provider: Provider; sessionId: string } }>(
    '/api/sessions/:provider/:sessionId',
    async (req, reply) => {
      const { provider, sessionId } = req.params;
      const s = getSession(provider, sessionId);
      if (!s) {
        reply.code(404);
        return { error: 'not found' };
      }
      return s;
    },
  );

  app.get<{
    Params: { provider: Provider; sessionId: string };
    Querystring: { mask?: string };
  }>('/api/sessions/:provider/:sessionId/timeline', async (req, reply) => {
    const { provider, sessionId } = req.params;
    const mask = req.query.mask !== '0' && req.query.mask !== 'false';
    const s = getSession(provider, sessionId);
    if (!s) {
      reply.code(404);
      return { error: 'not found' };
    }
    let items;
    if (provider === 'claude') {
      const files = listClaudeSessionFiles();
      const file = files.find((f) => f.sessionId === sessionId);
      if (!file) {
        reply.code(404);
        return { error: 'source file not found' };
      }
      items = await buildClaudeTimeline(file);
    } else {
      items = await buildCodexTimeline(s);
    }
    if (mask) {
      items = items.map((it) => ({ ...it, content: it.content ? maskSecrets(it.content) : it.content }));
    }
    return { items };
  });

  app.get<{ Params: { provider: Provider; sessionId: string } }>(
    '/api/notes/:provider/:sessionId',
    async (req) => getNote(req.params.provider, req.params.sessionId),
  );

  app.put<{
    Params: { provider: Provider; sessionId: string };
    Body: {
      status?: string;
      tags?: string[];
      summary?: string;
      followUps?: string;
      lessons?: string;
    };
  }>('/api/notes/:provider/:sessionId', async (req) => {
    const { provider, sessionId } = req.params;
    const body = req.body ?? {};
    return saveNote({
      provider,
      sessionId,
      status: (body.status as any) ?? 'none',
      tags: Array.isArray(body.tags) ? body.tags : [],
      summary: body.summary ?? '',
      followUps: body.followUps ?? '',
      lessons: body.lessons ?? '',
      updatedAt: new Date().toISOString(),
    });
  });

  app.put<{
    Params: { provider: Provider; sessionId: string };
    Body: { displayName?: string | null; color?: string | null };
  }>('/api/sessions/:provider/:sessionId/meta', async (req, reply) => {
    const { provider, sessionId } = req.params;
    if (!getSession(provider, sessionId)) {
      reply.code(404);
      return { error: 'Session not found' };
    }
    const body = req.body ?? {};
    return saveMeta(provider, sessionId, { displayName: body.displayName, color: body.color });
  });

  app.post<{
    Params: { provider: Provider; sessionId: string };
    Body: { includeToolOutputs?: boolean; maskSecrets?: boolean };
  }>('/api/export/:provider/:sessionId', async (req) => {
    const { provider, sessionId } = req.params;
    const body = req.body ?? {};
    const result = await exportSessionMarkdown(provider, sessionId, {
      includeToolOutputs: !!body.includeToolOutputs,
      maskSecrets: body.maskSecrets !== false,
    });
    return result;
  });

  app.post<{ Querystring: { force?: string } }>('/api/index', async (req) => {
    const force = req.query.force === '1' || req.query.force === 'true';
    if (isIndexing()) return { running: true };
    const stats = await runFullIndex({ force });
    return stats;
  });

  app.get('/api/index/status', async () => ({
    running: isIndexing(),
    last: getIndexStats(),
  }));

  app.get('/api/settings', async () => getSettings());

  app.put<{ Body: Partial<AppSettings> }>('/api/settings', async (req) =>
    saveSettings(req.body ?? {}),
  );

  app.post<{ Params: { provider: Provider; sessionId: string } }>(
    '/api/sessions/:provider/:sessionId/open-editor',
    async (req, reply) => {
      const { provider, sessionId } = req.params;
      const s = getSession(provider, sessionId);
      if (!s) {
        reply.code(404);
        return { error: 'Session not found' };
      }
      if (!s.projectPath || !fs.existsSync(s.projectPath)) {
        reply.code(400);
        return { error: 'No project folder recorded for this session.' };
      }
      const editorCommand = getSettings().editorCommand;
      try {
        await openInEditor(s.projectPath, editorCommand);
        return { ok: true };
      } catch {
        reply.code(500);
        return {
          error: `Couldn't launch '${editorCommand}' — make sure it's installed and on your PATH.`,
        };
      }
    },
  );

  app.post<{ Params: { provider: Provider; sessionId: string } }>(
    '/api/sessions/:provider/:sessionId/open-terminal',
    async (req, reply) => {
      const { provider, sessionId } = req.params;
      const s = getSession(provider, sessionId);
      if (!s) {
        reply.code(404);
        return { error: 'Session not found' };
      }
      if (!s.projectPath || !fs.existsSync(s.projectPath)) {
        reply.code(400);
        return { error: 'No project folder recorded for this session.' };
      }
      try {
        const cmd = buildResumeCommand(provider, sessionId);
        const app = getSettings().terminalApp;
        await openInTerminal(s.projectPath, cmd, app);
        return app === 'Warp' ? { ok: true, message: 'Opening Warp and resuming…' } : { ok: true };
      } catch (e: any) {
        reply.code(500);
        return { error: e?.message ?? 'Failed to open terminal' };
      }
    },
  );

  app.post<{ Params: { provider: Provider; sessionId: string } }>(
    '/api/sessions/:provider/:sessionId/fork',
    async (req, reply) => {
      const { provider, sessionId } = req.params;
      const s = getSession(provider, sessionId);
      if (!s) {
        reply.code(404);
        return { error: 'Session not found' };
      }
      if (!s.projectPath || !fs.existsSync(s.projectPath)) {
        reply.code(400);
        return { error: 'No project folder recorded for this session — cannot fork it.' };
      }
      try {
        let cmd: string;
        let message: string;
        if (provider === 'claude') {
          // Native fork: new session id, full history, original untouched.
          cmd = buildClaudeForkCommand(sessionId);
          message = 'Forking session in a new terminal…';
        } else {
          // Codex has no fork — seed a new session with the exported transcript.
          const { path } = await exportSessionMarkdown(provider, sessionId, {});
          cmd = buildCodexSeedCommand(path);
          message = 'Exporting context and starting a new Codex session…';
        }
        await openInTerminal(s.projectPath, cmd, getSettings().terminalApp);
        return { ok: true, message };
      } catch (e: any) {
        reply.code(500);
        return { error: e?.message ?? 'Failed to fork session' };
      }
    },
  );

  app.get<{ Params: { date: string } }>('/api/recap/:date', async (req, reply) => {
    const { date } = req.params;
    if (!isValidDateString(date)) {
      reply.code(400);
      return { error: 'Invalid date (expected YYYY-MM-DD)' };
    }
    return { date, recap: getRecap(date), sessions: previewForDate(date) };
  });

  app.post<{ Params: { date: string } }>('/api/recap/:date/generate', async (req, reply) => {
    const { date } = req.params;
    if (!isValidDateString(date)) {
      reply.code(400);
      return { error: 'Invalid date (expected YYYY-MM-DD)' };
    }
    try {
      const recap = await generateRecap(date);
      return { recap };
    } catch (e: any) {
      if (e instanceof NoSessionsError) {
        reply.code(409);
        return { error: e.message };
      }
      reply.code(500);
      return { error: e?.message ?? 'Failed to generate recap' };
    }
  });

  app.put<{ Params: { date: string }; Body: { content?: string } }>(
    '/api/recap/:date',
    async (req, reply) => {
      const { date } = req.params;
      if (!isValidDateString(date)) {
        reply.code(400);
        return { error: 'Invalid date (expected YYYY-MM-DD)' };
      }
      const content = typeof req.body?.content === 'string' ? req.body.content : '';
      if (!content.trim()) {
        reply.code(400);
        return { error: 'Recap content cannot be empty' };
      }
      const recap = saveEditedRecap(date, content);
      if (!recap) {
        reply.code(404);
        return { error: 'No recap for that date yet' };
      }
      return { recap };
    },
  );

  app.get('/api/recaps', async () => ({ items: listRecaps() }));
}
