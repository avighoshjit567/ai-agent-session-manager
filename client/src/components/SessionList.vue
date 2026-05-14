<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { Session } from '@shared/types';
import ProviderAvatar from './ProviderAvatar.vue';
import SessionIdChip from './SessionIdChip.vue';
import CopyButton from './CopyButton.vue';
import ContextBar from './ContextBar.vue';

const props = defineProps<{ sessions: Session[]; loading?: boolean }>();
const router = useRouter();

const rows = computed(() => props.sessions);

function open(s: Session) {
  router.push({ name: 'session-detail', params: { provider: s.provider, sessionId: s.sessionId } });
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

function preview(s: Session): string {
  const t = s.title?.trim() || s.firstUserMessage?.trim() || '(no title)';
  return t.length > 120 ? t.slice(0, 120) + '…' : t;
}

function projectName(p: string | null): string {
  if (!p) return '—';
  return p.split('/').filter(Boolean).pop() ?? p;
}

function resumeCmd(s: Session): string {
  return s.provider === 'claude'
    ? `claude --resume ${s.sessionId}`
    : `codex resume ${s.sessionId}`;
}
</script>

<template>
  <div
    class="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/60 shadow-sm"
  >
    <table class="w-full text-sm">
      <thead class="bg-zinc-900/60 border-b border-zinc-800/80">
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
          class="group border-t border-zinc-900/80 hover:bg-zinc-900/40 cursor-pointer transition-colors"
          @click="open(s)"
        >
          <td class="px-3 py-2.5 align-top">
            <ProviderAvatar :provider="s.provider" size="sm" />
          </td>
          <td class="px-3 py-2.5 max-w-[420px]">
            <div class="text-zinc-100 leading-snug line-clamp-2">{{ preview(s) }}</div>
            <div class="mt-1 flex items-center gap-1.5">
              <SessionIdChip :session-id="s.sessionId" />
              <span
                v-if="s.archived"
                class="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
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
          <td class="px-3 py-2.5 align-top text-zinc-300 max-w-[180px]">
            <div class="truncate" :title="s.projectPath ?? ''">{{ projectName(s.projectPath) }}</div>
            <div v-if="s.model" class="text-[10.5px] text-zinc-500 truncate">{{ s.model }}</div>
          </td>
          <td class="px-3 py-2.5 align-top text-zinc-400 max-w-[180px] truncate font-mono text-xs">
            {{ s.gitBranch ?? '—' }}
          </td>
          <td class="px-3 py-2.5 align-top text-zinc-400 whitespace-nowrap text-xs">
            {{ fmtDate(s.updatedAt) }}
          </td>
          <td class="px-3 py-2.5 align-top text-right">
            <ContextBar :used="s.lastContextTokens" :window="s.contextWindow" compact />
          </td>
          <td class="px-3 py-2.5 align-top text-right text-zinc-300 tabular-nums">
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
            <div
              class="opacity-0 group-hover:opacity-100 transition-opacity inline-flex"
              @click.stop
            >
              <CopyButton :value="resumeCmd(s)" label="resume command" />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
