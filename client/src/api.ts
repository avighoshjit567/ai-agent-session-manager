import type {
  Session,
  SessionListItem,
  TimelineItem,
  ProjectSummary,
  Note,
  Provider,
  SessionFilter,
  AppSettings,
} from '@shared/types';

const BASE = '';

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
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
    http<{ ok: true }>(`/api/sessions/${provider}/${sessionId}/open-terminal`, { method: 'POST' }),
};
