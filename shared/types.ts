export type Provider = 'claude' | 'codex';

export interface Session {
  provider: Provider;
  sessionId: string;
  title: string | null;
  projectPath: string | null;
  gitBranch: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  firstUserMessage: string | null;
  sourcePath: string;
  archived: boolean;
  messageCount: number;
  toolCallCount: number;
  hasSubagents: boolean;
  hasTodos: boolean;
  model: string | null;
  tokensUsed: number | null;
  parentSessionId: string | null;
  // Token usage (best-effort; may be null for sessions indexed before this feature)
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
  // Context size at the latest assistant turn (what you'd resume into).
  // For Claude this is input + cache_read + cache_creation of the last turn.
  // For Codex we leave this null when we can't infer per-turn context.
  lastContextTokens: number | null;
  // Model context window (e.g., 200000, 1000000). Best estimate.
  contextWindow: number | null;
}

export interface SessionListItem extends Session {
  // Highlighted FTS snippet of the body match, using  /  sentinels.
  // Present only for content search results; null otherwise.
  matchSnippet?: string | null;
}

export type TimelineItemType =
  | 'user'
  | 'assistant'
  | 'system'
  | 'tool_call'
  | 'tool_result'
  | 'reasoning'
  | 'metadata';

export interface TimelineItem {
  id: string;
  provider: Provider;
  sessionId: string;
  type: TimelineItemType;
  timestamp: string | null;
  content: string | null;
  toolName?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ProjectSummary {
  projectPath: string;
  sessionCount: number;
  latestUpdatedAt: string | null;
  providers: Provider[];
  branches: string[];
}

export interface DashboardStats {
  totalSessions: number;
  claudeSessions: number;
  codexSessions: number;
  recentSessions: Session[];
  activeSessions: Session[];
  topProjects: ProjectSummary[];
}

export interface SessionFilter {
  provider?: Provider | 'all';
  projectPath?: string;
  branch?: string;
  archived?: boolean;
  hasTools?: boolean;
  hasSubagents?: boolean;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface Note {
  provider: Provider;
  sessionId: string;
  status: 'none' | 'important' | 'follow-up' | 'archived' | 'lesson';
  tags: string[];
  summary: string;
  followUps: string;
  lessons: string;
  updatedAt: string;
}

export type TerminalApp = 'Terminal' | 'iTerm';

export interface AppSettings {
  editorCommand: string;
  terminalApp: TerminalApp;
}
