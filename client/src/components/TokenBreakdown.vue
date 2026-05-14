<script setup lang="ts">
import { computed } from 'vue';
import type { Session } from '@shared/types';

const props = defineProps<{ session: Session }>();

function fmt(n: number | null): string {
  if (n === null || n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const rows = computed(() => {
  const s = props.session;
  const r: Array<{ label: string; value: string; hint?: string }> = [];

  if (s.inputTokens !== null) {
    r.push({ label: 'Input', value: fmt(s.inputTokens), hint: 'Non-cached input tokens billed' });
  }
  if (s.outputTokens !== null) {
    r.push({ label: 'Output', value: fmt(s.outputTokens), hint: 'Tokens the model wrote' });
  }
  if (s.cacheCreationTokens !== null) {
    r.push({ label: 'Cache write', value: fmt(s.cacheCreationTokens), hint: 'Tokens stored to prompt cache (one-time premium)' });
  }
  if (s.cacheReadTokens !== null) {
    r.push({ label: 'Cache read', value: fmt(s.cacheReadTokens), hint: 'Tokens served from cache (10x cheaper)' });
  }
  // Codex case: only cumulative total available
  if (
    s.inputTokens === null &&
    s.outputTokens === null &&
    s.tokensUsed !== null
  ) {
    r.push({ label: 'Total used', value: fmt(s.tokensUsed), hint: 'Cumulative tokens billed for this session' });
  }
  return r;
});

const grossTotal = computed(() => {
  const s = props.session;
  if (s.inputTokens !== null || s.outputTokens !== null || s.cacheReadTokens !== null) {
    return (s.inputTokens ?? 0) + (s.outputTokens ?? 0) + (s.cacheReadTokens ?? 0) + (s.cacheCreationTokens ?? 0);
  }
  return s.tokensUsed ?? null;
});
</script>

<template>
  <div v-if="rows.length" class="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
    <div class="flex items-baseline justify-between mb-2">
      <span class="text-[11px] uppercase tracking-wider text-zinc-500">Tokens</span>
      <span v-if="grossTotal" class="text-base font-semibold text-zinc-100 tabular-nums">{{ fmt(grossTotal) }}</span>
    </div>
    <div class="space-y-1">
      <div
        v-for="r in rows"
        :key="r.label"
        class="flex items-center justify-between text-[11.5px]"
        :title="r.hint"
      >
        <span class="text-zinc-500">{{ r.label }}</span>
        <span class="text-zinc-200 tabular-nums">{{ r.value }}</span>
      </div>
    </div>
  </div>
</template>
