import { describe, expect, it } from 'vitest';
import {
  ensureVaryAccept,
  MARKDOWN_CONTENT_TYPE,
  prefersMarkdown,
} from '@/lib/http/accept-markdown';

describe('prefersMarkdown', () => {
  it('does not prefer Markdown when Accept is missing', () => {
    expect(prefersMarkdown(null)).toBe(false);
    expect(prefersMarkdown('')).toBe(false);
    expect(prefersMarkdown('   ')).toBe(false);
  });

  it('prefers Markdown for an exact text/markdown Accept', () => {
    expect(prefersMarkdown('text/markdown')).toBe(true);
    expect(prefersMarkdown('text/markdown; charset=utf-8')).toBe(true);
  });

  it('keeps HTML for a typical browser Accept list', () => {
    expect(
      prefersMarkdown(
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
      )
    ).toBe(false);
  });

  it('honors q-values when Markdown outranks HTML', () => {
    expect(prefersMarkdown('text/markdown, text/html;q=0.8')).toBe(true);
    expect(prefersMarkdown('text/html;q=0.1, text/markdown;q=0.9')).toBe(true);
  });

  it('honors q-values when HTML outranks Markdown', () => {
    expect(prefersMarkdown('text/html, text/markdown;q=0.9')).toBe(false);
    expect(prefersMarkdown('text/markdown;q=0.2, text/html;q=0.8')).toBe(false);
  });

  it('treats q=0 as not acceptable', () => {
    expect(prefersMarkdown('text/markdown;q=0')).toBe(false);
    expect(prefersMarkdown('text/markdown;q=0, text/html')).toBe(false);
    expect(prefersMarkdown('text/html;q=0, text/markdown')).toBe(true);
  });

  it('does not let */* or text/* alone flip the homepage to Markdown', () => {
    expect(prefersMarkdown('*/*')).toBe(false);
    expect(prefersMarkdown('text/*')).toBe(false);
    expect(prefersMarkdown('text/*, */*;q=0.8')).toBe(false);
  });

  it('prefers explicit Markdown over a wildcard HTML fallback', () => {
    expect(prefersMarkdown('text/markdown, */*;q=0.8')).toBe(true);
    expect(prefersMarkdown('text/markdown, text/*;q=0.5')).toBe(true);
  });
});

describe('ensureVaryAccept', () => {
  it('sets Vary to Accept when missing', () => {
    const headers = new Headers();
    ensureVaryAccept(headers);
    expect(headers.get('Vary')).toBe('Accept');
  });

  it('appends Accept without duplicating it', () => {
    const headers = new Headers({ Vary: 'Accept-Encoding' });
    ensureVaryAccept(headers);
    ensureVaryAccept(headers);
    expect(headers.get('Vary')).toBe('Accept-Encoding, Accept');
  });

  it('exports the standards-compliant Markdown content type', () => {
    expect(MARKDOWN_CONTENT_TYPE).toBe('text/markdown; charset=utf-8');
  });
});
