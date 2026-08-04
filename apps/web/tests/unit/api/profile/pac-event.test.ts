import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCookiesGet,
  mockGeneralLimiterLimit,
  mockLogStatsigEvent,
  mockTrackEvent,
  mockCaptureError,
  mockLoggerInfo,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockCookiesGet: vi.fn(),
  mockGeneralLimiterLimit: vi.fn(),
  mockLogStatsigEvent: vi.fn(async () => undefined),
  mockTrackEvent: vi.fn(async () => undefined),
  mockCaptureError: vi.fn(async () => undefined),
  mockLoggerInfo: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: mockCookiesGet,
  })),
}));

vi.mock('@/app/api/notifications/route-helpers', () => ({
  createRateLimitedResponse: vi.fn(
    () =>
      new Response(JSON.stringify({ success: false, code: 'rate_limited' }), {
        status: 429,
      })
  ),
}));

vi.mock('@/lib/rate-limit', () => ({
  generalLimiter: { limit: mockGeneralLimiterLimit },
  getClientIP: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/flags/statsig', () => ({
  logStatsigEvent: mockLogStatsigEvent,
}));

vi.mock('@/lib/analytics/runtime-aware', () => ({
  trackEvent: mockTrackEvent,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: vi.fn(),
    error: mockLoggerError,
  },
}));

import { POST } from '@/app/api/profile/pac-event/route';
import { AUDIENCE_ANON_COOKIE } from '@/constants/app';
import { COOKIE_BANNER_REQUIRED_COOKIE } from '@/lib/cookies/consent-regions';
import { CONSENT_COOKIE_NAME } from '@/lib/cookies/consent-state';
import { PAC_CLIENT_EVENTS } from '@/lib/tracking/pac-events-shared';

const PROFILE_ID = '3f9c2f6a-8f1e-4b6a-9a44-1c2d3e4f5a6b';
const SESSION_ID = '7a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d';
const JV_AID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
const CLIENT_SUPPLIED_JV_AID = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';
const LEGACY_TRACKING_CONSENT_COOKIE = 'jv_tracking_consent';

function setCookieValues(values: Readonly<Record<string, string>>): void {
  mockCookiesGet.mockImplementation((name: string) => {
    const value = values[name];
    return value === undefined ? undefined : { value };
  });
}

function buildPayload(overrides: Record<string, unknown> = {}) {
  return {
    event: 'pac_exposure',
    jv_aid: null,
    profile_id: PROFILE_ID,
    pac_state: 'idle',
    variant_id: 'copy:default|trigger:30s|s2:merch|tab:visible|dismiss:text',
    session_id: SESSION_ID,
    consent: 'undecided',
    ts: 1_751_000_000_000,
    ...overrides,
  };
}

function buildRequest(
  body: unknown,
  headers: Readonly<Record<string, string>> = {}
) {
  return new NextRequest('http://localhost/api/profile/pac-event', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('POST /api/profile/pac-event', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeneralLimiterLimit.mockResolvedValue({ success: true });
    setCookieValues({
      [AUDIENCE_ANON_COOKIE]: JV_AID,
      [COOKIE_BANNER_REQUIRED_COOKIE]: '0',
    });
  });

  it('accepts every client event name with a full payload', async () => {
    for (const event of PAC_CLIENT_EVENTS) {
      const response = await POST(buildRequest(buildPayload({ event })));
      expect(response.status).toBe(204);
    }
    expect(mockLogStatsigEvent).toHaveBeenCalledTimes(PAC_CLIENT_EVENTS.length);
    expect(mockTrackEvent).toHaveBeenCalledTimes(PAC_CLIENT_EVENTS.length);
  });

  it.each([
    'undecided',
    'accepted',
  ] as const)('derives jv_aid from the httpOnly cookie when server policy allows and client consent is %s', async consent => {
    const response = await POST(
      buildRequest(buildPayload({ consent, jv_aid: CLIENT_SUPPLIED_JV_AID }))
    );

    expect(response.status).toBe(204);
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'pac_exposure',
      expect.objectContaining({ jv_aid: JV_AID })
    );
    // Statsig user is the trusted cookie value, never the client-supplied id.
    expect(mockLogStatsigEvent).toHaveBeenCalledWith(
      JV_AID,
      'pac_exposure',
      'copy:default|trigger:30s|s2:merch|tab:visible|dismiss:text',
      expect.objectContaining({
        profile_id: PROFILE_ID,
        pac_state: 'idle',
        session_id: SESSION_ID,
      })
    );
  });

  it('joins identity in a consent-required region only with canonical analytics consent', async () => {
    setCookieValues({
      [AUDIENCE_ANON_COOKIE]: JV_AID,
      [COOKIE_BANNER_REQUIRED_COOKIE]: '1',
      [CONSENT_COOKIE_NAME]: JSON.stringify({
        essential: true,
        analytics: true,
        marketing: false,
      }),
    });

    const response = await POST(
      buildRequest(buildPayload({ consent: 'accepted' }))
    );

    expect(response.status).toBe(204);
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'pac_exposure',
      expect.objectContaining({ jv_aid: JV_AID })
    );
  });

  it.each([
    {
      name: 'canonical analytics rejection',
      cookies: {
        [AUDIENCE_ANON_COOKIE]: JV_AID,
        [COOKIE_BANNER_REQUIRED_COOKIE]: '0',
        [CONSENT_COOKIE_NAME]: JSON.stringify({
          essential: true,
          analytics: false,
          marketing: true,
        }),
      },
      headers: {},
    },
    {
      name: 'missing consent in a required region',
      cookies: {
        [AUDIENCE_ANON_COOKIE]: JV_AID,
        [COOKIE_BANNER_REQUIRED_COOKIE]: '1',
      },
      headers: {},
    },
    {
      name: 'server geo overriding a client-writable non-required cookie',
      cookies: {
        [AUDIENCE_ANON_COOKIE]: JV_AID,
        [COOKIE_BANNER_REQUIRED_COOKIE]: '0',
      },
      headers: { 'x-vercel-ip-country': 'DE' },
    },
    {
      name: 'Global Privacy Control',
      cookies: {
        [AUDIENCE_ANON_COOKIE]: JV_AID,
        [COOKIE_BANNER_REQUIRED_COOKIE]: '0',
      },
      headers: { 'sec-gpc': '1' },
    },
    {
      name: 'Do Not Track',
      cookies: {
        [AUDIENCE_ANON_COOKIE]: JV_AID,
        [COOKIE_BANNER_REQUIRED_COOKIE]: '0',
      },
      headers: { dnt: '1' },
    },
    {
      name: 'legacy consent rejection',
      cookies: {
        [AUDIENCE_ANON_COOKIE]: JV_AID,
        [COOKIE_BANNER_REQUIRED_COOKIE]: '0',
        [LEGACY_TRACKING_CONSENT_COOKIE]: 'rejected',
      },
      headers: {},
    },
  ])('ignores positive client consent under $name', async ({
    cookies,
    headers,
  }) => {
    setCookieValues(cookies);

    const response = await POST(
      buildRequest(
        buildPayload({
          consent: 'accepted',
          jv_aid: CLIENT_SUPPLIED_JV_AID,
        }),
        headers
      )
    );

    expect(response.status).toBe(204);
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'pac_exposure',
      expect.objectContaining({ jv_aid: null })
    );
    expect(mockLogStatsigEvent).toHaveBeenCalledWith(
      `pac-session:${SESSION_ID}`,
      'pac_exposure',
      expect.anything(),
      expect.anything()
    );
  });

  it.each([
    'rejected',
    'gpc-opted-out',
  ] as const)('stays anonymous when consent is %s', async consent => {
    const response = await POST(buildRequest(buildPayload({ consent })));

    expect(response.status).toBe(204);
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'pac_exposure',
      expect.objectContaining({ jv_aid: null })
    );
    expect(mockLogStatsigEvent).toHaveBeenCalledWith(
      `pac-session:${SESSION_ID}`,
      'pac_exposure',
      expect.anything(),
      expect.anything()
    );
  });

  it('falls back to session scope when no jv_aid cookie exists', async () => {
    setCookieValues({ [COOKIE_BANNER_REQUIRED_COOKIE]: '0' });

    const response = await POST(buildRequest(buildPayload()));

    expect(response.status).toBe(204);
    expect(mockLogStatsigEvent).toHaveBeenCalledWith(
      `pac-session:${SESSION_ID}`,
      'pac_exposure',
      expect.anything(),
      expect.anything()
    );
  });

  it('forwards extras to Statsig metadata', async () => {
    const response = await POST(
      buildRequest(
        buildPayload({
          event: 'capture_error',
          pac_state: 'error',
          extras: { rule: 'invalid_email' },
        })
      )
    );

    expect(response.status).toBe(204);
    expect(mockLogStatsigEvent).toHaveBeenCalledWith(
      JV_AID,
      'capture_error',
      expect.anything(),
      expect.objectContaining({ extra_rule: 'invalid_email' })
    );
  });

  it('rejects unknown events with a named failing rule', async () => {
    const response = await POST(
      buildRequest(buildPayload({ event: 'pac_s2_convert' }))
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { issues: string[] };
    expect(body.issues.some(issue => issue.startsWith('event:'))).toBe(true);
    expect(mockLogStatsigEvent).not.toHaveBeenCalled();
  });

  it('rejects payloads missing contract fields', async () => {
    const { session_id: _sessionId, ...withoutSession } = buildPayload();

    const response = await POST(buildRequest(withoutSession));

    expect(response.status).toBe(400);
    const body = (await response.json()) as { issues: string[] };
    expect(body.issues.some(issue => issue.startsWith('session_id:'))).toBe(
      true
    );
  });

  it('rejects invalid JSON bodies', async () => {
    const response = await POST(buildRequest('not-json{'));
    expect(response.status).toBe(400);
  });

  it('rejects oversized payloads', async () => {
    const response = await POST(
      buildRequest(buildPayload({ extras: { blob: 'x'.repeat(5000) } }))
    );
    expect(response.status).toBe(413);
  });

  it('returns 429 when rate limited', async () => {
    mockGeneralLimiterLimit.mockResolvedValue({ success: false });

    const response = await POST(buildRequest(buildPayload()));

    expect(response.status).toBe(429);
    expect(mockLogStatsigEvent).not.toHaveBeenCalled();
  });
});
