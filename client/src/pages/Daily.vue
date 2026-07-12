<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../api';
import { useToast } from '../composables/useToast';
import type { DailyRecap, RecapSessionPreview, RecapHistoryItem } from '@shared/types';

const toast = useToast();

function isoLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoLocalDate(d);
}

const date = ref(yesterday());
const sessions = ref<RecapSessionPreview[]>([]);
const recap = ref<DailyRecap | null>(null);
const content = ref('');
const history = ref<RecapHistoryItem[]>([]);
const loading = ref(false);
const generating = ref(false);

const dirty = computed(() => !!recap.value && content.value !== recap.value.content);
const plainText = computed(() =>
  content.value.replace(/^#{1,6}\s*/gm, '').replace(/^\s*[-*]\s+/gm, '• '),
);

async function load() {
  loading.value = true;
  try {
    const day = await api.getRecapDay(date.value);
    sessions.value = day.sessions;
    recap.value = day.recap;
    content.value = day.recap?.content ?? '';
  } catch (e: any) {
    toast.error(e?.message ?? 'Failed to load');
  } finally {
    loading.value = false;
  }
}

async function loadHistory() {
  try {
    history.value = (await api.listRecaps()).items;
  } catch {
    /* ignore */
  }
}

async function generate() {
  generating.value = true;
  try {
    const { recap: r } = await api.generateRecap(date.value);
    recap.value = r;
    content.value = r.content;
    toast.success('Recap generated');
    loadHistory();
  } catch (e: any) {
    toast.error(e?.message ?? 'Generation failed');
  } finally {
    generating.value = false;
  }
}

async function saveEdits() {
  if (!recap.value || !dirty.value) return;
  // Never persist an emptied textarea — it would silently wipe the saved recap.
  if (!content.value.trim()) return;
  try {
    const { recap: r } = await api.saveRecap(date.value, content.value);
    recap.value = r;
    toast.success('Saved');
  } catch (e: any) {
    toast.error(e?.message ?? 'Save failed');
  }
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${label}`);
  } catch {
    toast.error('Copy failed');
  }
}

function pick(d: string) {
  date.value = d;
  load();
}

onMounted(() => {
  load();
  loadHistory();
});
</script>

<template>
  <div class="flex gap-6 p-6 max-w-6xl mx-auto w-full">
    <div class="flex-1 min-w-0 space-y-4">
      <div class="flex items-center gap-3 flex-wrap">
        <h1 class="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Daily Recap</h1>
        <input
          type="date"
          v-model="date"
          @change="load"
          class="px-2.5 py-1.5 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm text-zinc-900 dark:text-zinc-100"
        />
        <button
          class="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-sm disabled:opacity-50"
          :disabled="generating || loading || !sessions.length"
          @click="generate"
        >
          {{ generating ? 'Generating…' : recap ? 'Regenerate' : 'Generate' }}
        </button>
      </div>

      <div class="text-xs text-zinc-500">
        Sessions included ({{ sessions.length }})
      </div>
      <ul
        v-if="sessions.length"
        class="rounded border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/60"
      >
        <li
          v-for="s in sessions"
          :key="s.provider + s.sessionId"
          class="px-3 py-2 text-sm flex items-center justify-between gap-3"
        >
          <span class="truncate text-zinc-800 dark:text-zinc-200">{{ s.name }}</span>
          <span class="shrink-0 text-[11px] text-zinc-500">
            {{ s.projectPath?.split('/').filter(Boolean).pop() || '—' }}
          </span>
        </li>
      </ul>
      <div v-else class="text-sm text-zinc-500 py-6 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded">
        No sessions on {{ date }}. Pick another day.
      </div>

      <div v-if="recap || generating" class="space-y-2">
        <textarea
          v-model="content"
          @blur="saveEdits"
          rows="16"
          class="w-full px-3 py-2 rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm font-mono text-zinc-900 dark:text-zinc-100 leading-relaxed"
          placeholder="Generated recap will appear here…"
        ></textarea>
        <div class="flex items-center gap-2">
          <button
            class="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-sm"
            @click="copy(content, 'markdown')"
          >
            Copy Markdown
          </button>
          <button
            class="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-sm"
            @click="copy(plainText, 'text')"
          >
            Copy Text
          </button>
          <span v-if="dirty" class="text-[11px] text-amber-500">unsaved — blur to save</span>
        </div>
      </div>
    </div>

    <aside class="w-56 shrink-0 space-y-2">
      <div class="text-xs text-zinc-500">History</div>
      <ul class="space-y-0.5">
        <li v-for="h in history" :key="h.date">
          <button
            class="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
            :class="h.date === date ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'"
            @click="pick(h.date)"
          >
            {{ h.date }}
            <span v-if="h.editedAt" class="text-[10px] text-zinc-400">· edited</span>
          </button>
        </li>
        <li v-if="!history.length" class="text-[11px] text-zinc-400 px-2 py-1">No recaps yet.</li>
      </ul>
    </aside>
  </div>
</template>
