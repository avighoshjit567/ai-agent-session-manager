<script setup lang="ts">
import { computed } from 'vue';
import type { TimelineItem } from '@shared/types';
import CopyButton from './CopyButton.vue';
import { groupTimelineItems } from '../lib/timeline';

const props = defineProps<{ items: TimelineItem[] }>();

const groups = computed(() => groupTimelineItems(props.items));

function fmtTs(ts: string | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString();
}

function joined(items: TimelineItem[]): string {
  return items.map((i) => i.content ?? '').filter(Boolean).join('\n\n');
}
</script>

<template>
  <div class="space-y-3">
    <template v-for="g in groups" :key="g.key">
      <!-- User -->
      <div
        v-if="g.type === 'user'"
        class="rounded-lg border border-sky-500/30 bg-sky-500/[0.06] p-3.5"
      >
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-1.5 text-[11px] font-medium text-sky-300 uppercase tracking-wider">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
            You
          </div>
          <div class="flex items-center gap-1.5 text-[10.5px] text-zinc-500">
            <span>{{ fmtTs(g.items[0].timestamp) }}</span>
            <CopyButton :value="joined(g.items)" label="message" small />
          </div>
        </div>
        <div class="space-y-3">
          <div
            v-for="it in g.items"
            :key="it.id"
            class="whitespace-pre-wrap break-words text-zinc-900 dark:text-zinc-100 text-[13.5px] leading-relaxed"
          >{{ it.content }}</div>
        </div>
      </div>

      <!-- Assistant -->
      <div
        v-else-if="g.type === 'assistant'"
        class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-3.5"
      >
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-zinc-500" />
            Assistant
          </div>
          <div class="flex items-center gap-1.5 text-[10.5px] text-zinc-500">
            <span>{{ fmtTs(g.items[0].timestamp) }}</span>
            <CopyButton :value="joined(g.items)" label="message" small />
          </div>
        </div>
        <div class="space-y-3">
          <div
            v-for="it in g.items"
            :key="it.id"
            class="whitespace-pre-wrap break-words text-zinc-900 dark:text-zinc-100 text-[13.5px] leading-relaxed"
          >{{ it.content }}</div>
        </div>
      </div>

      <!-- Metadata divider -->
      <div
        v-else-if="g.type === 'metadata'"
        class="flex items-center gap-2 py-1 text-[10.5px] text-zinc-600 italic"
      >
        <span class="h-px flex-1 bg-zinc-200 dark:bg-zinc-800/60" />
        <span>{{ g.items[0].content }}<span v-if="g.items[0].timestamp" class="text-zinc-700"> · {{ fmtTs(g.items[0].timestamp) }}</span></span>
        <span class="h-px flex-1 bg-zinc-200 dark:bg-zinc-800/60" />
      </div>
    </template>

    <div v-if="items.length === 0" class="text-zinc-500 text-sm py-10 text-center">
      No timeline data
    </div>
  </div>
</template>
