<script setup lang="ts">
import { computed } from 'vue';
import type { Provider } from '@shared/types';
import CopyButton from './CopyButton.vue';

const props = defineProps<{
  provider: Provider;
  sessionId: string;
  compact?: boolean;
}>();

const command = computed(() =>
  props.provider === 'claude'
    ? `claude --resume ${props.sessionId}`
    : `codex resume ${props.sessionId}`,
);
</script>

<template>
  <div
    class="group inline-flex items-center gap-2 rounded-md border bg-zinc-900/70 font-mono text-xs"
    :class="[
      compact ? 'px-2 py-1' : 'px-2.5 py-1.5',
      provider === 'claude'
        ? 'border-amber-500/30 hover:border-amber-400/60'
        : 'border-emerald-500/30 hover:border-emerald-400/60',
    ]"
  >
    <span class="text-zinc-500 select-none">$</span>
    <span class="text-zinc-100 truncate max-w-[28rem]" :title="command">{{ command }}</span>
    <CopyButton :value="command" :label="`resume command`" small />
  </div>
</template>
