import { describe, expect, it } from 'vitest';
import { resolveMarketingAuthPrefetch } from './authEntryPrefetch';

describe('marketing auth-entry prefetch', () => {
  it.each([
    '/signup',
    '/signin',
    '/start',
    '/signup?redirect=/app',
    '/start#claim',
  ])('defers dynamic auth work until visitor intent for %s', href =>
    expect(resolveMarketingAuthPrefetch(href)).toBe(false)
  );

  it.each([
    '/pricing',
    '/support',
    '/signup-news',
    '/start/other',
    'https://example.com/signup',
  ])('preserves ordinary destination prefetch for %s', href =>
    expect(resolveMarketingAuthPrefetch(href)).toBeUndefined()
  );

  it('preserves an explicit prefetch choice', () => {
    expect(resolveMarketingAuthPrefetch('/signup', true)).toBe(true);
    expect(resolveMarketingAuthPrefetch('/pricing', false)).toBe(false);
  });
});
