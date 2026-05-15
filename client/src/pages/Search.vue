<script setup lang="ts">
import { ref } from 'vue';
import { api } from '../api';
import SessionList from '../components/SessionList.vue';
import type { Session } from '@shared/types';

const q = ref('');
const provider = ref<'all' | 'claude' | 'codex'>('all');
const items = ref<Session[]>([]);
const total = ref(0);
const loading = ref(false);
const ran = ref(false);

async function go() {
  if (!q.value.trim()) return;
  loading.value = true;
  ran.value = true;
  try {
    const r = await api.sessions({ q: q.value, provider: provider.value, limit: 100 });
    items.value = r.items;
    total.value = r.total;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="p-6 max-w-6xl mx-auto">
    <header class="mb-4">
      <h1 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Search</h1>
      <p class="text-sm text-zinc-500">Searches titles, project paths, branches, and first prompts.</p>
    </header>

    <div class="flex gap-2 mb-6">
      <select
        v-model="provider"
        class="px-2 py-2 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm"
      >
        <option value="all">All</option>
        <option value="claude">Claude</option>
        <option value="codex">Codex</option>
      </select>
      <input
        v-model="q"
        placeholder="e.g. cache, ssl, redirect, refactor billing"
        class="flex-1 px-3 py-2 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 text-sm"
        @keyup.enter="go"
      />
      <button class="px-4 py-2 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-sm" @click="go">
        Search
      </button>
    </div>

    <div v-if="ran" class="mb-2 text-xs text-zinc-500">{{ total }} matches</div>
    <SessionList :sessions="items" :loading="loading" />
  </div>
</template>
