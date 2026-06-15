import type { RouteLocationRaw } from 'vue-router';
import type { ProjectSummary, SessionListItem } from '@shared/types';

// A single selectable entry in the command palette. `to` is the route to push
// when activated. Keeping this a plain data shape (no Vue refs) makes the
// build/filter logic pure and unit-testable.
export type CommandGroup = 'action' | 'page' | 'project' | 'session';

export interface Command {
  id: string;
  group: CommandGroup;
  label: string;
  sublabel?: string;
  to: RouteLocationRaw;
  icon?: string; // SVG path data, for page commands
}

export interface CommandSection {
  group: CommandGroup;
  heading: string;
  commands: Command[];
}

// Static navigation targets. Icons mirror the sidebar's SVG paths.
export const PAGE_COMMANDS: Command[] = [
  {
    id: 'page:dashboard',
    group: 'page',
    label: 'Dashboard',
    to: { name: 'dashboard' },
    icon: 'M3 12l9-9 9 9M5 10v10h14V10',
  },
  {
    id: 'page:projects',
    group: 'page',
    label: 'Projects',
    to: { name: 'projects' },
    icon: 'M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
  },
  {
    id: 'page:sessions',
    group: 'page',
    label: 'Sessions',
    to: { name: 'sessions' },
    icon: 'M4 6h16M4 12h16M4 18h10',
  },
  {
    id: 'page:settings',
    group: 'page',
    label: 'Settings',
    to: { name: 'settings' },
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  },
];

function norm(s: string): string {
  return s.trim().toLowerCase();
}

export function filterPages(query: string): Command[] {
  const q = norm(query);
  if (!q) return PAGE_COMMANDS;
  return PAGE_COMMANDS.filter((c) => c.label.toLowerCase().includes(q));
}

// Projects only surface while the user is actively searching (empty query → []),
// since the empty palette is meant to be a short quick-nav list.
export function filterProjects(projects: ProjectSummary[], query: string, limit = 6): Command[] {
  const q = norm(query);
  if (!q) return [];
  return projects
    .filter((p) => p.projectPath.toLowerCase().includes(q))
    .sort((a, b) => {
      if (b.sessionCount !== a.sessionCount) return b.sessionCount - a.sessionCount;
      const ai = a.projectPath.toLowerCase().indexOf(q);
      const bi = b.projectPath.toLowerCase().indexOf(q);
      if (ai !== bi) return ai - bi;
      return a.projectPath.localeCompare(b.projectPath);
    })
    .slice(0, limit)
    .map((p) => ({
      id: `project:${p.projectPath}`,
      group: 'project' as const,
      label: p.projectPath,
      sublabel: `${p.sessionCount} session${p.sessionCount === 1 ? '' : 's'}`,
      to: { name: 'sessions', query: { projectPath: p.projectPath } },
    }));
}

function sessionLabel(s: SessionListItem): string {
  return s.title?.trim() || s.firstUserMessage?.trim() || 'Untitled session';
}

export function buildSessionCommands(items: SessionListItem[]): Command[] {
  return items.map((s) => ({
    id: `session:${s.provider}:${s.sessionId}`,
    group: 'session' as const,
    label: sessionLabel(s),
    sublabel: s.projectPath ?? s.gitBranch ?? undefined,
    to: { name: 'session-detail', params: { provider: s.provider, sessionId: s.sessionId } },
  }));
}

// The first result whenever the user has typed something: jump to the Sessions
// page with this query (the full-results view the old Search page provided).
export function searchAllCommand(query: string): Command | null {
  const q = query.trim();
  if (!q) return null;
  return {
    id: 'action:search-all',
    group: 'action',
    label: `Search all sessions for “${q}”`,
    to: { name: 'sessions', query: { q } },
  };
}

export interface BuildSectionsInput {
  q: string;
  projects: ProjectSummary[];
  sessions: SessionListItem[];
}

// Assemble the ordered, non-empty sections shown in the palette.
export function buildSections({ q, projects, sessions }: BuildSectionsInput): CommandSection[] {
  const sections: CommandSection[] = [];

  const action = searchAllCommand(q);
  if (action) sections.push({ group: 'action', heading: '', commands: [action] });

  const pages = filterPages(q);
  if (pages.length) sections.push({ group: 'page', heading: 'Pages', commands: pages });

  const projectCmds = filterProjects(projects, q);
  if (projectCmds.length) sections.push({ group: 'project', heading: 'Projects', commands: projectCmds });

  const sessionCmds = buildSessionCommands(sessions);
  if (sessionCmds.length) sections.push({ group: 'session', heading: 'Sessions', commands: sessionCmds });

  return sections;
}

// Flat list in display order — drives the active-index keyboard navigation.
export function flatten(sections: CommandSection[]): Command[] {
  return sections.flatMap((s) => s.commands);
}
