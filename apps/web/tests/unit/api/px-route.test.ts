import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPublicVisitLimiterLimit = vi.hoisted(() => vi.fn());
const mockExtractClientIP = vi.hoisted(() =>
  vi.fn().mockReturnValue('127.0.0.1')
);
const mockDetectBot = vi.hoisted(() =>
  vi.fn().mockReturnValue({ isBot: false })
);
const mockRecordAnonymousBotMetric = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbInsert = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockForwardEvent = vi.hoisted(() => vi.fn());
const mockEnsureClaimRetargetingCreatives = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rate-limit', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();

  return {
    ...actual,
    publicVisitLimiter: {
      limit: mockPublicVisitLimiterLimit,
    },
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/retargeting/claim-creatives', () => ({
  ensureClaimRetargetingCreatives: mockEnsureClaimRetargetingCreatives,
}));

vi.mock('@/lib/tracking/forwarding', () => ({
  forwardEvent: mockForwardEvent,
}));

vi.mock('@/lib/utils/bot-detection', () => ({
  detectBot: mockDetectBot,
  recordAnonymousBotMetric: mockRecordAnonymousBotMetric,
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: mockExtractClientIP,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { POST } = await import('@/app/api/px/route');

function buildRequest() {
  return new NextRequest('http://localhost/api/px', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileId: '550e8400-e29b-41d4-a716-446655440000',
      sessionId: 'session-id',
      eventType: 'page_view',
      consent: true,
    }),
  });
}

describe('POST /api/px', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPublicVisitLimiterLimit.mockResolvedValue({
      success: true,
      limit: 100,
      remaining: 99,
      reset: new Date(Date.now() + 60_000),
    });
  });

  it('returns a silent success when the IP rate limit is exceeded', async () => {
    mockPublicVisitLimiterLimit.mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: new Date(Date.now() + 30_000),
    });

    const response = await POST(buildRequest());

    expect(response.status).toBe(204);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('100');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(mockDetectBot).toHaveBeenCalledWith(
      expect.any(NextRequest),
      '/api/px'
    );
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockForwardEvent).not.toHaveBeenCalled();
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it('filters known bots before consuming the durable rate-limit budget', async () => {
    mockDetectBot.mockReturnValueOnce({ isBot: true });

    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      filtered: true,
    });
    expect(mockPublicVisitLimiterLimit).not.toHaveBeenCalled();
    expect(mockRecordAnonymousBotMetric).toHaveBeenCalledWith(
      expect.objectContaining({ isBot: true }),
      'pixel'
    );
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('continues human event ingestion after the pre-meter bot check', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              isPublic: true,
              username: 'dualipa',
            },
          ]),
        }),
      }),
    });
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    mockDbInsert.mockReturnValue({ values: mockValues });

    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mockDetectBot).toHaveBeenCalledWith(
      expect.any(NextRequest),
      '/api/px'
    );
    expect(mockPublicVisitLimiterLimit).toHaveBeenCalledWith('127.0.0.1');
    expect(mockRecordAnonymousBotMetric).not.toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: '550e8400-e29b-41d4-a716-446655440000',
      })
    );
  });
});
