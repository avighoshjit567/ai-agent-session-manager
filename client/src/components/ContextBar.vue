<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  used: number | null;
  window: number | null;
  compact?: boolean;
}>();

const pct = computed(() => {
  if (!props.used || !props.window || props.window <= 0) return null;
  return Math.min(100, (props.used / props.window) * 100);
});

const tier = computed(() => {
  const p = pct.value;
  if (p === null) return 'unknown';
  if (p >= 90) return 'critical';
  if (p >= 75) return 'warning';
  if (p >= 50) return 'moderate';
  return 'low';
});

const barCls = computed(() => {
  switch (tier.value) {
    case 'critical': return 'bg-rose-500';
    case 'warning': return 'bg-amber-500';
    case 'moderate': return 'bg-sky-500';
    case 'low': return 'bg-emerald-500';
    default: return 'bg-zinc-700';
  }
});

const textCls = computed(() => {
  switch (tier.value) {
    case 'critical': return 'text-rose-300';
    case 'warning': return 'text-amber-300';
    case 'moderate': return 'text-sky-300';
    case 'low': return 'text-emerald-300';
    default: return 'text-zinc-500';
  }
});

const recommendation = computed(() => {
  switch (tier.value) {
    case 'critical': return 'Compact now — context is almost full';
    case 'warning': return 'Consider /compact before next big task';
    case 'moderate': return 'Plenty of headroom';
    case 'low': return 'Plenty of headroom';
    default: return null;
  }
});

function fmt(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
</script>

<template>
  <!-- Compact pill for lists -->
  <span
    v-if="compact"
    class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
    :class="[
      tier === 'critical' ? 'bg-rose-500/15 text-rose-300' :
      tier === 'warning' ? 'bg-amber-500/15 text-amber-300' :
      tier === 'moderate' ? 'bg-sky-500/15 text-sky-300' :
      tier === 'low' ? 'bg-emerald-500/15 text-emerald-300' :
      'bg-zinc-800 text-zinc-500'
    ]"
    :title="used && window ? `${fmt(used)} / ${fmt(window)} context tokens` : 'No context info'"
  >
    <span v-if="pct !== null">{{ pct.toFixed(0) }}%</span>
    <span v-else>—</span>
  </span>

  <!-- Full bar for detail page -->
  <div v-else class="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
    <div class="flex items-baseline justify-between mb-2">
      <div class="flex items-baseline gap-1.5">
        <span class="text-[11px] uppercase tracking-wider text-zinc-500">Context window</span>
        <span v-if="pct !== null" class="text-base font-semibold tabular-nums" :class="textCls">{{ pct.toFixed(1) }}%</span>
        <span v-else class="text-sm text-zinc-500">unknown</span>
      </div>
      <div class="text-[11px] text-zinc-400 tabular-nums">
        <span class="text-zinc-200">{{ fmt(used) }}</span> / {{ fmt(window) }}
      </div>
    </div>

    <div class="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
      <div
        v-if="pct !== null"
        class="h-full rounded-full transition-all"
        :class="barCls"
        :style="{ width: `${pct}%` }"
      />
    </div>

    <div v-if="recommendation" class="mt-2 text-[11px]" :class="textCls">
      {{ tier === 'critical' || tier === 'warning' ? '⚠ ' : '✓ ' }}{{ recommendation }}
    </div>
  </div>
</template>
