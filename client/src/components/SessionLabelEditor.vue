<script setup lang="ts">
import { ref } from 'vue';
import { SESSION_COLORS, type Provider, type SessionColor } from '@shared/types';
import { api } from '../api';
import { swatchClass } from '../lib/sessionColor';
import { useToast } from '../composables/useToast';

const props = defineProps<{
  provider: Provider;
  sessionId: string;
  displayName: string | null;
  color: SessionColor | null;
}>();

const emit = defineEmits<{
  (e: 'saved', meta: { displayName: string | null; color: SessionColor | null }): void;
  (e: 'close'): void;
}>();

const toast = useToast();
const name = ref(props.displayName ?? '');
const color = ref<SessionColor | null>(props.color);
const saving = ref(false);

async function save() {
  saving.value = true;
  try {
    const meta = await api.saveMeta(props.provider, props.sessionId, {
      displayName: name.value,
      color: color.value,
    });
    emit('saved', { displayName: meta.displayName, color: meta.color });
    emit('close');
  } catch (e: any) {
    toast.error(e?.message ?? 'Failed to save');
  } finally {
    saving.value = false;
  }
}

function clearAll() {
  name.value = '';
  color.value = null;
}
</script>

<template>
  <div
    class="w-64 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl p-3 space-y-3"
    @click.stop
    @keydown.esc.stop="emit('close')"
  >
    <div>
      <label class="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Name</label>
      <input
        v-model="name"
        type="text"
        maxlength="120"
        placeholder="Custom session name…"
        class="w-full px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
        @keydown.enter="save"
      />
    </div>

    <div>
      <label class="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Color</label>
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          title="No color"
          class="h-5 w-5 rounded-full border border-zinc-300 dark:border-zinc-600 flex items-center justify-center"
          :class="color === null ? 'ring-2 ring-offset-1 ring-zinc-400 dark:ring-offset-zinc-900' : ''"
          @click="color = null"
        >
          <span class="block h-0.5 w-3 rotate-45 bg-zinc-400" />
        </button>
        <button
          v-for="c in SESSION_COLORS"
          :key="c"
          type="button"
          :title="c"
          class="h-5 w-5 rounded-full"
          :class="[swatchClass(c), color === c ? 'ring-2 ring-offset-1 ring-zinc-400 dark:ring-offset-zinc-900' : '']"
          @click="color = c"
        />
      </div>
    </div>

    <div class="flex items-center justify-between pt-1">
      <button
        type="button"
        class="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        @click="clearAll"
      >Clear</button>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="text-[11px] px-2 py-1 rounded text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          @click="emit('close')"
        >Cancel</button>
        <button
          type="button"
          class="text-[11px] px-2.5 py-1 rounded bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-50"
          :disabled="saving"
          @click="save"
        >{{ saving ? 'Saving…' : 'Save' }}</button>
      </div>
    </div>
  </div>
</template>
