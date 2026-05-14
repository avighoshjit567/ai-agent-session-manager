<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';

const status = ref<any>(null);
const loading = ref(false);
const lastRun = ref<{ claudeSessions: number; codexSessions: number; errors: string[] } | null>(null);

async function refresh() {
  status.value = await api.indexStatus();
}

async function rebuild() {
  loading.value = true;
  try {
    lastRun.value = await api.reindex(true) as any;
  } finally {
    loading.value = false;
    refresh();
  }
}

onMounted(refresh);
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto">
    <h1 class="text-xl font-semibold text-zinc-100 mb-4">Settings</h1>

    <section class="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 mb-6">
      <h2 class="font-medium text-zinc-200 mb-2">Index</h2>
      <p class="text-sm text-zinc-400 mb-3">
        The index is a local SQLite cache derived from <code>~/.claude</code> and <code>~/.codex</code>.
        Your original files are never modified.
      </p>
      <button
        class="px-3 py-1.5 rounded border border-zinc-700 hover:bg-zinc-800 text-sm disabled:opacity-50"
        :disabled="loading"
        @click="rebuild"
      >
        {{ loading ? 'Rebuilding…' : 'Force full rebuild' }}
      </button>
      <div v-if="status" class="text-xs text-zinc-500 mt-3">
        Running: {{ status.running ? 'yes' : 'no' }}<br />
        <template v-if="status.last">
          Last run finished {{ status.last.finishedAt }} — claude {{ status.last.claudeSessions }},
          codex {{ status.last.codexSessions }}, errors {{ status.last.errors?.length ?? 0 }}
        </template>
      </div>
      <div v-if="lastRun?.errors?.length" class="mt-3 text-xs text-rose-400">
        <div>Recent errors:</div>
        <ul class="list-disc list-inside">
          <li v-for="(e, i) in lastRun.errors.slice(0, 10)" :key="i">{{ e }}</li>
        </ul>
      </div>
    </section>

    <section class="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 mb-6">
      <h2 class="font-medium text-zinc-200 mb-2">Privacy</h2>
      <ul class="text-sm text-zinc-400 space-y-1.5 list-disc list-inside">
        <li>Auth and config files (<code>auth.json</code>, <code>config.toml</code>, <code>settings.json</code>) are never read.</li>
        <li>Full transcript indexing is off — only titles, prompts, paths, and branches are indexed.</li>
        <li>Tool outputs are excluded from previews by default.</li>
        <li>Secret-looking patterns are masked in previews and exports (best-effort, not a guarantee).</li>
      </ul>
    </section>

    <section class="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 class="font-medium text-zinc-200 mb-2">Storage</h2>
      <ul class="text-sm text-zinc-400 space-y-1 font-mono">
        <li>Source: ~/.claude, ~/.codex</li>
        <li>Index: ~/Library/Application Support/claude-codex-session-manager/index.sqlite</li>
        <li>Notes: ~/Library/Application Support/claude-codex-session-manager/notes/</li>
        <li>Exports: ~/Documents/ai-session-exports/</li>
      </ul>
    </section>
  </div>
</template>
