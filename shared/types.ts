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
  // User overlay metadata (stored in the app DB, never in the source files).
  // Custom name shown instead of the title; color is a palette key (see SESSION_COLORS).
  displayName: string | null;
  color: SessionColor | null;
  bookmarked: boolean;
}

// Curated palette for per-session color labels. Stored as a key so it can be
// themed for light/dark on the client. `null` / absent means "no color".
export const SESSION_COLORS = [
  'slate',
  'red',
  'amber',
  'green',
  'sky',
  'violet',
  'pink',
  'gray',
] as const;
export type SessionColor = (typeof SESSION_COLORS)[number];

export interface SessionMeta {
  provider: Provider;
  sessionId: string;
  displayName: string | null;
  color: SessionColor | null;
  bookmarked: boolean;
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
  bookmarked?: boolean;
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

export type TerminalApp = 'Terminal' | 'iTerm' | 'Warp';

export interface AppSettings {
  editorCommand: string;
  terminalApp: TerminalApp;
}

export interface DailyRecap {
  date: string; // 'YYYY-MM-DD' (server local day being recapped)
  content: string; // markdown recap (generated, then user-editable)
  sessionIds: string[]; // "provider:sessionId" included at generation time
  model: string | null;
  generatedAt: string;
  editedAt: string | null;
}

export interface RecapSessionPreview {
  provider: Provider;
  sessionId: string;
  name: string;
  projectPath: string | null;
  gitBranch: string | null;
  messageCount: number;
  toolCallCount: number;
}

export interface RecapDay {
  date: string;
  recap: DailyRecap | null;
  sessions: RecapSessionPreview[];
}

export interface RecapHistoryItem {
  date: string;
  generatedAt: string;
  editedAt: string | null;
}

// ---- Kanban task board ----

export const TASK_COLUMNS = ['backlog', 'todo', 'in_progress', 'done'] as const;
export type TaskColumn = (typeof TASK_COLUMNS)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface TaskSessionRef {
  provider: Provider;
  sessionId: string;
  // Resolved for display when listing: session_meta.display_name, else the
  // session title, else null (client falls back to a shortened id).
  name?: string | null;
}

export interface TaskImage {
  id: number;
  taskId: number;
  url: string; // served by the app: /api/task-images/<filename>
  filename: string;
  originalName: string | null;
  size: number;
  createdAt: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  column: TaskColumn;
  position: number;
  priority: TaskPriority;
  tags: string[];
  dueDate: string | null; // YYYY-MM-DD
  projectPath: string | null;
  createdAt: string;
  updatedAt: string;
  sessions: TaskSessionRef[];
  images: TaskImage[];
}
