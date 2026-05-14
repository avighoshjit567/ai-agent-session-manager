import chokidar, { type FSWatcher } from 'chokidar';
import { PATHS, findCodexStateDb } from './paths.js';
import { runFullIndex, isIndexing } from './indexer.js';

let watchers: FSWatcher[] = [];
let pending = false;
let debounceTimer: NodeJS.Timeout | null = null;

export function startWatchers(): void {
  stopWatchers();
  const paths: string[] = [];
  paths.push(PATHS.claudeProjects);
  paths.push(PATHS.codexSessions);
  const codexDb = findCodexStateDb();
  if (codexDb) paths.push(codexDb);

  const w = chokidar.watch(paths, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    ignored: (p: string) => {
      return (
        p.endsWith('-shm') ||
        p.endsWith('-wal') ||
        p.includes('/tool-results/') ||
        p.endsWith('.tmp')
      );
    },
  });
  w.on('add', schedule);
  w.on('change', schedule);
  w.on('unlink', schedule);
  watchers.push(w);
}

export function stopWatchers(): void {
  for (const w of watchers) {
    void w.close();
  }
  watchers = [];
}

function schedule(): void {
  pending = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runIfIdle();
  }, 1500);
}

function runIfIdle(): void {
  if (!pending) return;
  if (isIndexing()) {
    // try again shortly
    setTimeout(runIfIdle, 1000);
    return;
  }
  pending = false;
  runFullIndex().catch((e) => {
    console.error('Watcher reindex failed:', e?.message ?? e);
  });
}
