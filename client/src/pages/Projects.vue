<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { api } from '../api';
import type { ProjectSummary } from '@shared/types';

const projects = ref<ProjectSummary[]>([]);
const loading = ref(true);
const filter = ref('');

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase();
  if (!q) return projects.value;
  return projects.value.filter((p) => p.projectPath.toLowerCase().includes(q));
});

async function load() {
  loading.value = true;
  try {
    projects.value = await api.projects();
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}
</script>

<template>
  <div class="p-6 max-w-6xl mx-auto">
    <header class="mb-4">
      <h1 class="text-xl font-semibold text-zinc-100">Projects</h1>
      <p class="text-sm text-zinc-500">Auto-detected from Claude `cwd` and Codex `threads.cwd`.</p>
    </header>

    <input
      v-model="filter"
      placeholder="Filter projects…"
      class="w-full mb-4 px-3 py-2 rounded border border-zinc-800 bg-zinc-900 text-zinc-100 text-sm placeholder:text-zinc-500"
    />

    <div class="rounded-lg border border-zinc-800 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-400">
          <tr>
            <th class="px-3 py-2 text-left font-medium">Project</th>
            <th class="px-3 py-2 text-right font-medium">Sessions</th>
            <th class="px-3 py-2 text-left font-medium">Providers</th>
            <th class="px-3 py-2 text-left font-medium">Latest</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="4" class="px-3 py-6 text-center text-zinc-500">Loading…</td></tr>
          <tr v-else-if="filtered.length === 0">
            <td colspan="4" class="px-3 py-6 text-center text-zinc-500">No projects</td>
          </tr>
          <tr
            v-for="p in filtered"
            :key="p.projectPath"
            class="border-t border-zinc-800 hover:bg-zinc-900/60 cursor-pointer"
          >
            <td class="px-3 py-2">
              <RouterLink
                :to="{ name: 'sessions', query: { projectPath: p.projectPath } }"
                class="text-zinc-100 hover:underline"
              >
                {{ p.projectPath }}
              </RouterLink>
            </td>
            <td class="px-3 py-2 text-right text-zinc-300">{{ p.sessionCount }}</td>
            <td class="px-3 py-2 text-zinc-400">{{ p.providers.join(', ') }}</td>
            <td class="px-3 py-2 text-zinc-400">{{ fmtDate(p.latestUpdatedAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
