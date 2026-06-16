import { describe, it, expect } from 'vitest';
import { normalizeMeta, MAX_DISPLAY_NAME } from '../src/meta';

describe('normalizeMeta', () => {
  it('trims the display name', () => {
    expect(normalizeMeta({ displayName: '  Billing work  ' }).displayName).toBe('Billing work');
  });

  it('treats empty / whitespace-only names as cleared (null)', () => {
    expect(normalizeMeta({ displayName: '' }).displayName).toBeNull();
    expect(normalizeMeta({ displayName: '   ' }).displayName).toBeNull();
    expect(normalizeMeta({ displayName: undefined }).displayName).toBeNull();
  });

  it('truncates an over-long name to the max length', () => {
    const long = 'x'.repeat(MAX_DISPLAY_NAME + 50);
    expect(normalizeMeta({ displayName: long }).displayName).toHaveLength(MAX_DISPLAY_NAME);
  });

  it('keeps a valid palette color', () => {
    expect(normalizeMeta({ color: 'amber' }).color).toBe('amber');
  });

  it('rejects an unknown color (→ null)', () => {
    expect(normalizeMeta({ color: 'chartreuse' as any }).color).toBeNull();
    expect(normalizeMeta({ color: '#ff0000' as any }).color).toBeNull();
    expect(normalizeMeta({ color: undefined }).color).toBeNull();
  });
});
