import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPublicVisitLimiterGetStatus = vi.hoisted(() => vi.fn());
const mockPublicVisitLimiterLimit = vi.hoisted(() => vi.fn());
const mockDetectBot = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockWithSystemIngestionSession = vi.hoisted(() => vi.fn());
const mockCheckVisitRateLimit = vi.hoisted(() => vi.fn());
const mockIsTrackingTokenEnabled = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rate-limit', () => ({
  publicVisitLimiter: {
    getStatus: mockPublicVisitLimiterGetStatus,
    limit: mockPublicVisitLimiterLimit,
  },
}));

vi.mock('@/lib/utils/bot-detection', () => ({
  detectBot: mockDetectBot,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  audienceMembers: {},
  creatorProfiles: {},
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

vi.mock('@/lib/analytics/tracking-rate-limit', () => ({
  checkVisitRateLimit: mockCheckVisitRateLimit,
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/analytics/tracking-token', () => ({
  isTrackingTokenEnabled: mockIsTrackingTokenEnabled,
  validateTrackingToken: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

describe('POST /api/audience/visit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockPublicVisitLimiterGetStatus.mockReturnValue({
      blocked: false,
      retryAfterSeconds: 0,
      limit: 100,
      remaining: 100,
    });
    mockPublicVisitLimiterLimit.mockResolvedValue({ success: true });
    mockDetectBot.mockReturnValue({ isBot: false });
    mockIsTrackingTokenEnabled.mockReturnValue(false);
    mockCheckVisitRateLimit.mockResolvedValue({ success: true });
  });

  it('returns 429 when rate limited', async () => {
    mockPublicVisitLimiterGetStatus.mockReturnValue({
      blocked: true,
      retryAfterSeconds: 60,
      limit: 100,
      remaining: 0,
    });

    const { POST } = await import('@/app/api/audience/visit/route');
    const request = new NextRequest('http://localhost/api/audience/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: '123e4567-e89b-12d3-a456-426614174000',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toBe('Rate limit exceeded');
  });

  it('silently filters bot traffic', async () => {
    mockDetectBot.mockReturnValue({ isBot: true, reason: 'User-Agent match' });

    const { POST } = await import('@/app/api/audience/visit/route');
    const request = new NextRequest('http://localhost/api/audience/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: '123e4567-e89b-12d3-a456-426614174000',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.fingerprint).toBe('bot-filtered');
  });

  it('returns 400 for invalid payload', async () => {
    const { POST } = await import('@/app/api/audience/visit/route');
    const request = new NextRequest('http://localhost/api/audience/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'invalid-uuid' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid visit payload');
  });

  it('returns 404 when profile not found', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const { POST } = await import('@/app/api/audience/visit/route');
    const request = new NextRequest('http://localhost/api/audience/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: '123e4567-e89b-12d3-a456-426614174000',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Creator profile not found');
  });

  it('returns 403 when profile is not public', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([{ id: 'profile_123', isPublic: false }]),
        }),
      }),
    });

    const { POST } = await import('@/app/api/audience/visit/route');
    const request = new NextRequest('http://localhost/api/audience/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: '123e4567-e89b-12d3-a456-426614174000',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Profile is not public');
  });

  it('records visit for valid public profile', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([{ id: 'profile_123', isPublic: true }]),
        }),
      }),
    });
    mockWithSystemIngestionSession.mockImplementation(async callback => {
      await callback({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      });
    });

    const { POST } = await import('@/app/api/audience/visit/route');
    const request = new NextRequest('http://localhost/api/audience/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: '123e4567-e89b-12d3-a456-426614174000',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.fingerprint).toBeDefined();
  });
});
