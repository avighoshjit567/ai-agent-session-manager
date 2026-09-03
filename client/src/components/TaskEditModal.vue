<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { api, type TaskInput } from '../api';
import { useToast } from '../composables/useToast';
import {
  TASK_PRIORITIES,
  type Provider,
  type Task,
  type TaskColumn,
  type TaskSessionRef,
} from '@shared/types';

const props = defineProps<{
  // null = create a new task in `column`
  task: Task | null;
  column: TaskColumn;
  // Pre-link this session on create (used from the session detail page).
  presetSession?: { provider: Provider; sessionId: string; name?: string | null };
}>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>();

const toast = useToast();

const title = ref('');
const description = ref('');
const priority = ref<Task['priority']>('medium');
const tagsText = ref('');
const dueDate = ref('');
const projectPath = ref('');
const sessions = ref<TaskSessionRef[]>([]);
const saving = ref(false);

const sessionQuery = ref('');
const sessionResults = ref<Array<TaskSessionRef & { label: string }>>([]);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  if (props.task) {
    title.value = props.task.title;
    description.value = props.task.description;
    priority.value = props.task.priority;
    tagsText.value = props.task.tags.join(', ');
    dueDate.value = props.task.dueDate ?? '';
    projectPath.value = props.task.projectPath ?? '';
    sessions.value = [...props.task.sessions];
  } else if (props.presetSession) {
    sessions.value = [{ ...props.presetSession }];
  }
});

watch(sessionQuery, (q) => {
  if (searchTimer) clearTimeout(searchTimer);
  if (!q.trim()) {
    sessionResults.value = [];
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const res = await api.sessions({ q: q.trim(), limit: 8 });
      sessionResults.value = res.items.map((s) => ({
        provider: s.provider,
        sessionId: s.sessionId,
        name: s.displayName || s.title,
        label: s.displayName || s.title || s.firstUserMessage?.slice(0, 60) || s.sessionId,
      }));
    } catch {
      sessionResults.value = [];
    }
  }, 250);
});

function addSession(s: TaskSessionRef) {
  if (!sessions.value.some((x) => x.provider === s.provider && x.sessionId === s.sessionId)) {
    sessions.value.push({ provider: s.provider, sessionId: s.sessionId, name: s.name ?? null });
  }
  sessionQuery.value = '';
  sessionResults.value = [];
}

function removeSession(s: TaskSessionRef) {
  sessions.value = sessions.value.filter(
    (x) => !(x.provider === s.provider && x.sessionId === s.sessionId),
  );
}

function parseTags(): string[] {
  return tagsText.value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

async function save() {
  if (!title.value.trim()) {
    toast.error('Title is required');
    return;
  }
  saving.value = true;
  try {
    const patch: TaskInput = {
      title: title.value,
      description: description.value,
      priority: priority.value,
      tags: parseTags(),
      dueDate: dueDate.value || null,
      projectPath: projectPath.value.trim() || null,
    };
    let id: number;
    if (props.task) {
      await api.updateTask(props.task.id, patch);
      id = props.task.id;
    } else {
      const created = await api.createTask({ ...patch, column: props.column });
      id = created.id;
    }
    await api.setTaskSessions(
      id,
      sessions.value.map((s) => ({ provider: s.provider, sessionId: s.sessionId })),
    );
    emit('saved');
  } catch (e: any) {
    toast.error(e?.message ?? 'Failed to save task');
  } finally {
    saving.value = false;
  }
}

const inputClass =
  'w-full px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 text-sm focus:border-zinc-400 dark:focus:border-zinc-600 outline-none';
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 pt-[8vh]"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-lg rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl">
      <div class="px-4 py-3 border-b border-zinc-100 dark:border-zinc-900 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {{ props.task ? 'Edit task' : 'New task' }}
        </h2>
        <button
          class="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          @click="emit('close')"
          aria-label="Close"
        >✕</button>
      </div>

      <div class="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
        <input v-model="title" placeholder="Task title" :class="inputClass" autofocus @keyup.enter="save" />
        <textarea
          v-model="description"
          placeholder="Description (optional)"
          rows="3"
          :class="inputClass"
        />

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Priority</label>
            <select v-model="priority" :class="inputClass">
              <option v-for="p in TASK_PRIORITIES" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>
          <div>
            <label class="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Due date</label>
            <input v-model="dueDate" type="date" :class="inputClass" />
          </div>
        </div>

        <div>
          <label class="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Tags (comma-separated)</label>
          <input v-model="tagsText" placeholder="feature, ui" :class="inputClass" />
        </div>

        <div>
          <label class="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Project path</label>
          <input v-model="projectPath" placeholder="/Users/you/project (optional)" :class="inputClass" />
        </div>

        <div>
          <label class="block text-[11px] uppercase tracking-wider text-zinc-500 mb-1">Linked sessions</label>
          <div v-if="sessions.length > 0" class="flex flex-wrap gap-1 mb-2">
            <span
              v-for="s in sessions"
              :key="s.provider + s.sessionId"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-400"
            >
              <span
                class="h-1.5 w-1.5 rounded-full"
                :class="s.provider === 'claude' ? 'bg-amber-400' : 'bg-emerald-400'"
              />
              {{ s.name || s.sessionId.slice(0, 8) }}
              <button class="ml-0.5 text-zinc-400 hover:text-red-500" @click="removeSession(s)">✕</button>
            </span>
          </div>
          <div class="relative">
            <input v-model="sessionQuery" placeholder="Search sessions to link…" :class="inputClass" />
            <div
              v-if="sessionResults.length > 0"
              class="absolute left-0 right-0 top-full mt-1 z-10 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-lg py-1 max-h-48 overflow-y-auto"
            >
              <button
                v-for="r in sessionResults"
                :key="r.provider + r.sessionId"
                class="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                @click="addSession(r)"
              >
                <span
                  class="h-1.5 w-1.5 rounded-full shrink-0"
                  :class="r.provider === 'claude' ? 'bg-amber-400' : 'bg-emerald-400'"
                />
                <span class="truncate">{{ r.label }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="px-4 py-3 border-t border-zinc-100 dark:border-zinc-900 flex justify-end gap-2">
        <button
          class="px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          @click="emit('close')"
        >Cancel</button>
        <button
          class="px-3 py-1.5 rounded-md bg-violet-600 text-white text-sm hover:bg-violet-500 disabled:opacity-50"
          :disabled="saving"
          @click="save"
        >{{ saving ? 'Saving…' : props.task ? 'Save' : 'Create' }}</button>
      </div>
    </div>
  </div>
</template>
