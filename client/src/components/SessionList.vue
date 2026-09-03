<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { SessionListItem, SessionColor } from '@shared/types';
import { api } from '../api';
import ProviderAvatar from './ProviderAvatar.vue';
import { highlightSnippet } from '../lib/highlight';
import SessionIdChip from './SessionIdChip.vue';
import CopyButton from './CopyButton.vue';
import ContextBar from './ContextBar.vue';
import SessionLabelEditor from './SessionLabelEditor.vue';
import { tintClass, barClass } from '../lib/sessionColor';

const props = defineProps<{ sessions: SessionListItem[]; loading?: boolean }>();
const router = useRouter();

const rows = computed(() => props.sessions);

function open(s: SessionListItem) {
  router.push({ name: 'session-detail', params: { provider: s.provider, sessionId: s.sessionId } });
}

// Custom-name overlay: show the user's name as the primary line; keep the
// original title/first-prompt as a muted subtitle so context isn't lost.
function displayTitle(s: SessionListItem): string {
  return s.displayName?.trim() || preview(s);
}

// Inline name/color editor, teleported & fixed-positioned (the list wrapper
// clips overflow, so an in-row popover wouldn't show).
const editing = ref<SessionListItem | null>(null);
const editorPos = ref<{ top: number; left: number }>({ top: 0, left: 0 });

function openEditor(s: SessionListItem, e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  editorPos.value = { top: rect.bottom + 4, left: Math.max(8, rect.right - 256) };
  editing.value = s;
}

function onSaved(meta: { displayName: string | null; color: SessionColor | null }) {
  if (editing.value) {
    editing.value.displayName = meta.displayName;
    editing.value.color = meta.color;
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

function preview(s: SessionListItem): string {
  const t = s.title?.trim() || s.firstUserMessage?.trim() || '(no title)';
  return t.length > 120 ? t.slice(0, 120) + '…' : t;
}

function projectName(p: string | null): string {
  if (!p) return '—';
  return p.split('/').filter(Boolean).pop() ?? p;
}

function resumeCmd(s: SessionListItem): string {
  return s.provider === 'claude'
    ? `claude --resume ${s.sessionId}`
    : `codex resume ${s.sessionId}`;
}

async function toggleBookmark(s: SessionListItem) {
  const next = !s.bookmarked;
  s.bookmarked = next;
  try {
    await api.saveMeta(s.provider, s.sessionId, { bookmarked: next });
  } catch {
    s.bookmarked = !next;
  }
}
</script>

<template>
  <div
    class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white/60 dark:bg-zinc-950/60 shadow-sm"
  >
    <table class="w-full text-sm">
      <thead class="bg-zinc-100 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800/80">
        <tr class="text-[10.5px] uppercase tracking-wider text-zinc-500">
          <th class="px-3 py-2.5 text-left font-medium w-8"></th>
          <th class="px-3 py-2.5 text-left font-medium">Title / First prompt</th>
          <th class="px-3 py-2.5 text-left font-medium">Project</th>
          <th class="px-3 py-2.5 text-left font-medium">Branch</th>
          <th class="px-3 py-2.5 text-left font-medium">Updated</th>
          <th class="px-3 py-2.5 text-right font-medium w-14">Ctx</th>
          <th class="px-3 py-2.5 text-right font-medium w-16">Msgs</th>
          <th class="px-3 py-2.5 text-right font-medium w-16">Tools</th>
          <th class="px-3 py-2.5 text-right font-medium w-10"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td colspan="9" class="px-3 py-10 text-center text-zinc-500">
            <div class="inline-flex items-center gap-2">
              <span class="h-2 w-2 rounded-full bg-zinc-600 animate-pulse" />
              Loading…
            </div>
          </td>
        </tr>
        <tr v-else-if="rows.length === 0">
          <td colspan="9" class="px-3 py-10 text-center text-zinc-500">No sessions</td>
        </tr>
        <tr
          v-for="s in rows"
          :key="`${s.provider}:${s.sessionId}`"
          class="group border-t border-zinc-100 dark:border-zinc-900/80 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 cursor-pointer transition-colors"
          :class="tintClass(s.color)"
          @click="open(s)"
        >
          <td class="px-3 py-2.5 align-top relative">
            <span
              v-if="s.color"
              class="absolute inset-y-0 left-0 w-1"
              :class="barClass(s.color)"
            />
            <ProviderAvatar :provider="s.provider" size="sm" />
          </td>
          <td class="px-3 py-2.5 max-w-[420px]">
            <div class="text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2">{{ displayTitle(s) }}</div>
            <div
              v-if="s.displayName"
              class="text-[11px] text-zinc-500 dark:text-zinc-500 truncate leading-snug"
            >{{ preview(s) }}</div>
            <div
              v-if="highlightSnippet(s.matchSnippet)"
              class="mt-1 text-[11.5px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-snug"
              v-html="highlightSnippet(s.matchSnippet)"
            ></div>
            <div class="mt-1 flex items-center gap-1.5">
              <SessionIdChip :session-id="s.sessionId" />
              <span
                v-if="s.archived"
                class="rounded bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-400"
                >archived</span
              >
              <span
                v-if="s.hasSubagents"
                class="rounded bg-violet-500/15 text-violet-300 px-1.5 py-0.5 text-[10px]"
                >subagents</span
              >
              <span
                v-if="s.hasTodos"
                class="rounded bg-sky-500/15 text-sky-300 px-1.5 py-0.5 text-[10px]"
                >todos</span
              >
            </div>
          </td>
          <td class="px-3 py-2.5 align-top text-zinc-700 dark:text-zinc-300 max-w-[180px]">
            <div class="truncate" :title="s.projectPath ?? ''">{{ projectName(s.projectPath) }}</div>
            <div v-if="s.model" class="text-[10.5px] text-zinc-500 truncate">{{ s.model }}</div>
          </td>
          <td class="px-3 py-2.5 align-top text-zinc-600 dark:text-zinc-400 max-w-[180px] truncate font-mono text-xs">
            {{ s.gitBranch ?? '—' }}
          </td>
          <td class="px-3 py-2.5 align-top text-zinc-600 dark:text-zinc-400 whitespace-nowrap text-xs">
            {{ fmtDate(s.updatedAt) }}
          </td>
          <td class="px-3 py-2.5 align-top text-right">
            <ContextBar :used="s.lastContextTokens" :window="s.contextWindow" compact />
          </td>
          <td class="px-3 py-2.5 align-top text-right text-zinc-700 dark:text-zinc-300 tabular-nums">
            {{ s.messageCount }}
          </td>
          <td class="px-3 py-2.5 align-top text-right tabular-nums">
            <span
              v-if="s.toolCallCount > 0"
              class="text-violet-300"
            >{{ s.toolCallCount }}</span>
            <span v-else class="text-zinc-600">0</span>
          </td>
          <td class="px-3 py-2.5 align-top text-right">
            <div class="inline-flex items-center gap-1" @click.stop>
              <button
                type="button"
                :title="s.bookmarked ? 'Remove bookmark' : 'Bookmark this session'"
                class="p-1 rounded transition-opacity"
                :class="s.bookmarked
                  ? 'text-amber-400 hover:text-amber-500'
                  : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 opacity-0 group-hover:opacity-100'"
                @click.stop="toggleBookmark(s)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" :fill="s.bookmarked ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
              <button
                type="button"
                title="Rename / set color"
                class="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
                @click.stop="openEditor(s, $event)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
              <span class="opacity-0 group-hover:opacity-100 transition-opacity">
                <CopyButton :value="resumeCmd(s)" label="resume command" />
              </span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <Teleport to="body">
      <div
        v-if="editing"
        class="fixed inset-0 z-50"
        @click="editing = null"
      >
        <div
          class="absolute"
          :style="{ top: editorPos.top + 'px', left: editorPos.left + 'px' }"
          @click.stop
        >
          <SessionLabelEditor
            :provider="editing.provider"
            :session-id="editing.sessionId"
            :display-name="editing.displayName"
            :color="editing.color"
            @saved="onSaved"
            @close="editing = null"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>
