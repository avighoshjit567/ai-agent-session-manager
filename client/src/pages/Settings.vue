<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { useToast } from '../composables/useToast';
import type { AppSettings } from '@shared/types';

const toast = useToast();
const settings = ref<AppSettings>({ editorCommand: 'code', terminalApp: 'Terminal' });
const savingSettings = ref(false);

async function loadSettings() {
  settings.value = await api.getSettings();
}

async function persistSettings() {
  savingSettings.value = true;
  try {
    settings.value = await api.saveSettings(settings.value);
    toast.success('Settings saved');
  } catch (e: any) {
    toast.error(e?.message ?? 'Failed to save settings');
  } finally {
    savingSettings.value = false;
  }
}

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

onMounted(() => {
  refresh();
  loadSettings();
});
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto">
    <h1 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Settings</h1>

    <section class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4 mb-6">
      <h2 class="font-medium text-zinc-800 dark:text-zinc-200 mb-2">Integrations</h2>
      <p class="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
        Used by the <strong>Terminal</strong> and <strong>Editor</strong> buttons on a session.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label class="block">
          <span class="text-xs text-zinc-500">Editor command</span>
          <input
            v-model="settings.editorCommand"
            placeholder="code"
            class="mt-1 w-full px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 text-sm font-mono"
          />
        </label>
        <label class="block">
          <span class="text-xs text-zinc-500">Terminal app</span>
          <select
            v-model="settings.terminalApp"
            class="mt-1 w-full px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 text-sm"
          >
            <option value="Terminal">Terminal</option>
            <option value="iTerm">iTerm</option>
            <option value="Warp">Warp</option>
          </select>
        </label>
      </div>
      <button
        class="mt-3 px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-sm disabled:opacity-50"
        :disabled="savingSettings"
        @click="persistSettings"
      >
        {{ savingSettings ? 'Saving…' : 'Save' }}
      </button>
    </section>

    <section class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4 mb-6">
      <h2 class="font-medium text-zinc-800 dark:text-zinc-200 mb-2">Index</h2>
      <p class="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
        The index is a local SQLite cache derived from <code>~/.claude</code> and <code>~/.codex</code>.
        Your original files are never modified.
      </p>
      <button
        class="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-sm disabled:opacity-50"
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

    <section class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4 mb-6">
      <h2 class="font-medium text-zinc-800 dark:text-zinc-200 mb-2">Privacy</h2>
      <ul class="text-sm text-zinc-600 dark:text-zinc-400 space-y-1.5 list-disc list-inside">
        <li>Auth and config files (<code>auth.json</code>, <code>config.toml</code>, <code>settings.json</code>) are never read.</li>
        <li>Full transcript indexing is off — only titles, prompts, paths, and branches are indexed.</li>
        <li>Tool outputs are excluded from previews by default.</li>
        <li>Secret-looking patterns are masked in previews and exports (best-effort, not a guarantee).</li>
      </ul>
    </section>

    <section class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4">
      <h2 class="font-medium text-zinc-800 dark:text-zinc-200 mb-2">Storage</h2>
      <ul class="text-sm text-zinc-600 dark:text-zinc-400 space-y-1 font-mono">
        <li>Source: ~/.claude, ~/.codex</li>
        <li>Index: ~/Library/Application Support/claude-codex-session-manager/index.sqlite</li>
        <li>Notes: ~/Library/Application Support/claude-codex-session-manager/notes/</li>
        <li>Exports: ~/Documents/ai-session-exports/</li>
      </ul>
    </section>
  </div>
</template>
