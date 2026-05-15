<script setup lang="ts">
import { useToast } from '../composables/useToast';

const { state } = useToast();
</script>

<template>
  <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
    <transition-group name="toast">
      <div
        v-for="t in state.items"
        :key="t.id"
        class="pointer-events-auto rounded-lg border px-3 py-2 text-sm shadow-lg backdrop-blur-sm min-w-[200px]"
        :class="{
          'border-zinc-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-zinc-900 dark:text-zinc-100': t.kind === 'info',
          'border-emerald-500/40 bg-emerald-500/10 text-emerald-200': t.kind === 'success',
          'border-rose-500/40 bg-rose-500/10 text-rose-200': t.kind === 'error',
        }"
      >
        <div class="flex items-center gap-2">
          <span v-if="t.kind === 'success'" class="text-emerald-400">✓</span>
          <span v-else-if="t.kind === 'error'" class="text-rose-400">✕</span>
          <span v-else class="text-zinc-600 dark:text-zinc-400">›</span>
          <span>{{ t.message }}</span>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
