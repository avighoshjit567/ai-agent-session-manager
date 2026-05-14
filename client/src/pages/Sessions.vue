<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import SessionList from '../components/SessionList.vue';
import type { Session, SessionFilter } from '@shared/types';

const route = useRoute();
const router = useRouter();

const items = ref<Session[]>([]);
const total = ref(0);
const loading = ref(false);
const limit = 50;
const offset = ref(0);

const filter = ref<SessionFilter>({
  provider: 'all',
  projectPath: undefined,
  branch: undefined,
  q: undefined,
  hasTools: false,
  hasSubagents: false,
  archived: undefined,
});

function syncFromQuery() {
  const q = route.query;
  filter.value.provider = (q.provider as any) || 'all';
  filter.value.projectPath = (q.projectPath as string) || undefined;
  filter.value.branch = (q.branch as string) || undefined;
  filter.value.q = (q.q as string) || undefined;
  filter.value.hasTools = q.hasTools === '1' || q.hasTools === 'true';
  filter.value.hasSubagents = q.hasSubagents === '1' || q.hasSubagents === 'true';
  if (q.archived === '1' || q.archived === 'true') filter.value.archived = true;
  else if (q.archived === '0' || q.archived === 'false') filter.value.archived = false;
  else filter.value.archived = undefined;
  offset.value = 0;
}

async function load() {
  loading.value = true;
  try {
    const res = await api.sessions({ ...filter.value, limit, offset: offset.value });
    items.value = res.items;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function apply() {
  router.replace({
    query: cleanQuery({
      provider: filter.value.provider,
      projectPath: filter.value.projectPath,
      branch: filter.value.branch,
      q: filter.value.q,
      hasTools: filter.value.hasTools ? '1' : undefined,
      hasSubagents: filter.value.hasSubagents ? '1' : undefined,
      archived:
        filter.value.archived === true
          ? '1'
          : filter.value.archived === false
          ? '0'
          : undefined,
    }),
  });
}

function reset() {
  filter.value = {
    provider: 'all',
    projectPath: undefined,
    branch: undefined,
    q: undefined,
    hasTools: false,
    hasSubagents: false,
    archived: undefined,
  };
  apply();
}

function cleanQuery(o: Record<string, any>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = String(v);
  }
  return out;
}

const hasActiveFilters = computed(() => {
  const f = filter.value;
  return !!(f.provider && f.provider !== 'all') ||
    !!f.projectPath ||
    !!f.branch ||
    !!f.q ||
    f.hasTools ||
    f.hasSubagents ||
    f.archived !== undefined;
});

const showing = computed(() =>
  total.value === 0
    ? '0 of 0'
    : `${offset.value + 1}–${Math.min(offset.value + items.value.length, total.value)} of ${total.value}`,
);

watch(() => route.query, () => {
  syncFromQuery();
  load();
});

onMounted(() => {
  syncFromQuery();
  load();
});

function next() {
  if (offset.value + limit >= total.value) return;
  offset.value += limit;
  load();
}
function prev() {
  if (offset.value === 0) return;
  offset.value = Math.max(0, offset.value - limit);
  load();
}
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto">
    <header class="mb-5 flex items-baseline justify-between">
      <div>
        <h1 class="text-xl font-semibold text-zinc-100">Sessions</h1>
        <p class="text-sm text-zinc-500 mt-0.5">{{ total }} total · {{ showing }} shown</p>
      </div>
      <button
        v-if="hasActiveFilters"
        @click="reset"
        class="text-xs px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
      >Clear filters</button>
    </header>

    <div class="rounded-xl border border-zinc-800 bg-zinc-900/30 p-3 mb-4">
      <div class="grid grid-cols-1 md:grid-cols-6 gap-2 mb-3">
        <select
          v-model="filter.provider"
          class="px-2.5 py-1.5 rounded-md border border-zinc-800 bg-zinc-950 text-zinc-100 text-sm focus:border-zinc-600 outline-none"
          @change="apply"
        >
          <option value="all">All providers</option>
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
        </select>
        <input
          v-model="filter.projectPath"
          placeholder="Project path"
          class="px-2.5 py-1.5 rounded-md border border-zinc-800 bg-zinc-950 text-zinc-100 text-sm md:col-span-2 focus:border-zinc-600 outline-none"
          @change="apply"
        />
        <input
          v-model="filter.branch"
          placeholder="Branch"
          class="px-2.5 py-1.5 rounded-md border border-zinc-800 bg-zinc-950 text-zinc-100 text-sm focus:border-zinc-600 outline-none"
          @change="apply"
        />
        <input
          v-model="filter.q"
          placeholder="Search titles, prompts…"
          class="px-2.5 py-1.5 rounded-md border border-zinc-800 bg-zinc-950 text-zinc-100 text-sm md:col-span-2 focus:border-zinc-600 outline-none"
          @keyup.enter="apply"
        />
      </div>

      <div class="flex items-center gap-3 text-xs text-zinc-400">
        <label class="inline-flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" v-model="filter.hasTools" @change="apply" class="accent-violet-500" />
          Has tool calls
        </label>
        <label class="inline-flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" v-model="filter.hasSubagents" @change="apply" class="accent-violet-500" />
          Has subagents
        </label>
        <label class="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            :checked="filter.archived === true"
            @change="(e: any) => { filter.archived = e.target.checked ? true : undefined; apply(); }"
            class="accent-zinc-500"
          />
          Archived only
        </label>
      </div>
    </div>

    <SessionList :sessions="items" :loading="loading" />

    <div class="flex items-center justify-between mt-3 text-xs">
      <button
        class="px-3 py-1.5 rounded-md border border-zinc-800 text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
        :disabled="offset === 0"
        @click="prev"
      >← Prev</button>
      <span class="text-zinc-500">{{ showing }}</span>
      <button
        class="px-3 py-1.5 rounded-md border border-zinc-800 text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
        :disabled="offset + items.length >= total"
        @click="next"
      >Next →</button>
    </div>
  </div>
</template>
