<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../api';
import TaskEditModal from './TaskEditModal.vue';
import { useToast } from '../composables/useToast';
import type { Provider, Task, TaskColumn } from '@shared/types';

const props = defineProps<{ provider: Provider; sessionId: string; sessionName?: string | null }>();
const toast = useToast();

const linked = ref<Task[]>([]);
const allTasks = ref<Task[]>([]);
const linking = ref(false);
const creating = ref(false);

const COLUMN_LABELS: Record<TaskColumn, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
};

async function load() {
  try {
    const res = await api.sessionTasks(props.provider, props.sessionId);
    linked.value = res.items;
  } catch {
    linked.value = [];
  }
}

const linkable = computed(() =>
  allTasks.value.filter((t) => !linked.value.some((l) => l.id === t.id)),
);

async function openLinkPicker() {
  linking.value = !linking.value;
  if (linking.value && allTasks.value.length === 0) {
    try {
      allTasks.value = (await api.tasks()).items;
    } catch {
      allTasks.value = [];
    }
  }
}

async function linkTask(t: Task) {
  try {
    const refs = [
      ...t.sessions.map((s) => ({ provider: s.provider, sessionId: s.sessionId })),
      { provider: props.provider, sessionId: props.sessionId },
    ];
    await api.setTaskSessions(t.id, refs);
    linking.value = false;
    await load();
  } catch (e: any) {
    toast.error(e?.message ?? 'Failed to link task');
  }
}

async function unlinkTask(t: Task) {
  try {
    const refs = t.sessions
      .filter((s) => !(s.provider === props.provider && s.sessionId === props.sessionId))
      .map((s) => ({ provider: s.provider, sessionId: s.sessionId }));
    await api.setTaskSessions(t.id, refs);
    await load();
  } catch (e: any) {
    toast.error(e?.message ?? 'Failed to unlink task');
  }
}

function onCreated() {
  creating.value = false;
  allTasks.value = [];
  load();
}

watch(() => [props.provider, props.sessionId], load);
onMounted(load);
</script>

<template>
  <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 p-3 space-y-2">
    <div class="flex items-center justify-between">
      <h3 class="text-xs font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">Tasks</h3>
      <div class="flex items-center gap-1">
        <button
          class="text-[11px] px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800"
          @click="openLinkPicker"
        >Link</button>
        <button
          class="text-[11px] px-2 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800"
          @click="creating = true"
        >+ New</button>
      </div>
    </div>

    <div v-if="linking" class="rounded-md border border-zinc-200 dark:border-zinc-800 max-h-40 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-900">
      <button
        v-for="t in linkable"
        :key="t.id"
        class="block w-full text-left px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        @click="linkTask(t)"
      >
        <span class="font-medium">{{ t.title }}</span>
        <span class="text-zinc-500 ml-1">· {{ COLUMN_LABELS[t.column] }}</span>
      </button>
      <div v-if="linkable.length === 0" class="px-2 py-2 text-xs text-zinc-500 text-center">
        No other tasks to link
      </div>
    </div>

    <div v-if="linked.length > 0" class="space-y-1.5">
      <div
        v-for="t in linked"
        :key="t.id"
        class="group flex items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2 py-1.5"
      >
        <span
          class="h-1.5 w-1.5 rounded-full shrink-0"
          :class="{
            'bg-zinc-400': t.column === 'backlog',
            'bg-sky-400': t.column === 'todo',
            'bg-amber-400': t.column === 'in_progress',
            'bg-emerald-400': t.column === 'done',
          }"
        />
        <RouterLink :to="{ name: 'board' }" class="flex-1 min-w-0">
          <span class="block text-xs text-zinc-900 dark:text-zinc-100 truncate">{{ t.title }}</span>
          <span class="block text-[10px] text-zinc-500">{{ COLUMN_LABELS[t.column] }}</span>
        </RouterLink>
        <button
          class="shrink-0 text-[10px] text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Unlink from this session"
          @click="unlinkTask(t)"
        >✕</button>
      </div>
    </div>
    <div v-else class="text-xs text-zinc-500 text-center py-1">No linked tasks</div>

    <TaskEditModal
      v-if="creating"
      :task="null"
      column="todo"
      :preset-session="{ provider, sessionId, name: sessionName }"
      @close="creating = false"
      @saved="onCreated"
    />
  </div>
</template>
