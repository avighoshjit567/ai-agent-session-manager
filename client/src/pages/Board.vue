<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import TaskCard from '../components/TaskCard.vue';
import TaskEditModal from '../components/TaskEditModal.vue';
import { useToast } from '../composables/useToast';
import {
  TASK_COLUMNS,
  type ProjectSummary,
  type Task,
  type TaskColumn,
} from '@shared/types';

const router = useRouter();
const toast = useToast();

const tasks = ref<Task[]>([]);
const projects = ref<ProjectSummary[]>([]);
const projectFilter = ref('');
const loading = ref(true);

const editing = ref<{ task: Task | null; column: TaskColumn } | null>(null);
const dragOverColumn = ref<TaskColumn | null>(null);

const COLUMN_LABELS: Record<TaskColumn, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
};

const byColumn = computed(() => {
  const map: Record<TaskColumn, Task[]> = { backlog: [], todo: [], in_progress: [], done: [] };
  for (const t of tasks.value) map[t.column]?.push(t);
  for (const c of TASK_COLUMNS) map[c].sort((a, b) => a.position - b.position);
  return map;
});

async function load() {
  loading.value = true;
  try {
    const res = await api.tasks(projectFilter.value || undefined);
    tasks.value = res.items;
  } catch (e: any) {
    toast.error(e?.message ?? 'Failed to load tasks');
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  load();
  try {
    projects.value = await api.projects();
  } catch {
    // filter dropdown just stays empty
  }
});

function shortPath(p: string): string {
  return p.split('/').filter(Boolean).slice(-2).join('/');
}

// Drop before the card at `index` in `column`; index === length appends.
function positionAt(column: TaskColumn, index: number, movedId: number): number {
  const list = byColumn.value[column].filter((t) => t.id !== movedId);
  if (list.length === 0) return 1;
  if (index <= 0) return list[0].position - 1;
  if (index >= list.length) return list[list.length - 1].position + 1;
  return (list[index - 1].position + list[index].position) / 2;
}

async function applyMove(taskId: number, column: TaskColumn, position: number) {
  const task = tasks.value.find((t) => t.id === taskId);
  if (!task) return;
  const prev = { column: task.column, position: task.position };
  task.column = column;
  task.position = position;
  try {
    await api.moveTask(taskId, column, position);
  } catch (e: any) {
    task.column = prev.column;
    task.position = prev.position;
    toast.error(e?.message ?? 'Failed to move task');
  }
}

function onDrop(e: DragEvent, column: TaskColumn, index: number) {
  e.preventDefault();
  e.stopPropagation();
  dragOverColumn.value = null;
  const id = Number(e.dataTransfer?.getData('text/task-id'));
  if (!id) return;
  applyMove(id, column, positionAt(column, index, id));
}

function onColumnDrop(e: DragEvent, column: TaskColumn) {
  onDrop(e, column, byColumn.value[column].length);
}

function moveToColumn(task: Task, column: TaskColumn) {
  applyMove(task.id, column, positionAt(column, byColumn.value[column].length, task.id));
}

async function removeTask(task: Task) {
  if (!confirm(`Delete task "${task.title}"?`)) return;
  try {
    await api.deleteTask(task.id);
    tasks.value = tasks.value.filter((t) => t.id !== task.id);
  } catch (e: any) {
    toast.error(e?.message ?? 'Failed to delete task');
  }
}

function openSession(ref: { provider: string; sessionId: string }) {
  router.push({
    name: 'session-detail',
    params: { provider: ref.provider, sessionId: ref.sessionId },
  });
}

function onSaved() {
  editing.value = null;
  load();
}
</script>

<template>
  <div class="p-6 max-w-7xl mx-auto flex flex-col h-full">
    <header class="mb-5 flex items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Board</h1>
        <p class="text-sm text-zinc-500 mt-0.5">{{ tasks.length }} tasks · drag cards between columns</p>
      </div>
      <select
        v-model="projectFilter"
        @change="load"
        class="px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 text-sm focus:border-zinc-400 dark:focus:border-zinc-600 outline-none max-w-64"
      >
        <option value="">All projects</option>
        <option v-for="p in projects" :key="p.projectPath" :value="p.projectPath">
          {{ shortPath(p.projectPath) }}
        </option>
      </select>
    </header>

    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 flex-1 min-h-0 items-start">
      <section
        v-for="c in TASK_COLUMNS"
        :key="c"
        class="rounded-xl border bg-zinc-50 dark:bg-zinc-900/30 flex flex-col max-h-full transition-colors"
        :class="dragOverColumn === c
          ? 'border-violet-400 dark:border-violet-600'
          : 'border-zinc-200 dark:border-zinc-800'"
        @dragover.prevent="dragOverColumn = c"
        @dragleave="dragOverColumn === c && (dragOverColumn = null)"
        @drop="onColumnDrop($event, c)"
      >
        <div class="px-3 py-2.5 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span
              class="h-2 w-2 rounded-full"
              :class="{
                'bg-zinc-400': c === 'backlog',
                'bg-sky-400': c === 'todo',
                'bg-amber-400': c === 'in_progress',
                'bg-emerald-400': c === 'done',
              }"
            />
            <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              {{ COLUMN_LABELS[c] }}
            </h2>
            <span class="text-[11px] text-zinc-500 tabular-nums">{{ byColumn[c].length }}</span>
          </div>
          <button
            class="h-5 w-5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-sm leading-none"
            @click="editing = { task: null, column: c }"
            :aria-label="`New task in ${COLUMN_LABELS[c]}`"
          >+</button>
        </div>

        <div class="px-2 pb-2 space-y-2 overflow-y-auto min-h-16">
          <template v-for="(t, i) in byColumn[c]" :key="t.id">
            <div @dragover.prevent @drop="onDrop($event, c, i)">
              <TaskCard
                :task="t"
                @edit="editing = { task: t, column: c }"
                @move="(col) => moveToColumn(t, col)"
                @delete="removeTask(t)"
                @open-session="openSession"
              />
            </div>
          </template>
          <div
            v-if="byColumn[c].length === 0 && !loading"
            class="rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 px-3 py-6 text-center text-xs text-zinc-500"
          >
            No tasks
          </div>
        </div>
      </section>
    </div>

    <TaskEditModal
      v-if="editing"
      :task="editing.task"
      :column="editing.column"
      @close="editing = null"
      @saved="onSaved"
    />
  </div>
</template>
