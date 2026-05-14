<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ provider: 'claude' | 'codex'; size?: 'sm' | 'md' }>();

const cls = computed(() => {
  const base =
    props.provider === 'claude'
      ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30'
      : 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30';
  const size = props.size === 'md' ? 'h-8 w-8 text-[11px]' : 'h-6 w-6 text-[10px]';
  return `${base} ${size}`;
});

const label = computed(() => (props.provider === 'claude' ? 'CL' : 'CX'));
</script>

<template>
  <div
    class="inline-flex items-center justify-center rounded-md font-bold tracking-tight"
    :class="cls"
    :title="provider"
  >
    {{ label }}
  </div>
</template>
