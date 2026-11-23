import { describe, expect, it } from 'vitest';
import {
  buildSandboxedHtmlDocument,
  META_REFRESH_PATTERN,
  VIEW_HTML_BLOCK_CSP,
} from '@/lib/views/html-sandbox';

describe('buildSandboxedHtmlDocument', () => {
  it('puts the no-network policy ahead of the block html', () => {
    const doc = buildSandboxedHtmlDocument('<img src="https://evil.test/x">');
    const cspAt = doc.indexOf('Content-Security-Policy');
    expect(cspAt).toBeGreaterThan(-1);
    expect(cspAt).toBeLessThan(doc.indexOf('<img'));
    expect(doc).toContain('name="referrer" content="no-referrer"');
  });

  it('allows no network source', () => {
    expect(VIEW_HTML_BLOCK_CSP).toContain("default-src 'none'");
    expect(VIEW_HTML_BLOCK_CSP).toContain('img-src data: blob:');
    expect(VIEW_HTML_BLOCK_CSP).not.toMatch(/https?:|'self'|\*/);
  });
});

describe('META_REFRESH_PATTERN', () => {
  it.each([
    '<meta http-equiv="refresh" content="0;url=https://x.test">',
    "<META HTTP-EQUIV='Refresh' content=0>",
    '<meta content="0" http-equiv = refresh>',
  ])('matches %s', html => {
    expect(META_REFRESH_PATTERN.test(html)).toBe(true);
  });

  it('ignores other meta tags', () => {
    expect(META_REFRESH_PATTERN.test('<meta charset="utf-8">')).toBe(false);
  });
});
