import { reactive } from 'vue';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
}

interface ToastState {
  items: Toast[];
}

const state = reactive<ToastState>({ items: [] });
let nextId = 1;

function push(message: string, kind: Toast['kind'] = 'info', ttl = 2200): void {
  const id = nextId++;
  state.items.push({ id, message, kind });
  setTimeout(() => {
    const idx = state.items.findIndex((t) => t.id === id);
    if (idx !== -1) state.items.splice(idx, 1);
  }, ttl);
}

export function useToast() {
  return {
    state,
    show: (msg: string) => push(msg, 'info'),
    success: (msg: string) => push(msg, 'success'),
    error: (msg: string) => push(msg, 'error'),
  };
}
