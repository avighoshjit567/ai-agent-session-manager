<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import SessionList from '../components/SessionList.vue';
import { TASK_COLUMNS, type Session, type ProjectSummary, type Task, type TaskColumn } from '@shared/types';

const loading = ref(true);
const totals = ref({ total: 0, claude: 0, codex: 0 });
const recent = ref<Session[]>([]);
const active = ref<Session[]>([]);
const topProjects = ref<ProjectSummary[]>([]);
const tasks = ref<Task[]>([]);

const COLUMN_LABELS: Record<TaskColumn, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
};

const taskCounts = computed(() =>
  TASK_COLUMNS.map((c) => ({
    column: c,
    label: COLUMN_LABELS[c],
    count: tasks.value.filter((t) => t.column === c).length,
  })),
);

const inProgress = computed(() =>
  tasks.value
    .filter((t) => t.column === 'in_progress')
    .sort((a, b) => a.position - b.position),
);

async function load() {
  loading.value = true;
  try {
    const d = await api.dashboard();
    totals.value = { total: d.totalSessions, claude: d.claudeSessions, codex: d.codexSessions };
    recent.value = d.recent;
    active.value = d.active;
    topProjects.value = d.topProjects;
  } finally {
    loading.value = false;
  }
  try {
    tasks.value = (await api.tasks()).items;
  } catch {
    tasks.value = [];
  }
}

onMounted(load);

function shortPath(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts.slice(-2).join('/');
}
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto">
    <header class="mb-6">
      <h1 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
      <p class="text-sm text-zinc-500 mt-0.5">Local snapshot of your Claude and Codex sessions.</p>
    </header>

    <section class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
      <div class="relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4">
        <div class="absolute -top-6 -right-6 h-20 w-20 rounded-full bg-zinc-300/40 dark:bg-zinc-700/10 blur-2xl" />
        <div class="text-[11px] uppercase tracking-wider text-zinc-500">Total sessions</div>
        <div class="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 mt-1 tabular-nums">{{ totals.total }}</div>
      </div>
      <div class="relative overflow-hidden rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.07] to-zinc-100 dark:to-zinc-900/40 p-4">
        <div class="absolute -top-6 -right-6 h-20 w-20 rounded-full bg-amber-500/15 blur-2xl" />
        <div class="text-[11px] uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 rounded-full bg-amber-400" /> Claude
        </div>
        <div class="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 mt-1 tabular-nums">{{ totals.claude }}</div>
      </div>
      <div class="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] to-zinc-100 dark:to-zinc-900/40 p-4">
        <div class="absolute -top-6 -right-6 h-20 w-20 rounded-full bg-emerald-500/15 blur-2xl" />
        <div class="text-[11px] uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Codex
        </div>
        <div class="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 mt-1 tabular-nums">{{ totals.codex }}</div>
      </div>
      <div class="relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 p-4">
        <div class="text-[11px] uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="active.length > 0 ? 'bg-sky-400 animate-pulse' : 'bg-zinc-600'"
          />
          Active (last hour)
        </div>
        <div class="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 mt-1 tabular-nums">{{ active.length }}</div>
      </div>
    </section>

    <section v-if="tasks.length > 0" class="mb-8">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Task board</h2>
        <RouterLink :to="{ name: 'board' }" class="text-[11px] text-violet-500 hover:text-violet-400">
          Open board →
        </RouterLink>
      </div>
      <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 p-3">
        <div class="grid grid-cols-4 gap-2 mb-3">
          <RouterLink
            v-for="c in taskCounts"
            :key="c.column"
            :to="{ name: 'board' }"
            class="text-center py-2 rounded-md bg-white dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
          >
            <div class="text-lg font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">{{ c.count }}</div>
            <div class="text-[10px] uppercase tracking-wider text-zinc-500 mt-0.5">{{ c.label }}</div>
          </RouterLink>
        </div>
        <div v-if="inProgress.length > 0" class="space-y-1">
          <div class="text-[11px] uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
            <span class="h-1.5 w-1.5 rounded-full bg-amber-400" /> In progress
          </div>
          <RouterLink
            v-for="t in inProgress"
            :key="t.id"
            :to="{ name: 'board' }"
            class="block text-sm text-zinc-800 dark:text-zinc-200 truncate hover:text-violet-500"
          >{{ t.title }}</RouterLink>
        </div>
      </div>
    </section>

    <section class="mb-8">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-sm font-medium text-zinc-700 dark:text-zinc-300">Active sessions</h2>
        <span class="text-[11px] text-zinc-500">Updated within the last hour</span>
      </div>
      <SessionList :sessions="active" :loading="loading" v-if="active.length > 0 || loading" />
      <div
        v-else
        class="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/20 px-4 py-8 text-center text-sm text-zinc-500"
      >
        Nothing updated in the last hour.
      </div>
    </section>

    <section class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2">
        <h2 class="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Recent</h2>
        <SessionList :sessions="recent" :loading="loading" />
      </div>
      <div>
        <h2 class="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Top projects</h2>
        <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 divide-y divide-zinc-100 dark:divide-zinc-900">
          <RouterLink
            v-for="p in topProjects"
            :key="p.projectPath"
            :to="{ name: 'sessions', query: { projectPath: p.projectPath } }"
            class="block px-3 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-900/60 transition-colors"
          >
            <div class="text-sm text-zinc-900 dark:text-zinc-100 truncate">{{ shortPath(p.projectPath) }}</div>
            <div class="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
              <span class="tabular-nums">{{ p.sessionCount }} sessions</span>
              <span class="text-zinc-700">·</span>
              <span v-for="prov in p.providers" :key="prov" class="inline-flex items-center gap-0.5">
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  :class="prov === 'claude' ? 'bg-amber-400' : 'bg-emerald-400'"
                />
                {{ prov }}
              </span>
            </div>
          </RouterLink>
          <div v-if="topProjects.length === 0" class="px-3 py-6 text-center text-zinc-500 text-sm">
            No projects yet
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
