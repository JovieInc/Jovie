import { describe, expect, it } from 'vitest';
import { ensureVaryAccept, negotiateAccept } from '@/lib/http/accept-header';

describe('negotiateAccept', () => {
  it('prefers markdown when Accept names text/markdown with a higher q', () => {
    expect(negotiateAccept('text/markdown')).toBe('markdown');
    expect(negotiateAccept('text/markdown; charset=utf-8')).toBe('markdown');
    expect(negotiateAccept('text/markdown, text/html;q=0.9')).toBe('markdown');
    expect(negotiateAccept('text/html;q=0.1, text/markdown;q=0.9')).toBe(
      'markdown'
    );
  });

  it('keeps HTML for browsers and unspecified Accept', () => {
    expect(negotiateAccept(null)).toBe('html');
    expect(negotiateAccept('')).toBe('html');
    expect(negotiateAccept('*/*')).toBe('html');
    expect(negotiateAccept('text/*')).toBe('html');
    expect(negotiateAccept('text/*, */*;q=0.8')).toBe('html');
    expect(negotiateAccept('text/html,application/xhtml+xml')).toBe('html');
    expect(negotiateAccept('text/html, text/markdown;q=0.8')).toBe('html');
    expect(
      negotiateAccept(
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
      )
    ).toBe('html');
  });

  it('prefers explicit markdown over a wildcard HTML fallback', () => {
    expect(negotiateAccept('text/markdown, */*;q=0.8')).toBe('markdown');
    expect(negotiateAccept('text/markdown, text/*;q=0.5')).toBe('markdown');
  });

  it('returns not-acceptable when no HTML or markdown range is allowed', () => {
    expect(negotiateAccept('application/json')).toBe('not-acceptable');
    expect(negotiateAccept('image/png')).toBe('not-acceptable');
    expect(negotiateAccept('text/markdown;q=0')).toBe('not-acceptable');
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
});
