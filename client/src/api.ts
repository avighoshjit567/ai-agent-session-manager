import type {
  Session,
  SessionListItem,
  TimelineItem,
  ProjectSummary,
  Note,
  Provider,
  SessionFilter,
  AppSettings,
  SessionMeta,
  SessionColor,
  DailyRecap,
  RecapDay,
  RecapHistoryItem,
  Task,
  TaskColumn,
  TaskPriority,
} from '@shared/types';

export interface TaskInput {
  title?: string;
  description?: string;
  column?: TaskColumn;
  priority?: TaskPriority;
  tags?: string[];
  dueDate?: string | null;
  projectPath?: string | null;
}

const BASE = '';

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  // Only declare a JSON body when we actually send one — Fastify rejects a
  // bodyless POST that carries `content-type: application/json`.
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (init?.body !== undefined && headers['content-type'] === undefined) {
    headers['content-type'] = 'application/json';
  }
  const res = await fetch(BASE + url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = JSON.parse(text);
      if (body && typeof body.error === 'string') message = body.error;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  dashboard: () =>
    http<{
      totalSessions: number;
      claudeSessions: number;
      codexSessions: number;
      recent: Session[];
      active: Session[];
      topProjects: ProjectSummary[];
    }>('/api/dashboard'),

  projects: () => http<ProjectSummary[]>('/api/projects'),

  sessions: (filter: SessionFilter = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filter)) {
      if (v === undefined || v === '' || v === null) continue;
      params.set(k, String(v));
    }
    return http<{ items: SessionListItem[]; total: number }>(
      `/api/sessions${params.toString() ? '?' + params.toString() : ''}`,
    );
  },

  session: (provider: Provider, sessionId: string) =>
    http<Session>(`/api/sessions/${provider}/${sessionId}`),

  timeline: (provider: Provider, sessionId: string, mask = true) =>
    http<{ items: TimelineItem[] }>(
      `/api/sessions/${provider}/${sessionId}/timeline?mask=${mask ? 1 : 0}`,
    ),

  getNote: (provider: Provider, sessionId: string) =>
    http<Note>(`/api/notes/${provider}/${sessionId}`),

  saveNote: (provider: Provider, sessionId: string, note: Partial<Note>) =>
    http<Note>(`/api/notes/${provider}/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(note),
    }),

  exportSession: (
    provider: Provider,
    sessionId: string,
    opts: { includeToolOutputs?: boolean; maskSecrets?: boolean } = {},
  ) =>
    http<{ path: string; content: string }>(`/api/export/${provider}/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify(opts),
    }),

  reindex: (force = false) =>
    http<{ claudeSessions: number; codexSessions: number; errors: string[] }>(
      `/api/index?force=${force ? 1 : 0}`,
      { method: 'POST' },
    ),

  indexStatus: () =>
    http<{ running: boolean; last: any }>('/api/index/status'),

  getSettings: () => http<AppSettings>('/api/settings'),

  saveSettings: (p: Partial<AppSettings>) =>
    http<AppSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(p) }),

  openInEditor: (provider: Provider, sessionId: string) =>
    http<{ ok: true }>(`/api/sessions/${provider}/${sessionId}/open-editor`, { method: 'POST' }),

  openInTerminal: (provider: Provider, sessionId: string) =>
    http<{ ok: true; message?: string }>(`/api/sessions/${provider}/${sessionId}/open-terminal`, {
      method: 'POST',
    }),

  forkSession: (provider: Provider, sessionId: string) =>
    http<{ ok: true; message?: string }>(`/api/sessions/${provider}/${sessionId}/fork`, {
      method: 'POST',
    }),

  saveMeta: (
    provider: Provider,
    sessionId: string,
    meta: { displayName?: string | null; color?: SessionColor | null; bookmarked?: boolean },
  ) =>
    http<SessionMeta>(`/api/sessions/${provider}/${sessionId}/meta`, {
      method: 'PUT',
      body: JSON.stringify(meta),
    }),

  getRecapDay: (date: string) => http<RecapDay>(`/api/recap/${date}`),

  generateRecap: (date: string) =>
    http<{ recap: DailyRecap }>(`/api/recap/${date}/generate`, { method: 'POST' }),

  saveRecap: (date: string, content: string) =>
    http<{ recap: DailyRecap }>(`/api/recap/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  listRecaps: () => http<{ items: RecapHistoryItem[] }>(`/api/recaps`),

  tasks: (projectPath?: string) =>
    http<{ items: Task[] }>(
      `/api/tasks${projectPath ? '?projectPath=' + encodeURIComponent(projectPath) : ''}`,
    ),

  createTask: (input: TaskInput) =>
    http<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(input) }),

  updateTask: (id: number, patch: TaskInput) =>
    http<Task>(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),

  moveTask: (id: number, column: TaskColumn, position: number) =>
    http<Task>(`/api/tasks/${id}/move`, {
      method: 'PUT',
      body: JSON.stringify({ column, position }),
    }),

  deleteTask: (id: number) =>
    http<{ ok: true }>(`/api/tasks/${id}`, { method: 'DELETE' }),

  setTaskSessions: (id: number, sessions: Array<{ provider: Provider; sessionId: string }>) =>
    http<Task>(`/api/tasks/${id}/sessions`, {
      method: 'PUT',
      body: JSON.stringify({ sessions }),
    }),

  sessionTasks: (provider: Provider, sessionId: string) =>
    http<{ items: Task[] }>(`/api/sessions/${provider}/${sessionId}/tasks`),
};
