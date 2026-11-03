import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ipLimit: vi.fn(),
  globalLimit: vi.fn(),
  track: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit/limiters', () => ({
  anonymousOnboardingChatUnverifiedIpLimiter: { limit: mocks.ipLimit },
  anonymousOnboardingChatUnverifiedGlobalLimiter: { limit: mocks.globalLimit },
}));
vi.mock('@/lib/server-analytics', () => ({ trackServerEvent: mocks.track }));

import {
  admitUnverifiedOnboardingStart,
  classifyBotCheckClient,
  recordOnboardingBotCheck,
} from './onboarding-bot-check.server';

const IG_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0';
const TIKTOK_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 musical_ly_2023';
const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const HEADLESS =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0 Safari/537.36';

describe('classifyBotCheckClient', () => {
  it.each([
    [IG_IOS, 'iab_instagram'],
    [TIKTOK_ANDROID, 'iab_tiktok'],
    [IOS_SAFARI, 'ios_safari'],
    [HEADLESS, 'headless'],
    ['curl/8.1', 'bot'],
    ['', 'unknown'],
  ])('classifies %s', (ua, expected) => {
    expect(classifyBotCheckClient(ua)).toBe(expected);
  });
});

describe('admitUnverifiedOnboardingStart', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.ipLimit.mockResolvedValue({ success: true });
    mocks.globalLimit.mockResolvedValue({ success: true });
    mocks.track.mockResolvedValue({ ok: true });
  });

  it('admits within both budgets', async () => {
    await expect(admitUnverifiedOnboardingStart('1.2.3.4')).resolves.toEqual({
      admitted: true,
      reason: 'admitted',
    });
  });

  it('denies on the per-IP budget without spending the global one', async () => {
    mocks.ipLimit.mockResolvedValue({ success: false });
    await expect(admitUnverifiedOnboardingStart('1.2.3.4')).resolves.toEqual({
      admitted: false,
      reason: 'ip_budget',
    });
    expect(mocks.globalLimit).not.toHaveBeenCalled();
  });

  it('denies on the global cost ceiling', async () => {
    mocks.globalLimit.mockResolvedValue({ success: false });
    await expect(admitUnverifiedOnboardingStart('1.2.3.4')).resolves.toEqual({
      admitted: false,
      reason: 'global_budget',
    });
  });

  it('fails closed when the limiter store is down', async () => {
    mocks.ipLimit.mockResolvedValue({ success: false, unavailable: true });
    await expect(admitUnverifiedOnboardingStart('1.2.3.4')).resolves.toEqual({
      admitted: false,
      reason: 'limiter_unavailable',
    });
  });

  it('records the outcome by client class, never the raw user agent', () => {
    recordOnboardingBotCheck({
      outcome: 'degraded',
      reason: 'client_error',
      clientStatus: 'error',
      userAgent: IG_IOS,
    });
    expect(mocks.track).toHaveBeenCalledWith('onboarding_bot_check', {
      result: 'degraded',
      reason: 'client_error',
      client_status: 'error',
      ua_class: 'iab_instagram',
    });
  });
});
