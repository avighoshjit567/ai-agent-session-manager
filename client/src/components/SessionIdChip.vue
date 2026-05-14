<script setup lang="ts">
import { computed } from 'vue';
import CopyButton from './CopyButton.vue';

const props = defineProps<{ sessionId: string; truncate?: boolean }>();
const short = computed(() => props.sessionId.slice(0, 8));
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10.5px] font-mono text-zinc-300"
  >
    <span :title="sessionId">{{ truncate === false ? sessionId : short }}</span>
    <CopyButton :value="sessionId" label="session ID" small />
  </span>
</template>
