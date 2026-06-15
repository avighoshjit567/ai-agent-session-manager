import { ref } from 'vue';

// Singleton open-state for the global command palette, shared between the header
// trigger button and the ⌘K / Ctrl+K keyboard shortcut.
const isOpen = ref(false);
let shortcutAttached = false;

function onKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    isOpen.value = !isOpen.value;
  }
}

export function useCommandPalette() {
  function open() {
    isOpen.value = true;
  }
  function close() {
    isOpen.value = false;
  }
  // Attach the global shortcut exactly once (call from the root component).
  function attachShortcut() {
    if (shortcutAttached || typeof window === 'undefined') return;
    shortcutAttached = true;
    window.addEventListener('keydown', onKeydown);
  }
  return { isOpen, open, close, attachShortcut };
}
