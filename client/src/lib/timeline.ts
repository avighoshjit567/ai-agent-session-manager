import type { TimelineItem } from '@shared/types';

// The clean detail view shows only the human/assistant conversation, plus the
// thin metadata dividers that mark session/compaction boundaries. Tool calls,
// tool results, reasoning, and system items are intentionally hidden here
// (the Markdown export still includes tool outputs when requested).
const VISIBLE: ReadonlySet<TimelineItem['type']> = new Set([
  'user',
  'assistant',
  'metadata',
]);

export function visibleTimelineItems(items: TimelineItem[]): TimelineItem[] {
  return items.filter((it) => VISIBLE.has(it.type));
}
