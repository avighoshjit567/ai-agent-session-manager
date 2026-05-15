import { computed, ref, watch } from 'vue';

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ccsm.theme';
const mql =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

function readStored(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'system';
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
}

const mode = ref<ThemeMode>(readStored());

function effectiveIsDark(m: ThemeMode): boolean {
  if (m === 'dark') return true;
  if (m === 'light') return false;
  return mql?.matches ?? true;
}

function apply(m: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const dark = effectiveIsDark(m);
  document.documentElement.classList.toggle('dark', dark);
}

// Apply current mode immediately when the module loads to prevent FOUC.
apply(mode.value);

watch(mode, (m) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, m);
  }
  apply(m);
});

// React to OS-level changes when in 'system' mode.
if (mql) {
  const onChange = () => {
    if (mode.value === 'system') apply('system');
  };
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange);
  } else if (typeof (mql as any).addListener === 'function') {
    (mql as any).addListener(onChange);
  }
}

const isDark = computed(() => effectiveIsDark(mode.value));

export function useTheme() {
  return {
    mode,
    isDark,
    setMode(m: ThemeMode) {
      mode.value = m;
    },
  };
}
