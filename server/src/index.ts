import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import { registerApi } from './routes/api.js';
import { runFullIndex } from './indexer.js';
import { getDb, ftsReindexRequired, clearFtsReindexRequired } from './db.js';
import { startWatchers } from './watcher.js';
import { ensureAppDirs } from './paths.js';

const PORT = parseInt(process.env.PORT ?? '8787', 10);
const HOST = process.env.HOST ?? '127.0.0.1';

async function main(): Promise<void> {
  ensureAppDirs();

  // Sanity-check the native SQLite binary up front so a Node-version mismatch
  // surfaces as a clear startup error instead of opaque 500s later.
  try {
    const Database = (await import('better-sqlite3')).default;
    const tmp = new Database(':memory:');
    tmp.prepare('SELECT 1').get();
    tmp.close();
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    console.error(
      '\n[fatal] better-sqlite3 failed to load. This is almost always a Node ' +
        'version mismatch between install and runtime.\n' +
        `Current Node: ${process.version}\n` +
        'Fix: from the project root, run:\n' +
        '  npm rebuild better-sqlite3\n' +
        '(or switch to the Node version you originally installed with).\n\n' +
        'Original error:\n' +
        msg +
        '\n',
    );
    process.exit(1);
  }

  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    bodyLimit: 5 * 1024 * 1024,
  });

  await app.register(cors, { origin: true });
  await registerApi(app);

  // Serve built client if available
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Walk up to the workspace root regardless of dev/build layout
  const workspaceRoot = findWorkspaceRoot(__dirname);
  const clientDist = path.join(workspaceRoot, 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    await app.register(staticPlugin, { root: clientDist, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api')) {
        reply.code(404).send({ error: 'not found' });
        return;
      }
      reply.type('text/html').sendFile('index.html');
    });
  }

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`Server listening on http://${HOST}:${PORT}`);

  // Ensure schema/migrations are applied before reading the reindex flag.
  getDb();
  const force = ftsReindexRequired();
  if (force) {
    app.log.info('FTS schema migrated — running a one-time full reindex to populate search bodies.');
  }
  runFullIndex({ force })
    .then((s) => {
      clearFtsReindexRequired();
      app.log.info(
        `Initial index complete: claude=${s.claudeSessions} codex=${s.codexSessions} errors=${s.errors.length}`,
      );
    })
    .catch((e) => {
      app.log.error({ err: e }, 'Initial index failed');
    });

  startWatchers();
}

function findWorkspaceRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'client')) && fs.existsSync(path.join(dir, 'server'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
