<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../api';
import type { Session, TimelineItem, Note, Provider } from '@shared/types';
import ProviderAvatar from '../components/ProviderAvatar.vue';
import SessionTimeline from '../components/SessionTimeline.vue';
import ResumeCommand from '../components/ResumeCommand.vue';
import CopyButton from '../components/CopyButton.vue';
import ContextBar from '../components/ContextBar.vue';
import TokenBreakdown from '../components/TokenBreakdown.vue';
import { useToast } from '../composables/useToast';

const props = defineProps<{ provider: string; sessionId: string }>();
const toast = useToast();

const session = ref<Session | null>(null);
const timeline = ref<TimelineItem[]>([]);
const note = ref<Note | null>(null);
const loading = ref(true);
const showToolResults = ref(false);
const mask = ref(true);
const exporting = ref(false);
const exportPath = ref<string | null>(null);

async function load() {
  loading.value = true;
  exportPath.value = null;
  try {
    const [s, t, n] = await Promise.all([
      api.session(props.provider as Provider, props.sessionId),
      api.timeline(props.provider as Provider, props.sessionId, mask.value),
      api.getNote(props.provider as Provider, props.sessionId),
    ]);
    session.value = s;
    timeline.value = t.items;
    note.value = n;
  } finally {
    loading.value = false;
  }
}

async function reloadTimeline() {
  const t = await api.timeline(props.provider as Provider, props.sessionId, mask.value);
  timeline.value = t.items;
}

async function saveNote() {
  if (!note.value) return;
  const n = await api.saveNote(props.provider as Provider, props.sessionId, note.value);
  note.value = n;
  toast.success('Notes saved');
}

async function doExport() {
  exporting.value = true;
  try {
    const r = await api.exportSession(props.provider as Provider, props.sessionId, {
      includeToolOutputs: showToolResults.value,
      maskSecrets: mask.value,
    });
    exportPath.value = r.path;
    toast.success('Exported to ~/Documents/ai-session-exports/');
  } catch (e: any) {
    toast.error(`Export failed: ${e?.message ?? e}`);
  } finally {
    exporting.value = false;
  }
}

const tagsString = computed({
  get: () => (note.value?.tags ?? []).join(', '),
  set: (v: string) => {
    if (note.value) note.value.tags = v.split(',').map((s) => s.trim()).filter(Boolean);
  },
});

watch(() => [props.provider, props.sessionId], load, { immediate: false });
watch(mask, reloadTimeline);
onMounted(load);

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

const stats = computed(() => {
  if (!session.value) return null;
  return [
    { label: 'Messages', value: session.value.messageCount },
    { label: 'Tool calls', value: session.value.toolCallCount },
  ];
});
</script>

<template>
  <div class="min-h-full">
    <div v-if="loading" class="p-8 text-zinc-500">Loading…</div>

    <template v-else-if="session">
      <!-- Sticky header -->
      <header
        class="sticky top-0 z-10 border-b border-zinc-200 dark:border-zinc-800/80 bg-white/95 dark:bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:supports-[backdrop-filter]:bg-zinc-950/80"
      >
        <div class="max-w-7xl mx-auto px-6 py-4">
          <div class="flex items-start gap-3">
            <RouterLink
              :to="{ name: 'sessions' }"
              class="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mt-1"
              >←</RouterLink
            >
            <ProviderAvatar :provider="session.provider" size="md" />
            <div class="flex-1 min-w-0">
              <h1
                class="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2"
              >
                {{
                  session.title ||
                  session.firstUserMessage?.slice(0, 140) ||
                  '(no title)'
                }}
              </h1>
              <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                <span v-if="session.projectPath" class="truncate max-w-[260px]" :title="session.projectPath">
                  📁 {{ session.projectPath }}
                </span>
                <span v-if="session.gitBranch" class="font-mono">⎇ {{ session.gitBranch }}</span>
                <span v-if="session.model">⚙ {{ session.model }}</span>
                <span>·</span>
                <span>{{ fmtDate(session.updatedAt) }}</span>
              </div>
            </div>
          </div>

          <!-- Resume command row -->
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <span class="text-[11px] text-zinc-500 uppercase tracking-wider">Resume</span>
            <ResumeCommand :provider="session.provider" :session-id="session.sessionId" />
            <span class="text-zinc-700">·</span>
            <span class="inline-flex items-center gap-1 text-[11px] text-zinc-500">
              ID
              <code class="font-mono text-zinc-600 dark:text-zinc-400">{{ session.sessionId }}</code>
              <CopyButton :value="session.sessionId" label="session ID" small />
            </span>
          </div>
        </div>
      </header>

      <div class="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div>
          <div class="flex items-center gap-4 mb-4 text-xs">
            <label class="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 cursor-pointer">
              <input type="checkbox" v-model="showToolResults" class="accent-zinc-500" />
              Show tool results
            </label>
            <label class="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 cursor-pointer">
              <input type="checkbox" v-model="mask" class="accent-zinc-500" />
              Mask secrets
            </label>
            <div class="ml-auto flex items-center gap-2">
              <span v-if="exportPath" class="text-[11px] text-emerald-400 font-mono truncate max-w-[240px]" :title="exportPath">
                {{ exportPath }}
              </span>
              <button
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors disabled:opacity-50"
                :disabled="exporting"
                @click="doExport"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" x2="12" y1="15" y2="3"/>
                </svg>
                {{ exporting ? 'Exporting…' : 'Export Markdown' }}
              </button>
            </div>
          </div>

          <SessionTimeline :items="timeline" :show-tool-results="showToolResults" />
        </div>

        <aside class="space-y-4">
          <ContextBar
            v-if="session.lastContextTokens !== null || session.contextWindow"
            :used="session.lastContextTokens"
            :window="session.contextWindow"
          />

          <TokenBreakdown :session="session" />

          <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 p-3">
            <div class="grid grid-cols-2 gap-2">
              <div v-for="s in stats" :key="s.label" class="text-center py-2 rounded-md bg-zinc-50 dark:bg-zinc-900/40">
                <div class="text-base font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{{ s.value }}</div>
                <div class="text-[10px] uppercase tracking-wider text-zinc-500 mt-0.5">{{ s.label }}</div>
              </div>
            </div>
            <div class="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-1 text-[11px]">
              <div class="flex justify-between"><span class="text-zinc-500">Started</span><span class="text-zinc-700 dark:text-zinc-300">{{ fmtDate(session.createdAt) }}</span></div>
              <div class="flex justify-between"><span class="text-zinc-500">Updated</span><span class="text-zinc-700 dark:text-zinc-300">{{ fmtDate(session.updatedAt) }}</span></div>
              <div class="text-zinc-600 truncate font-mono pt-1" :title="session.sourcePath">{{ session.sourcePath }}</div>
            </div>
          </div>

          <div v-if="note" class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 p-3 space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">Private notes</h3>
              <button
                class="text-[11px] px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                @click="saveNote"
              >Save</button>
            </div>
            <select
              v-model="note.status"
              class="w-full px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs"
            >
              <option value="none">No status</option>
              <option value="important">⭐ Important</option>
              <option value="follow-up">↻ Follow-up</option>
              <option value="archived">✕ Archived</option>
              <option value="lesson">📘 Lesson</option>
            </select>
            <input
              v-model="tagsString"
              placeholder="tags, comma, separated"
              class="w-full px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs"
            />
            <textarea
              v-model="note.summary"
              placeholder="Summary"
              rows="3"
              class="w-full px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs"
            />
            <textarea
              v-model="note.followUps"
              placeholder="Follow-ups"
              rows="2"
              class="w-full px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs"
            />
            <textarea
              v-model="note.lessons"
              placeholder="Lessons learned"
              rows="2"
              class="w-full px-2 py-1 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-xs"
            />
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>
