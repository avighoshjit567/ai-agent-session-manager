import { describe, it, expect } from 'vitest';
import {
  PAGE_COMMANDS,
  filterPages,
  filterProjects,
  buildSessionCommands,
  searchAllCommand,
  buildSections,
  flatten,
} from '../src/lib/commandPalette';
import type { ProjectSummary, SessionListItem } from '@shared/types';

function project(path: string, sessionCount = 1): ProjectSummary {
  return { projectPath: path, sessionCount, latestUpdatedAt: null, providers: ['claude'], branches: [] };
}

function session(partial: Partial<SessionListItem>): SessionListItem {
  return {
    provider: 'claude',
    sessionId: 's1',
    title: null,
    projectPath: null,
    gitBranch: null,
    createdAt: null,
    updatedAt: null,
    firstUserMessage: null,
    sourcePath: '',
    archived: false,
    messageCount: 0,
    toolCallCount: 0,
    hasSubagents: false,
    hasTodos: false,
    model: null,
    tokensUsed: null,
    parentSessionId: null,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    cacheCreationTokens: null,
    lastContextTokens: null,
    contextWindow: null,
    ...partial,
  };
}

describe('filterPages', () => {
  it('returns all pages for an empty query', () => {
    expect(filterPages('')).toEqual(PAGE_COMMANDS);
    expect(filterPages('   ')).toEqual(PAGE_COMMANDS);
  });

  it('matches page labels case-insensitively', () => {
    const r = filterPages('set');
    expect(r).toHaveLength(1);
    expect(r[0].label).toBe('Settings');
  });

  it('returns nothing when no page matches', () => {
    expect(filterPages('zzz')).toEqual([]);
  });
});

describe('filterProjects', () => {
  const projects = [
    project('/Users/me/app-billing', 3),
    project('/Users/me/web-client', 9),
    project('/Users/me/billing-archive', 1),
  ];

  it('returns nothing for an empty query (projects only show when searching)', () => {
    expect(filterProjects(projects, '')).toEqual([]);
  });

  it('filters by path substring, case-insensitive', () => {
    const r = filterProjects(projects, 'BILLING');
    expect(r.map((c) => c.label)).toEqual(['/Users/me/app-billing', '/Users/me/billing-archive']);
  });

  it('ranks the most active (highest session count) projects first', () => {
    // all three contain "users/me"; tie broken by sessionCount desc
    const r = filterProjects(projects, 'users/me');
    expect(r[0].label).toBe('/Users/me/web-client'); // highest sessionCount
  });

  it('respects the limit', () => {
    expect(filterProjects(projects, 'users', 2)).toHaveLength(2);
  });

  it('targets the sessions route filtered by projectPath', () => {
    const r = filterProjects(projects, 'web-client');
    expect(r[0].to).toEqual({ name: 'sessions', query: { projectPath: '/Users/me/web-client' } });
    expect(r[0].group).toBe('project');
  });
});

describe('buildSessionCommands', () => {
  it('prefers title, then first message, then a fallback', () => {
    const r = buildSessionCommands([
      session({ sessionId: 'a', title: 'Fix SSL' }),
      session({ sessionId: 'b', title: null, firstUserMessage: 'Refactor billing' }),
      session({ sessionId: 'c', title: '   ', firstUserMessage: null }),
    ]);
    expect(r.map((c) => c.label)).toEqual(['Fix SSL', 'Refactor billing', 'Untitled session']);
  });

  it('builds a unique id and a session-detail route per provider+id', () => {
    const r = buildSessionCommands([session({ provider: 'codex', sessionId: 'xyz', title: 'T' })]);
    expect(r[0].id).toBe('session:codex:xyz');
    expect(r[0].group).toBe('session');
    expect(r[0].to).toEqual({ name: 'session-detail', params: { provider: 'codex', sessionId: 'xyz' } });
  });

  it('uses the project path as sublabel when present', () => {
    const r = buildSessionCommands([session({ title: 'T', projectPath: '/a/b' })]);
    expect(r[0].sublabel).toBe('/a/b');
  });
});

describe('searchAllCommand', () => {
  it('is null for an empty query', () => {
    expect(searchAllCommand('')).toBeNull();
    expect(searchAllCommand('  ')).toBeNull();
  });

  it('targets the sessions route with the trimmed query', () => {
    const c = searchAllCommand('  billing ')!;
    expect(c.group).toBe('action');
    expect(c.label).toContain('billing');
    expect(c.to).toEqual({ name: 'sessions', query: { q: 'billing' } });
  });
});

describe('buildSections / flatten', () => {
  const projects = [project('/Users/me/billing', 2)];
  const sessions = [session({ sessionId: 's', title: 'Billing fix' })];

  it('shows only pages for an empty query', () => {
    const sections = buildSections({ q: '', projects, sessions: [] });
    expect(sections.map((s) => s.group)).toEqual(['page']);
  });

  it('orders sections action, page, project, session and omits empty groups', () => {
    // 'project' matches the Projects page, the project path, and we pass a session
    const sections = buildSections({
      q: 'project',
      projects: [project('/Users/me/project-x', 2)],
      sessions: [session({ title: 'project cleanup' })],
    });
    expect(sections.map((s) => s.group)).toEqual(['action', 'page', 'project', 'session']);
    // 'billing' matches no page label → page group omitted; no projects/sessions either
    const sections2 = buildSections({ q: 'billing', projects: [], sessions: [] });
    expect(sections2.map((s) => s.group)).toEqual(['action']);
  });

  it('flatten returns every command in display order', () => {
    const sections = buildSections({ q: 'billing', projects, sessions });
    const flat = flatten(sections);
    expect(flat[0].group).toBe('action');
    expect(flat.at(-1)!.group).toBe('session');
    expect(flat).toHaveLength(sections.reduce((n, s) => n + s.commands.length, 0));
  });
});
