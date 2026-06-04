import { describe, it, expect } from 'vitest';
import { visibleTimelineItems } from '../src/lib/timeline';
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
