import { describe, expect, it } from 'vitest';
import { REPLAY_SESSION_SAMPLE_RATE } from '@/lib/sentry/config';
import {
  getReplaySessionSampleRate,
  isAutomatedBrowser,
  isGoldenPathRoute,
} from '@/lib/sentry/replay-policy';

describe('replay policy', () => {
  it.each([
    '/start',
    '/claim',
    '/claim/abc',
    '/signin',
    '/signup',
    '/auth/start',
    '/waitlist',
    '/onboarding',
    '/onboarding/checkout',
    '/billing/success',
    '/pricing',
  ])('buffers (never auto-records) on %s', path => {
    expect(isGoldenPathRoute(path)).toBe(true);
    expect(getReplaySessionSampleRate(path)).toBe(0);
  });

  it('keeps / out of replay', () => {
    expect(isGoldenPathRoute('/')).toBe(false);
    expect(getReplaySessionSampleRate('/')).toBe(0);
  });

  it('keeps returning-user dashboard sessions at the shared low rate', () => {
    expect(getReplaySessionSampleRate('/app/dashboard')).toBe(
      REPLAY_SESSION_SAMPLE_RATE
    );
  });

  it('loads no replay on profiles or other public pages', () => {
    expect(getReplaySessionSampleRate('/someartist')).toBe(0);
    expect(getReplaySessionSampleRate('/artists')).toBe(0);
    expect(getReplaySessionSampleRate('/startup-lookalike')).toBe(0);
  });

  it('skips automated browsers', () => {
    expect(
      isAutomatedBrowser({ userAgent: 'Mozilla/5.0 Chrome', webdriver: false })
    ).toBe(false);
    expect(
      isAutomatedBrowser({ userAgent: 'Mozilla/5.0 Chrome', webdriver: true })
    ).toBe(true);
    expect(
      isAutomatedBrowser({ userAgent: 'Googlebot/2.1', webdriver: false })
    ).toBe(true);
    expect(isAutomatedBrowser(undefined)).toBe(true);
  });
});
