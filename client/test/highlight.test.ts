import { describe, it, expect } from 'vitest';
import { highlightSnippet } from '../src/lib/highlight';

const S = String.fromCharCode(2);
const E = String.fromCharCode(3);

describe('highlightSnippet', () => {
  it('returns empty string when there is no highlight sentinel', () => {
    expect(highlightSnippet('plain text')).toBe('');
    expect(highlightSnippet(null)).toBe('');
    expect(highlightSnippet(undefined)).toBe('');
  });

  it('wraps sentinel-marked terms in <mark> tags', () => {
    const out = highlightSnippet(`use ${S}redis${E} cache`);
    expect(out).toContain('<mark');
    expect(out).toContain('redis');
    expect(out).toContain('</mark>');
  });

  it('escapes HTML in the surrounding content (no injection)', () => {
    const out = highlightSnippet(`<img src=x> ${S}hit${E}`);
    expect(out).toContain('&lt;img src=x&gt;');
    expect(out).not.toContain('<img');
  });
});
