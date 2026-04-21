import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateRateLimitHeaders,
  mockDoesTableExist,
  mockGetOptionalAuth,
  mockParseJsonBody,
  mockPublicVisitLimiterLimit,
  mockRecordProductFunnelClientEvent,
} = vi.hoisted(() => ({
  mockCreateRateLimitHeaders: vi.fn(() => ({ 'X-RateLimit-Limit': '60' })),
  mockDoesTableExist: vi.fn(),
  mockGetOptionalAuth: vi.fn(),
  mockParseJsonBody: vi.fn(),
  mockPublicVisitLimiterLimit: vi.fn(),
  mockRecordProductFunnelClientEvent: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  doesTableExist: mockDoesTableExist,
}));

vi.mock('@/lib/auth/cached', () => ({
  getOptionalAuth: mockGetOptionalAuth,
}));

vi.mock('@/lib/http/parse-json', () => ({
  parseJsonBody: mockParseJsonBody,
}));

vi.mock('@/lib/product-funnel/events', () => ({
  recordProductFunnelClientEvent: mockRecordProductFunnelClientEvent,
}));

vi.mock('@/lib/rate-limit', () => ({
  createRateLimitHeaders: mockCreateRateLimitHeaders,
  publicVisitLimiter: {
    limit: mockPublicVisitLimiterLimit,
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

import { POST } from '@/app/api/funnel/track/route';

describe('POST /api/funnel/track', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPublicVisitLimiterLimit.mockResolvedValue({
      success: true,
    });
    mockDoesTableExist.mockResolvedValue(true);
    mockParseJsonBody.mockResolvedValue({
      ok: true,
      data: {
        eventType: 'visit',
        sessionId: 'session_12345',
        sourceSurface: 'claim_page',
        sourceRoute: '/testartist',
      },
    });
    mockRecordProductFunnelClientEvent.mockResolvedValue(true);
  });

  it('records anonymous events when optional auth resolves signed-out', async () => {
    mockGetOptionalAuth.mockResolvedValue({
      userId: null,
      sessionId: null,
      orgId: null,
    });

    const response = await POST(
      new Request('http://localhost/api/funnel/track')
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ inserted: true, success: true });
    expect(mockRecordProductFunnelClientEvent).toHaveBeenCalledWith({
      eventType: 'visit',
      sessionId: 'session_12345',
      sourceSurface: 'claim_page',
      sourceRoute: '/testartist',
      userClerkId: undefined,
    });
  });

  it('returns a non-fatal degraded response when the funnel schema is unavailable', async () => {
    mockDoesTableExist.mockResolvedValue(false);

    const response = await POST(
      new Request('http://localhost/api/funnel/track')
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      inserted: false,
      reason: 'product_funnel_schema_unavailable',
      success: false,
    });
    expect(mockRecordProductFunnelClientEvent).not.toHaveBeenCalled();
  });

  it('returns 429 when the request exceeds the public rate limit', async () => {
    mockPublicVisitLimiterLimit.mockResolvedValue({
      success: false,
      limit: 60,
      remaining: 0,
      reset: 60,
    });

    const response = await POST(
      new Request('http://localhost/api/funnel/track', {
        headers: {
          'x-forwarded-for': '127.0.0.1',
        },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload).toEqual({ error: 'Rate limit exceeded' });
    expect(mockParseJsonBody).not.toHaveBeenCalled();
  });
});
