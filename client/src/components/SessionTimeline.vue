<script setup lang="ts">
import { computed } from 'vue';
import type { TimelineItem } from '@shared/types';
import CopyButton from './CopyButton.vue';
import { visibleTimelineItems } from '../lib/timeline';

const props = defineProps<{ items: TimelineItem[] }>();

const visible = computed(() => visibleTimelineItems(props.items));

function fmtTs(ts: string | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString();
}
</script>

<template>
  <div class="space-y-3">
    <template v-for="it in visible" :key="it.id">
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
