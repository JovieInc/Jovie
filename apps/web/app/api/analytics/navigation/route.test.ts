import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetCachedAuth,
  mockRequireAdmin,
  mockRecord,
  mockGetBaseline,
  mockCaptureError,
  mockRateLimit,
  mockCreateRateLimitHeaders,
} = vi.hoisted(() => ({
  mockGetCachedAuth: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockRecord: vi.fn(),
  mockGetBaseline: vi.fn(),
  mockCaptureError: vi.fn(),
  mockRateLimit: vi.fn(),
  mockCreateRateLimitHeaders: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mockGetCachedAuth }));
vi.mock('@/lib/admin', () => ({ requireAdmin: mockRequireAdmin }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mockCaptureError }));
vi.mock('@/lib/rate-limit', () => ({
  navigationTelemetryLimiter: { limit: mockRateLimit },
  createRateLimitHeaders: mockCreateRateLimitHeaders,
}));
vi.mock('@/lib/analytics/navigation-telemetry.server', () => ({
  NavigationTelemetryStoreUnavailableError: class extends Error {},
  recordNavigationTelemetryBatch: mockRecord,
  getNavigationTelemetryBaseline: mockGetBaseline,
}));

import { NavigationTelemetryStoreUnavailableError } from '@/lib/analytics/navigation-telemetry.server';
import { GET, POST } from './route';

const VALID_PAYLOAD = {
  schema_version: 1,
  event_id: 'opaque-navigation-id:activation',
  event: 'activation',
  item_id: 'library',
  source_route: 'chat',
  destination_route: 'library',
  input_method: 'pointer',
  platform: 'web_desktop',
  nav_variant: 'canonical_customer_ia_v1',
  consent_mode: 'explicit',
  latency_bucket: 'na',
  success: false,
};

function post(body: unknown): Request {
  return new Request('https://jov.ie/api/analytics/navigation', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/analytics/navigation', () => {
  beforeEach(() => {
    mockGetCachedAuth.mockReset();
    mockRequireAdmin.mockReset();
    mockRecord.mockReset().mockResolvedValue({ status: 'accepted' });
    mockGetBaseline.mockReset();
    mockCaptureError.mockReset();
    mockRateLimit.mockReset().mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date('2026-07-22T12:01:00Z'),
    });
    mockCreateRateLimitHeaders.mockReset().mockReturnValue({
      'X-RateLimit-Limit': '100',
      'X-RateLimit-Remaining': '0',
    });
  });

  it('rejects unauthenticated writes before parsing', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });
    expect((await POST(post(VALID_PAYLOAD))).status).toBe(401);
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockRateLimit).not.toHaveBeenCalled();
  });

  it('rate limits authenticated writes by user before parsing', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'app-user-id' });
    mockRateLimit.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset: new Date('2026-07-22T12:01:00Z'),
    });

    const response = await POST(post({ malformed: true }));

    expect(response.status).toBe(429);
    expect(mockRateLimit).toHaveBeenCalledExactlyOnceWith('app-user-id');
    expect(response.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('rejects raw identity or content fields', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'discarded-auth-id' });
    expect(
      (await POST(post({ ...VALID_PAYLOAD, user_id: 'must-not-survive' })))
        .status
    ).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('rejects impossible event-specific combinations', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'discarded-auth-id' });
    expect(
      (
        await POST(
          post({
            ...VALID_PAYLOAD,
            event: 'destination_ready',
            latency_bucket: 'na',
            success: true,
          })
        )
      ).status
    ).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('rejects an event id whose semantic suffix disagrees with the event', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'discarded-auth-id' });
    expect(
      (
        await POST(
          post({
            ...VALID_PAYLOAD,
            event: 'destination_ready',
            latency_bucket: 'le_500ms',
            success: true,
          })
        )
      ).status
    ).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('passes authentication identity only as the transient contribution-cap input', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'discarded-auth-id' });
    expect((await POST(post(VALID_PAYLOAD))).status).toBe(204);
    expect(mockRateLimit).toHaveBeenCalledExactlyOnceWith('discarded-auth-id');
    expect(mockRecord).toHaveBeenCalledExactlyOnceWith([VALID_PAYLOAD], {
      contributorId: 'discarded-auth-id',
    });
  });

  it('accepts a bounded batch and rate limits it once', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'batch-user-id' });
    const ready = {
      ...VALID_PAYLOAD,
      event_id: 'opaque-navigation-id:destination_ready',
      event: 'destination_ready',
      latency_bucket: 'le_500ms',
      success: true,
    };

    const response = await POST(
      post({ schema_version: 1, events: [VALID_PAYLOAD, ready] })
    );

    expect(response.status).toBe(204);
    expect(mockRateLimit).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledExactlyOnceWith([VALID_PAYLOAD, ready], {
      contributorId: 'batch-user-id',
    });
  });

  it('rejects an oversized batch', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'batch-user-id' });
    const events = Array.from({ length: 9 }, (_, index) => ({
      ...VALID_PAYLOAD,
      event_id: `opaque-navigation-${index}:activation`,
    }));

    expect((await POST(post({ schema_version: 1, events }))).status).toBe(400);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON and bodies over the byte limit', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'batch-user-id' });
    const malformed = new Request('https://jov.ie/api/analytics/navigation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"schema_version":1,"events":[',
    });
    const oversized = new Request('https://jov.ie/api/analytics/navigation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(8192) }),
    });

    expect((await POST(malformed)).status).toBe(400);
    expect((await POST(oversized)).status).toBe(413);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('fails closed without error capture when the aggregate store is unavailable', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'discarded-auth-id' });
    mockRecord.mockRejectedValue(
      new NavigationTelemetryStoreUnavailableError()
    );

    expect((await POST(post(VALID_PAYLOAD))).status).toBe(503);
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it('captures unexpected write failures without payload or identity context', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: 'discarded-auth-id' });
    const failure = new Error('aggregate failure');
    mockRecord.mockRejectedValue(failure);

    expect((await POST(post(VALID_PAYLOAD))).status).toBe(503);
    expect(mockCaptureError).toHaveBeenCalledExactlyOnceWith(
      'Navigation telemetry aggregate write failed',
      failure,
      { route: '/api/analytics/navigation', method: 'POST' }
    );
    expect(JSON.stringify(mockCaptureError.mock.calls)).not.toContain(
      'discarded-auth-id'
    );
  });

  it('does not query the baseline when admin authorization denies access', async () => {
    mockRequireAdmin.mockResolvedValue(
      Response.json({ error: 'Forbidden' }, { status: 403 })
    );

    expect((await GET()).status).toBe(403);
    expect(mockGetBaseline).not.toHaveBeenCalled();
  });

  it('requires admin access and returns a no-store aggregate baseline', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    mockGetBaseline.mockResolvedValue({ published: false, segments: [] });
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ published: false, segments: [] });
  });

  it('captures unexpected baseline failures and returns unavailable', async () => {
    mockRequireAdmin.mockResolvedValue(null);
    const failure = new Error('read failure');
    mockGetBaseline.mockRejectedValue(failure);

    expect((await GET()).status).toBe(503);
    expect(mockCaptureError).toHaveBeenCalledExactlyOnceWith(
      'Navigation telemetry baseline read failed',
      failure,
      { route: '/api/analytics/navigation', method: 'GET' }
    );
  });
});
