import { describe, it, expect } from 'vitest';
import { deriveTitle, cleanForTitle, capWords, capBody } from '../src/extract';

describe('cleanForTitle', () => {
  it('strips system-reminder noise and takes the first non-empty line', () => {
    const raw = '<system-reminder>do X</system-reminder>\n\n  Fix the billing bug  \nmore text';
    expect(cleanForTitle(raw)).toBe('Fix the billing bug');
  });

  it('collapses internal whitespace', () => {
    expect(cleanForTitle('hello    world')).toBe('hello world');
  });

  it('returns empty string for null/empty', () => {
    expect(cleanForTitle(null)).toBe('');
    expect(cleanForTitle('')).toBe('');
  });
});

describe('capWords', () => {
  it('returns text unchanged when under the cap', () => {
    expect(capWords('short title', 80)).toBe('short title');
  });

  it('truncates on a word boundary with an ellipsis', () => {
    const long = 'this is a very long title that keeps going well beyond the eighty character cap limit here';
    const out = capWords(long, 80);
    expect(out.length).toBeLessThanOrEqual(81); // 80 + ellipsis char
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/); // no trailing space before ellipsis
  });
});

describe('deriveTitle', () => {
  it('prefers a real ai-title', () => {
    expect(deriveTitle('Refactor auth', 'please refactor the auth module')).toBe('Refactor auth');
  });

  it('falls back to the cleaned first user message', () => {
    expect(deriveTitle(null, '<system-reminder>x</system-reminder>\nSet up SSL redirect')).toBe('Set up SSL redirect');
  });

  it('returns null when nothing usable remains', () => {
    expect(deriveTitle('  ', '<system-reminder>only noise</system-reminder>')).toBeNull();
  });
});

describe('capBody', () => {
  it('truncates to the max length', () => {
    expect(capBody('a'.repeat(10), 4)).toBe('aaaa');
  });
  it('returns empty for empty input', () => {
    expect(capBody('', 4)).toBe('');
  });
});
