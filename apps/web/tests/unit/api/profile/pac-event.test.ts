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
import { PAC_CLIENT_EVENTS } from '@/lib/tracking/pac-events-contract';

const PROFILE_ID = '3f9c2f6a-8f1e-4b6a-9a44-1c2d3e4f5a6b';
const SESSION_ID = '7a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d';
const JV_AID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

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

function buildRequest(body: unknown) {
  return new NextRequest('http://localhost/api/profile/pac-event', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/profile/pac-event', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGeneralLimiterLimit.mockResolvedValue({ success: true });
    mockCookiesGet.mockReturnValue({ value: JV_AID });
  });

  it('accepts every client event name with a full payload', async () => {
    for (const event of PAC_CLIENT_EVENTS) {
      const response = await POST(buildRequest(buildPayload({ event })));
      expect(response.status).toBe(204);
    }
    expect(mockLogStatsigEvent).toHaveBeenCalledTimes(PAC_CLIENT_EVENTS.length);
    expect(mockTrackEvent).toHaveBeenCalledTimes(PAC_CLIENT_EVENTS.length);
  });

  it('enriches jv_aid server-side from the httpOnly cookie', async () => {
    const response = await POST(buildRequest(buildPayload()));

    expect(response.status).toBe(204);
    expect(mockTrackEvent).toHaveBeenCalledWith(
      'pac_exposure',
      expect.objectContaining({ jv_aid: JV_AID })
    );
    // Statsig user is the stable jv_aid when identity joining is allowed.
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
    mockCookiesGet.mockReturnValue(undefined);

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
