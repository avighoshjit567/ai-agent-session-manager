<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ provider: 'claude' | 'codex' }>();

const cls = computed(() =>
  props.provider === 'claude'
    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
    : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
);
</script>

<template>
  <span
    class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border"
    :class="cls"
  >
    {{ provider }}
  </span>
</template>
