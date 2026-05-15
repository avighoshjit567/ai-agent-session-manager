<script setup lang="ts">
import { ref } from 'vue';
import { copy as doCopy } from '../composables/useClipboard';

const props = defineProps<{
  value: string;
  label?: string;
  small?: boolean;
}>();

const copied = ref(false);

async function handle(e: MouseEvent) {
  e.stopPropagation();
  e.preventDefault();
  const ok = await doCopy(props.value, props.label);
  if (ok) {
    copied.value = true;
    setTimeout(() => (copied.value = false), 1200);
  }
}
</script>

<template>
  <button
    type="button"
    @click="handle"
    :title="`Copy ${label ?? 'value'}`"
    class="inline-flex items-center justify-center rounded transition-colors text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800"
    :class="small ? 'h-5 w-5' : 'h-6 w-6'"
  >
    <svg
      v-if="!copied"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      :class="small ? 'h-3 w-3' : 'h-3.5 w-3.5'"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
    <svg
      v-else
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="text-emerald-400"
      :class="small ? 'h-3 w-3' : 'h-3.5 w-3.5'"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  </button>
</template>
