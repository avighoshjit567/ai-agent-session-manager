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
import { exportSessionMarkdown } from '../export.js';
import { maskSecrets } from '../privacy.js';
import type { Provider, SessionFilter } from '../../../shared/types.js';

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
}
