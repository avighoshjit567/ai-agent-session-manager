<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { useCommandPalette } from '../composables/useCommandPalette';
import { buildSections, flatten, type Command } from '../lib/commandPalette';
import type { ProjectSummary, SessionListItem } from '@shared/types';

const router = useRouter();
const { isOpen, close } = useCommandPalette();

const query = ref('');
const projects = ref<ProjectSummary[]>([]);
const projectsLoaded = ref(false);
const sessions = ref<SessionListItem[]>([]);
const loadingSessions = ref(false);
const activeIndex = ref(0);

const inputEl = ref<HTMLInputElement | null>(null);
let restoreFocusTo: HTMLElement | null = null;

const sections = computed(() =>
  buildSections({ q: query.value, projects: projects.value, sessions: sessions.value }),
);
const flat = computed(() => flatten(sections.value));
// id → flat index, so each rendered row knows its keyboard position.
const indexById = computed(() => {
  const m = new Map<string, number>();
  flat.value.forEach((c, i) => m.set(c.id, i));
  return m;
});

watch(isOpen, async (open) => {
  if (open) {
    restoreFocusTo = (document.activeElement as HTMLElement) ?? null;
    query.value = '';
    sessions.value = [];
    activeIndex.value = 0;
    void ensureProjects();
    await nextTick();
    inputEl.value?.focus();
  } else {
    restoreFocusTo?.focus?.();
    restoreFocusTo = null;
  }
});

// Keep the active row in range as results change; reset to the top on new query.
watch(flat, (f) => {
  if (activeIndex.value > f.length - 1) activeIndex.value = Math.max(0, f.length - 1);
});

async function ensureProjects() {
  if (projectsLoaded.value) return;
  try {
    projects.value = await api.projects();
    projectsLoaded.value = true;
  } catch {
    // Palette still works with pages/sessions if this fails.
  }
}

let sessionReq = 0;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
watch(query, (q) => {
  activeIndex.value = 0;
  clearTimeout(debounceTimer);
  const term = q.trim();
  if (term.length < 2) {
    sessions.value = [];
    loadingSessions.value = false;
    return;
  }
  loadingSessions.value = true;
  debounceTimer = setTimeout(async () => {
    const token = ++sessionReq;
    try {
      const r = await api.sessions({ q: term, provider: 'all', limit: 8 });
      if (token === sessionReq) sessions.value = r.items;
    } catch {
      if (token === sessionReq) sessions.value = [];
    } finally {
      if (token === sessionReq) loadingSessions.value = false;
    }
  }, 150);
});

function activate(cmd: Command | undefined) {
  if (!cmd) return;
  close();
  router.push(cmd.to);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (flat.value.length) activeIndex.value = (activeIndex.value + 1) % flat.value.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (flat.value.length)
      activeIndex.value = (activeIndex.value - 1 + flat.value.length) % flat.value.length;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    activate(flat.value[activeIndex.value]);
  }
}

const noResults = computed(() => flat.value.length === 0);
</script>

<template>
  <Teleport to="body">
    <Transition name="palette">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] bg-black/40 backdrop-blur-sm"
        @click.self="close"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          class="w-full max-w-xl rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden"
          @keydown="onKeydown"
        >
          <div class="flex items-center gap-2.5 px-4 border-b border-zinc-200 dark:border-zinc-800">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4 text-zinc-400 shrink-0"
            >
              <path d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.35-4.35" />
            </svg>
            <input
              ref="inputEl"
              v-model="query"
              type="text"
              placeholder="Search sessions, projects, pages…"
              aria-label="Search query"
              class="flex-1 bg-transparent py-3.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 outline-none"
            />
            <span
              v-if="loadingSessions"
              class="text-[10px] uppercase tracking-wide text-zinc-400"
            >Searching…</span>
          </div>

          <div class="max-h-[55vh] overflow-y-auto py-1.5">
            <div v-if="noResults" class="px-4 py-8 text-center text-sm text-zinc-500">
              No results
            </div>

            <div v-for="section in sections" :key="section.group">
              <div
                v-if="section.heading"
                class="px-4 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400"
              >
                {{ section.heading }}
              </div>
              <button
                v-for="cmd in section.commands"
                :key="cmd.id"
                type="button"
                class="w-full flex items-center gap-2.5 px-4 py-2 text-left"
                :class="
                  indexById.get(cmd.id) === activeIndex
                    ? 'bg-zinc-100 dark:bg-zinc-800'
                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                "
                @mousemove="activeIndex = indexById.get(cmd.id) ?? activeIndex"
                @click="activate(cmd)"
              >
                <svg
                  v-if="cmd.icon"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="h-4 w-4 shrink-0 text-zinc-400"
                >
                  <path :d="cmd.icon" />
                </svg>
                <svg
                  v-else-if="cmd.group === 'action'"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="h-4 w-4 shrink-0 text-zinc-400"
                >
                  <path d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zM21 21l-4.35-4.35" />
                </svg>
                <span
                  v-else
                  class="h-1.5 w-1.5 rounded-full shrink-0 ml-1.5 mr-1"
                  :class="cmd.group === 'project' ? 'bg-sky-400' : 'bg-zinc-400'"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm text-zinc-900 dark:text-zinc-100">{{ cmd.label }}</span>
                  <span
                    v-if="cmd.sublabel"
                    class="block truncate text-xs text-zinc-500"
                  >{{ cmd.sublabel }}</span>
                </span>
              </button>
            </div>
          </div>

          <div
            class="flex items-center gap-3 px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 text-[10px] text-zinc-400"
          >
            <span><kbd class="font-sans">↑↓</kbd> navigate</span>
            <span><kbd class="font-sans">↵</kbd> open</span>
            <span><kbd class="font-sans">esc</kbd> close</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.palette-enter-active,
.palette-leave-active {
  transition: opacity 0.12s ease;
}
.palette-enter-from,
.palette-leave-to {
  opacity: 0;
}
</style>
