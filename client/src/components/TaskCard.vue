<script setup lang="ts">
import { computed, ref } from 'vue';
import { TASK_COLUMNS, type Task, type TaskColumn } from '@shared/types';

const props = defineProps<{ task: Task }>();
const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'move', column: TaskColumn): void;
  (e: 'delete'): void;
  (e: 'open-session', ref: { provider: string; sessionId: string }): void;
}>();

const menuOpen = ref(false);

const COLUMN_LABELS: Record<TaskColumn, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
};

const otherColumns = computed(() => TASK_COLUMNS.filter((c) => c !== props.task.column));

const priorityClass = computed(() => {
  switch (props.task.priority) {
    case 'high':
      return 'bg-red-500/10 text-red-500 border-red-500/30';
    case 'low':
      return 'bg-zinc-500/10 text-zinc-500 border-zinc-500/30';
    default:
      return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
  }
});

const overdue = computed(() => {
  if (!props.task.dueDate || props.task.column === 'done') return false;
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return props.task.dueDate < iso;
});

function sessionName(s: Task['sessions'][number]): string {
  return s.name || s.sessionId.slice(0, 8);
}

function onDragStart(e: DragEvent) {
  menuOpen.value = false;
  e.dataTransfer?.setData('text/task-id', String(props.task.id));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
</script>

<template>
  <div
    draggable="true"
    @dragstart="onDragStart"
    class="group relative rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 cursor-grab active:cursor-grabbing hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
    @click="emit('edit')"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="text-sm text-zinc-900 dark:text-zinc-100 font-medium leading-snug">
        {{ task.title }}
      </div>
      <button
        class="shrink-0 h-5 w-5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 opacity-0 group-hover:opacity-100 transition-opacity"
        @click.stop="menuOpen = !menuOpen"
        aria-label="Task menu"
      >⋯</button>
    </div>

    <p v-if="task.description" class="mt-1 text-xs text-zinc-500 line-clamp-2">
      {{ task.description }}
    </p>

    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <span
        class="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium uppercase tracking-wide"
        :class="priorityClass"
      >{{ task.priority }}</span>
      <span
        v-for="tag in task.tags"
        :key="tag"
        class="inline-flex items-center px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 text-[10px]"
      >{{ tag }}</span>
      <span
        v-if="task.dueDate"
        class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] tabular-nums"
        :class="overdue ? 'bg-red-500/10 text-red-500 font-medium' : 'bg-zinc-500/10 text-zinc-500'"
      >
        <svg class="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
        </svg>
        {{ task.dueDate }}
      </span>
    </div>

    <div v-if="task.sessions.length > 0" class="mt-2 flex flex-wrap gap-1">
      <button
        v-for="s in task.sessions"
        :key="s.provider + s.sessionId"
        class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-[10px] text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 max-w-full"
        @click.stop="emit('open-session', s)"
        :title="`Open ${s.provider} session`"
      >
        <span
          class="h-1.5 w-1.5 rounded-full shrink-0"
          :class="s.provider === 'claude' ? 'bg-amber-400' : 'bg-emerald-400'"
        />
        <span class="truncate">{{ sessionName(s) }}</span>
      </button>
    </div>

    <div
      v-if="menuOpen"
      class="absolute right-2 top-8 z-10 w-40 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-lg py-1 text-xs"
      @click.stop
    >
      <button
        v-for="c in otherColumns"
        :key="c"
        class="block w-full text-left px-3 py-1.5 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        @click="menuOpen = false; emit('move', c)"
      >Move to {{ COLUMN_LABELS[c] }}</button>
      <div class="my-1 border-t border-zinc-100 dark:border-zinc-900" />
      <button
        class="block w-full text-left px-3 py-1.5 text-red-500 hover:bg-red-500/10"
        @click="menuOpen = false; emit('delete')"
      >Delete</button>
    </div>
  </div>
</template>
