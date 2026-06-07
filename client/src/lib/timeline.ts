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

export interface TimelineGroup {
  key: string;
  type: TimelineItem['type'];
  items: TimelineItem[];
}

// Collapse the visible timeline into groups so one logical turn renders as a
// single bubble. Consecutive user (or assistant) messages merge into one group;
// metadata dividers are never merged — each stays on its own and breaks a run.
export function groupTimelineItems(items: TimelineItem[]): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  for (const it of visibleTimelineItems(items)) {
    const last = groups[groups.length - 1];
    if (last && last.type === it.type && it.type !== 'metadata') {
      last.items.push(it);
    } else {
      groups.push({ key: it.id, type: it.type, items: [it] });
    }
  }
  return groups;
}
