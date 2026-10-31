import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const limiterMocks = vi.hoisted(() => ({
  ip: vi.fn(),
  global: vi.fn(),
}));

vi.mock('@/lib/rate-limit/limiters', () => ({
  onboardingBotCheckIpLimiter: { limit: limiterMocks.ip },
  onboardingBotCheckGlobalLimiter: { limit: limiterMocks.global },
}));

const analyticsMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: analyticsMock,
}));

import {
  admitOnboardingUnverifiedFirstTouch,
  classifyOnboardingUserAgent,
} from './bot-check-budget.server';

function allow() {
  return {
    success: true,
    limit: 4,
    remaining: 3,
    reset: new Date(Date.now() + 60_000),
    backend: 'redis' as const,
  };
}

function deny(overrides: Record<string, unknown> = {}) {
  return {
    success: false,
    limit: 4,
    remaining: 0,
    reset: new Date(Date.now() + 60_000),
    reason: 'exceeded',
    backend: 'redis' as const,
    ...overrides,
  };
}

describe('admitOnboardingUnverifiedFirstTouch (JOV-10194)', () => {
  it('admits within budget, charging the IP key and the global key', async () => {
    limiterMocks.ip.mockResolvedValue(allow());
    limiterMocks.global.mockResolvedValue(allow());

    const result = await admitOnboardingUnverifiedFirstTouch({
      ip: '203.0.113.9',
      clientStatus: 'error',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) HeadlessChrome/141.0',
    });

    expect(result).toEqual({ admitted: true, reason: 'within_budget' });
    expect(limiterMocks.ip).toHaveBeenCalledWith('ip:203.0.113.9');
    expect(limiterMocks.global).toHaveBeenCalledWith('global');
    expect(analyticsMock).toHaveBeenCalledWith('onboarding_bot_check', {
      result: 'admitted',
      reason: 'within_budget',
      client_status: 'error',
      ua_class: 'headless_chrome',
    });
  });

  it('denies when the per-IP budget (4/hour) is spent', async () => {
    limiterMocks.ip.mockResolvedValue(deny());
    limiterMocks.global.mockResolvedValue(allow());

    const result = await admitOnboardingUnverifiedFirstTouch({
      ip: '198.51.100.7',
      clientStatus: 'loading',
      userAgent: null,
    });

    expect(result).toEqual({
      admitted: false,
      reason: 'ip_budget_exhausted',
    });
    // The global limiter is not consulted once the IP budget is spent.
    expect(limiterMocks.global).not.toHaveBeenCalled();
    expect(analyticsMock).toHaveBeenCalledWith('onboarding_bot_check', {
      result: 'denied',
      reason: 'ip_budget_exhausted',
      client_status: 'loading',
      ua_class: 'other',
    });
  });

  it('denies when the global budget (120/hour) is spent', async () => {
    limiterMocks.ip.mockResolvedValue(allow());
    limiterMocks.global.mockResolvedValue(deny());

    const result = await admitOnboardingUnverifiedFirstTouch({
      ip: '198.51.100.7',
      clientStatus: null,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Mobile/15E148 Instagram 335.0',
    });

    expect(result).toEqual({
      admitted: false,
      reason: 'global_budget_exhausted',
    });
    expect(analyticsMock).toHaveBeenCalledWith('onboarding_bot_check', {
      result: 'denied',
      reason: 'global_budget_exhausted',
      client_status: 'unknown',
      ua_class: 'instagram_ios_webview',
    });
  });

  it('denies (never admits) when the Redis-only budget is unavailable', async () => {
    limiterMocks.ip.mockResolvedValue(
      deny({ unavailable: true, backend: 'unavailable' })
    );

    const result = await admitOnboardingUnverifiedFirstTouch({
      ip: '203.0.113.9',
      clientStatus: 'timeout',
      userAgent: 'Mozilla/5.0 (Macintosh) Chrome/141.0',
    });

    expect(result).toEqual({
      admitted: false,
      reason: 'budget_unavailable',
    });
  });

  it('reports a global outage as budget_unavailable too', async () => {
    limiterMocks.ip.mockResolvedValue(allow());
    limiterMocks.global.mockResolvedValue(
      deny({ unavailable: true, backend: 'unavailable' })
    );

    const result = await admitOnboardingUnverifiedFirstTouch({
      ip: '203.0.113.9',
      clientStatus: 'unsupported',
      userAgent: 'Mozilla/5.0 (Macintosh) Chrome/141.0',
    });

    expect(result).toEqual({
      admitted: false,
      reason: 'budget_unavailable',
    });
  });

  it('never throws when the analytics emission rejects', async () => {
    limiterMocks.ip.mockResolvedValue(allow());
    limiterMocks.global.mockResolvedValue(allow());
    analyticsMock.mockRejectedValueOnce(new Error('analytics down'));

    await expect(
      admitOnboardingUnverifiedFirstTouch({
        ip: '203.0.113.9',
        clientStatus: 'unconfigured',
        userAgent: 'Mozilla/5.0',
      })
    ).resolves.toEqual({ admitted: true, reason: 'within_budget' });
  });
});

describe('classifyOnboardingUserAgent', () => {
  it('names the JOV-10194 incident classes', () => {
    expect(
      classifyOnboardingUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 335.0.4.28.90 (iPhone14,2; iOS 18_1)'
      )
    ).toBe('instagram_ios_webview');
    expect(
      classifyOnboardingUserAgent(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/141.0.7390.65 Safari/537.36'
      )
    ).toBe('headless_chrome');
    expect(
      classifyOnboardingUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0 Safari/537.36'
      )
    ).toBe('desktop_chrome');
    expect(
      classifyOnboardingUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
      )
    ).toBe('mobile_safari');
    expect(classifyOnboardingUserAgent('curl/8.7.1')).toBe('other');
    expect(classifyOnboardingUserAgent(null)).toBe('other');
    expect(classifyOnboardingUserAgent('')).toBe('other');
  });

  it('does not mislabel non-iOS Instagram or Android browsers', () => {
    const androidInstagram =
      'Mozilla/5.0 (Linux; Android 14) Chrome/141.0 Mobile Safari/537.36 Instagram 335.0';
    expect(classifyOnboardingUserAgent(androidInstagram)).toBe('other');
    expect(
      classifyOnboardingUserAgent(
        'Mozilla/5.0 (Linux; Android 14) Chrome/141.0 Mobile Safari/537.36'
      )
    ).toBe('other');
  });
});
