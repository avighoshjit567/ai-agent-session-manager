<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { api } from './api';
import ToastHost from './components/ToastHost.vue';
import ThemeToggle from './components/ThemeToggle.vue';
import { useToast } from './composables/useToast';

const toast = useToast();
const indexing = ref(false);
const indexStats = ref<{ claudeSessions: number; codexSessions: number } | null>(null);

async function pollStatus() {
  try {
    const s = await api.indexStatus();
    indexing.value = s.running;
    if (s.last) indexStats.value = { claudeSessions: s.last.claudeSessions, codexSessions: s.last.codexSessions };
  } catch {
    // ignore
  }
}

async function rebuild() {
  indexing.value = true;
  try {
    const r = await api.reindex(true);
    indexStats.value = { claudeSessions: r.claudeSessions, codexSessions: r.codexSessions };
    toast.success(`Indexed ${r.claudeSessions + r.codexSessions} sessions`);
  } catch (e: any) {
    toast.error(`Rebuild failed: ${e?.message ?? e}`);
  } finally {
    indexing.value = false;
  }
}

onMounted(() => {
  pollStatus();
  setInterval(pollStatus, 3000);
});

const nav = [
  {
    to: '/',
    label: 'Dashboard',
    icon: 'M3 12l9-9 9 9M5 10v10h14V10',
  },
  {
    to: '/projects',
    label: 'Projects',
    icon: 'M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
  },
  {
    to: '/sessions',
    label: 'Sessions',
    icon: 'M4 6h16M4 12h16M4 18h10',
  },
  {
    to: '/search',
    label: 'Search',
    icon: 'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.35-4.35',
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  },
];
</script>

<template>
  <div class="flex h-full bg-white dark:bg-zinc-950">
    <aside class="w-60 shrink-0 border-r border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 flex flex-col">
      <div class="px-4 py-4 border-b border-zinc-200 dark:border-zinc-800/80">
        <div class="flex items-center gap-2">
          <div class="h-7 w-7 rounded-md bg-gradient-to-br from-amber-500/80 to-emerald-500/80 flex items-center justify-center text-zinc-950 font-bold text-[11px]">
            S
          </div>
          <div>
            <div class="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">Session Manager</div>
            <div class="text-[10px] text-zinc-500 leading-tight">Claude · Codex</div>
          </div>
        </div>
      </div>
      <nav class="flex-1 px-2 py-3 space-y-0.5">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="group flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900/60 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          active-class="bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100"
          :exact-active-class="item.to === '/' ? 'bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100' : ''"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-4 w-4 opacity-80 group-hover:opacity-100"
          >
            <path :d="item.icon" />
          </svg>
          {{ item.label }}
        </RouterLink>
      </nav>
      <div class="border-t border-zinc-200 dark:border-zinc-800/80 p-3 space-y-2">
        <ThemeToggle />
        <div class="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span
            class="inline-block h-1.5 w-1.5 rounded-full"
            :class="indexing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'"
          />
          <span v-if="indexStats">
            {{ indexStats.claudeSessions + indexStats.codexSessions }} sessions
            <span class="text-zinc-600">·</span>
            <span class="text-amber-400">{{ indexStats.claudeSessions }}c</span>
            <span class="text-zinc-700">/</span>
            <span class="text-emerald-400">{{ indexStats.codexSessions }}cx</span>
          </span>
          <span v-else>—</span>
        </div>
        <button
          class="w-full text-xs px-2 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:border-zinc-400 dark:hover:border-zinc-600 disabled:opacity-50 transition-colors"
          :disabled="indexing"
          @click="rebuild"
        >
          {{ indexing ? 'Rebuilding…' : 'Rebuild index' }}
        </button>
      </div>
    </aside>
    <main class="flex-1 overflow-y-auto">
      <RouterView v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>
    <ToastHost />
  </div>
</template>
