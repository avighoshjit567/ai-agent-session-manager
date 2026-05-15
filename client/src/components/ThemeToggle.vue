<script setup lang="ts">
import { useTheme, type ThemeMode } from '../composables/useTheme';

const { mode, setMode } = useTheme();

const options: Array<{ value: ThemeMode; label: string; icon: string }> = [
  {
    value: 'light',
    label: 'Light',
    icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.5-6.5l-.7.7M5.2 18.8l-.7.7m14 0l-.7-.7M5.2 5.2l-.7-.7M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  },
  {
    value: 'system',
    label: 'System',
    icon: 'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5zM8 21h8m-4-6v6',
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  },
];
</script>

<template>
  <div
    class="grid grid-cols-3 gap-0.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 p-0.5"
    role="group"
    aria-label="Theme"
  >
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      :aria-pressed="mode === opt.value"
      :title="opt.label"
      class="flex items-center justify-center h-6 rounded transition-colors"
      :class="
        mode === opt.value
          ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
          : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
      "
      @click="setMode(opt.value)"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="h-3.5 w-3.5"
      >
        <path :d="opt.icon" />
      </svg>
    </button>
  </div>
</template>
