import { describe, it, expect } from 'vitest';
import { linkifyText, shortenUrl, stripUrls, countUrls } from '../src/lib/linkify';

describe('stripUrls / countUrls', () => {
  it('removes URLs and collapses leftover spaces', () => {
    expect(stripUrls('PR https://github.com/x/y/pull/1 ready')).toBe('PR ready');
    expect(stripUrls('https://a.com https://b.com')).toBe('');
  });

  it('counts URLs', () => {
    expect(countUrls('no links')).toBe(0);
    expect(countUrls('https://a.com and https://b.com')).toBe(2);
    expect(countUrls(null)).toBe(0);
  });
});

describe('shortenUrl', () => {
  it('strips the protocol and truncates long URLs', () => {
    expect(shortenUrl('https://github.com/org/repo/pull/123')).toBe('github.com/org/repo/pull/123');
    const long = 'https://example.com/' + 'a'.repeat(100);
    expect(shortenUrl(long).length).toBeLessThanOrEqual(61); // 60 + ellipsis
    expect(shortenUrl(long).endsWith('…')).toBe(true);
  });
});

describe('linkifyText', () => {
  it('returns empty string for empty input', () => {
    expect(linkifyText('')).toBe('');
    expect(linkifyText(null)).toBe('');
    expect(linkifyText(undefined)).toBe('');
  });

  it('escapes HTML in plain text', () => {
    expect(linkifyText('a <b> & c')).toBe('a &lt;b&gt; &amp; c');
  });

  it('converts a URL into a new-tab anchor', () => {
    const out = linkifyText('see https://github.com/org/repo/pull/42 please');
    expect(out).toContain('<a href="https://github.com/org/repo/pull/42"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('>github.com/org/repo/pull/42</a>');
    expect(out.startsWith('see ')).toBe(true);
    expect(out.endsWith(' please')).toBe(true);
  });

  it('handles multiple links and preserves newlines as <br>', () => {
    const out = linkifyText('PR: https://github.com/x/y/pull/1\nDocs: http://docs.example.com');
    expect(out.match(/<a /g)).toHaveLength(2);
    expect(out).toContain('<br>');
  });

  it('does not let a malicious URL inject markup', () => {
    const out = linkifyText('https://evil.com/"><script>alert(1)</script>');
    expect(out).not.toContain('<script>');
  });

  it('excludes trailing punctuation from the link', () => {
    const out = linkifyText('read https://example.com/docs.');
    expect(out).toContain('href="https://example.com/docs"');
    expect(out.endsWith('.')).toBe(true);
  });

  it('ignores non-http schemes', () => {
    expect(linkifyText('javascript:alert(1)')).toBe('javascript:alert(1)');
  });
});
