<script setup lang="ts">
import type { TimelineItem } from '@shared/types';
import CopyButton from './CopyButton.vue';

defineProps<{ items: TimelineItem[]; showToolResults?: boolean }>();

function fmtTs(ts: string | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString();
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}
</script>

<template>
  <div class="space-y-3">
    <template v-for="it in items" :key="it.id">
      <!-- User -->
      <div
        v-if="it.type === 'user'"
        class="rounded-lg border border-sky-500/30 bg-sky-500/[0.06] p-3.5"
      >
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-1.5 text-[11px] font-medium text-sky-300 uppercase tracking-wider">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
            You
          </div>
          <div class="flex items-center gap-1.5 text-[10.5px] text-zinc-500">
            <span>{{ fmtTs(it.timestamp) }}</span>
            <CopyButton :value="it.content ?? ''" label="message" small />
          </div>
        </div>
        <div class="whitespace-pre-wrap break-words text-zinc-900 dark:text-zinc-100 text-[13.5px] leading-relaxed">{{ it.content }}</div>
      </div>

      <!-- Assistant -->
      <div
        v-else-if="it.type === 'assistant'"
        class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-3.5"
      >
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-zinc-500" />
            Assistant
          </div>
          <div class="flex items-center gap-1.5 text-[10.5px] text-zinc-500">
            <span>{{ fmtTs(it.timestamp) }}</span>
            <CopyButton :value="it.content ?? ''" label="message" small />
          </div>
        </div>
        <div class="whitespace-pre-wrap break-words text-zinc-900 dark:text-zinc-100 text-[13.5px] leading-relaxed">{{ it.content }}</div>
      </div>

      <!-- Reasoning (collapsed by default) -->
      <details
        v-else-if="it.type === 'reasoning'"
        class="rounded-lg border border-zinc-200 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-900/20 px-3 py-2 text-xs"
      >
        <summary class="cursor-pointer text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 select-none flex items-center gap-2">
          <span class="text-[10px] uppercase tracking-wider">Reasoning</span>
          <span class="text-zinc-600">·</span>
          <span>{{ fmtTs(it.timestamp) }}</span>
        </summary>
        <pre class="mt-2 whitespace-pre-wrap break-words text-zinc-600 dark:text-zinc-400 text-xs leading-relaxed">{{ it.content }}</pre>
      </details>

      <!-- Tool call -->
      <div
        v-else-if="it.type === 'tool_call'"
        class="rounded-lg border border-violet-500/25 bg-violet-500/[0.05] px-3 py-2"
      >
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-1.5 text-[11px] text-violet-300">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span class="font-mono font-medium">{{ it.toolName ?? 'tool' }}</span>
          </div>
          <span class="text-[10.5px] text-zinc-500">{{ fmtTs(it.timestamp) }}</span>
        </div>
        <pre class="text-[11.5px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-words max-h-44 overflow-y-auto font-mono">{{ truncate(it.content, 4000) }}</pre>
      </div>

      <!-- Tool result -->
      <details
        v-else-if="it.type === 'tool_result' && showToolResults"
        class="rounded-lg border border-zinc-200 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-900/20 px-3 py-2"
      >
        <summary class="cursor-pointer text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 select-none flex items-center justify-between text-xs">
          <span class="flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            tool result
          </span>
          <span class="text-[10.5px]">{{ fmtTs(it.timestamp) }}</span>
        </summary>
        <pre class="mt-2 text-[11.5px] text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words max-h-60 overflow-y-auto font-mono">{{ truncate(it.content, 4000) }}</pre>
      </details>

      <!-- Metadata divider -->
      <div
        v-else-if="it.type === 'metadata'"
        class="flex items-center gap-2 py-1 text-[10.5px] text-zinc-600 italic"
      >
        <span class="h-px flex-1 bg-zinc-200 dark:bg-zinc-800/60" />
        <span>{{ it.content }}<span v-if="it.timestamp" class="text-zinc-700"> · {{ fmtTs(it.timestamp) }}</span></span>
        <span class="h-px flex-1 bg-zinc-200 dark:bg-zinc-800/60" />
      </div>
    </template>

    <div v-if="items.length === 0" class="text-zinc-500 text-sm py-10 text-center">
      No timeline data
    </div>
  </div>
</template>
