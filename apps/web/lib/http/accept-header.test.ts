import { describe, expect, it } from 'vitest';
import { negotiateAccept } from '@/lib/http/accept-header';

describe('negotiateAccept', () => {
  it('prefers markdown when Accept names text/markdown with a higher q', () => {
    expect(negotiateAccept('text/markdown')).toBe('markdown');
    expect(negotiateAccept('text/markdown, text/html;q=0.9')).toBe('markdown');
  });

  it('keeps HTML for browsers and unspecified Accept', () => {
    expect(negotiateAccept(null)).toBe('html');
    expect(negotiateAccept('')).toBe('html');
    expect(negotiateAccept('*/*')).toBe('html');
    expect(negotiateAccept('text/html,application/xhtml+xml')).toBe('html');
    expect(negotiateAccept('text/html, text/markdown;q=0.8')).toBe('html');
  });

  it('returns not-acceptable when no HTML or markdown range is allowed', () => {
    expect(negotiateAccept('application/json')).toBe('not-acceptable');
    expect(negotiateAccept('image/png')).toBe('not-acceptable');
    expect(negotiateAccept('text/markdown;q=0')).toBe('not-acceptable');
  });
});
