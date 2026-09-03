<script setup lang="ts">
import { computed } from 'vue';
import { linkifyText } from '../lib/linkify';
import type { Task, TaskColumn } from '@shared/types';

const props = defineProps<{ task: Task }>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'edit'): void;
  (e: 'delete'): void;
  (e: 'open-session', ref: { provider: string; sessionId: string }): void;
}>();

const COLUMN_LABELS: Record<TaskColumn, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
};

const descriptionHtml = computed(() => linkifyText(props.task.description));

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
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 pt-[8vh]"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl">
      <div class="px-4 py-3 border-b border-zinc-100 dark:border-zinc-900 flex items-center gap-2">
        <span
          class="h-2 w-2 rounded-full shrink-0"
          :class="{
            'bg-zinc-400': task.column === 'backlog',
            'bg-sky-400': task.column === 'todo',
            'bg-amber-400': task.column === 'in_progress',
            'bg-emerald-400': task.column === 'done',
          }"
        />
        <span class="text-[11px] uppercase tracking-wider text-zinc-500">{{ COLUMN_LABELS[task.column] }}</span>
        <div class="ml-auto flex items-center gap-1">
          <button
            class="p-1.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            title="Edit task"
            @click="emit('edit')"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
          <button
            class="p-1.5 rounded text-zinc-400 hover:text-red-500 hover:bg-red-500/10"
            title="Delete task"
            @click="emit('delete')"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3.5 w-3.5">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
          <button
            class="p-1.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            title="Close"
            @click="emit('close')"
          >✕</button>
        </div>
      </div>

      <div class="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
        <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
          {{ task.title }}
        </h2>

        <div class="flex flex-wrap items-center gap-1.5">
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
            class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] tabular-nums"
            :class="overdue ? 'bg-red-500/10 text-red-500 font-medium' : 'bg-zinc-500/10 text-zinc-500'"
          >Due {{ task.dueDate }}</span>
        </div>

        <!-- linkifyText escapes all input; only anchors we build are unescaped -->
        <div
          v-if="task.description"
          class="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap break-words"
          v-html="descriptionHtml"
        />
        <p v-else class="text-sm text-zinc-500 italic">No description</p>

        <div v-if="task.projectPath" class="text-xs text-zinc-500 truncate" :title="task.projectPath">
          📁 {{ task.projectPath }}
        </div>

        <div v-if="task.sessions.length > 0">
          <div class="text-[11px] uppercase tracking-wider text-zinc-500 mb-1.5">Linked sessions</div>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="s in task.sessions"
              :key="s.provider + s.sessionId"
              class="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              @click="emit('open-session', s)"
            >
              <span
                class="h-1.5 w-1.5 rounded-full shrink-0"
                :class="s.provider === 'claude' ? 'bg-amber-400' : 'bg-emerald-400'"
              />
              {{ s.name || s.sessionId.slice(0, 8) }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
