import { describe, expect, it } from 'vitest';
import { resolveMarketingAuthPrefetch } from './authEntryPrefetch';

describe('marketing auth-entry prefetch', () => {
  it.each([
    '/signup',
    '/signin',
    '/start',
    '/signup?redirect=/app',
    '/start#claim',
    '/app/chat',
    '/app/chat?q=Make%20me%20merch#review',
    '/waitlist',
    '/waitlist?from=invite#status',
  ])('defers dynamic auth work until visitor intent for %s', href =>
    expect(resolveMarketingAuthPrefetch(href)).toBe(false)
  );

  it.each([
    '/pricing',
    '/support',
    '/signup-news',
    '/start/other',
    '/app/chat-other',
    '/app/chat/other',
    '/waitlist/invite',
    '/waitlist-status',
    'https://example.com/app/chat',
    'https://example.com/signup',
  ])('preserves ordinary destination prefetch for %s', href =>
    expect(resolveMarketingAuthPrefetch(href)).toBeUndefined()
  );

  it.each([
    '/signup',
    '/app/chat?q=Make%20me%20merch',
    '/waitlist?from=invite',
  ])('preserves explicit prefetch choices for %s', href => {
    expect(resolveMarketingAuthPrefetch(href, true)).toBe(true);
    expect(resolveMarketingAuthPrefetch(href, false)).toBe(false);
  });

  it('preserves an explicit prefetch choice', () => {
    expect(resolveMarketingAuthPrefetch('/signup', true)).toBe(true);
    expect(resolveMarketingAuthPrefetch('/pricing', false)).toBe(false);
  });
});
