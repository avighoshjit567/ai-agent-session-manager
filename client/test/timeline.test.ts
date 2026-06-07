import { describe, it, expect } from 'vitest';
import { visibleTimelineItems, groupTimelineItems } from '../src/lib/timeline';
import type { TimelineItem } from '@shared/types';

function item(type: TimelineItem['type'], id: string): TimelineItem {
  return { id, provider: 'claude', sessionId: 's', type, timestamp: null, content: 'x' };
}

describe('visibleTimelineItems', () => {
  it('keeps user, assistant, and metadata items', () => {
    const items = [item('user', '1'), item('assistant', '2'), item('metadata', '3')];
    expect(visibleTimelineItems(items).map((i) => i.id)).toEqual(['1', '2', '3']);
  });

  it('removes tool_call, tool_result, reasoning, and system items', () => {
    const items = [
      item('user', '1'),
      item('tool_call', '2'),
      item('tool_result', '3'),
      item('reasoning', '4'),
      item('system', '5'),
      item('assistant', '6'),
    ];
    expect(visibleTimelineItems(items).map((i) => i.id)).toEqual(['1', '6']);
  });
});

describe('groupTimelineItems', () => {
  it('merges consecutive same-role items into one group', () => {
    const items = [
      item('user', '1'),
      item('assistant', '2'),
      item('assistant', '3'),
      item('assistant', '4'),
      item('user', '5'),
      item('assistant', '6'),
    ];
    const groups = groupTimelineItems(items);
    expect(groups.map((g) => ({ type: g.type, ids: g.items.map((i) => i.id) }))).toEqual([
      { type: 'user', ids: ['1'] },
      { type: 'assistant', ids: ['2', '3', '4'] },
      { type: 'user', ids: ['5'] },
      { type: 'assistant', ids: ['6'] },
    ]);
  });

  it('filters out hidden item types before grouping', () => {
    const items = [
      item('user', '1'),
      item('tool_call', '2'),
      item('assistant', '3'),
      item('tool_result', '4'),
      item('assistant', '5'),
    ];
    const groups = groupTimelineItems(items);
    expect(groups.map((g) => ({ type: g.type, ids: g.items.map((i) => i.id) }))).toEqual([
      { type: 'user', ids: ['1'] },
      { type: 'assistant', ids: ['3', '5'] },
    ]);
  });

  it('keeps each metadata divider as its own group, breaking runs', () => {
    const items = [
      item('assistant', '1'),
      item('metadata', '2'),
      item('assistant', '3'),
    ];
    const groups = groupTimelineItems(items);
    expect(groups.map((g) => g.type)).toEqual(['assistant', 'metadata', 'assistant']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['1']);
  });

  it('uses the first item id as the group key', () => {
    const groups = groupTimelineItems([item('assistant', 'a'), item('assistant', 'b')]);
    expect(groups[0].key).toBe('a');
  });
});
