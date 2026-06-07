<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import type { TimelineItem } from '@shared/types';

const props = defineProps<{ items: TimelineItem[]; variant: 'user' | 'assistant' }>();

// Bubbles taller than this collapse behind a "Show more" toggle. Short messages
// stay fully expanded (the toggle only appears when content actually overflows).
const COLLAPSED_MAX_PX = 260;

const expanded = ref(false);
const overflowing = ref(false);
const bodyEl = ref<HTMLElement | null>(null);

async function measure(): Promise<void> {
  await nextTick();
  const el = bodyEl.value;
  if (!el) return;
  overflowing.value = el.scrollHeight > COLLAPSED_MAX_PX + 16;
}

onMounted(measure);
watch(
  () => props.items,
  () => {
    expanded.value = false;
    measure();
  },
);
</script>

<template>
  <div>
    <div class="relative">
      <div
        ref="bodyEl"
        class="space-y-3 overflow-hidden"
        :style="!expanded && overflowing ? { maxHeight: COLLAPSED_MAX_PX + 'px' } : undefined"
      >
        <div
          v-for="it in items"
          :key="it.id"
          class="whitespace-pre-wrap break-words text-zinc-900 dark:text-zinc-100 text-[13.5px] leading-relaxed"
        >{{ it.content }}</div>
      </div>
      <div
        v-if="!expanded && overflowing"
        class="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t to-transparent"
        :class="variant === 'user' ? 'from-sky-50 dark:from-zinc-950' : 'from-zinc-50 dark:from-zinc-900'"
      />
    </div>
    <button
      v-if="overflowing"
      type="button"
      class="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:underline"
      @click="expanded = !expanded"
    >
      {{ expanded ? 'Show less' : 'Show more' }}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-3 w-3 transition-transform"
        :class="expanded ? 'rotate-180' : ''"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  </div>
</template>
