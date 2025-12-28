import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheckPublicRateLimit = vi.hoisted(() => vi.fn());
const mockGetPublicRateLimitStatus = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/rate-limit', () => ({
  checkPublicRateLimit: mockCheckPublicRateLimit,
  getPublicRateLimitStatus: mockGetPublicRateLimitStatus,
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  audienceMembers: {},
  creatorProfiles: {},
  socialLinks: {},
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: vi.fn().mockImplementation(async callback => {
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
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    });
  }),
}));

vi.mock('@/lib/analytics/tracking-rate-limit', () => ({
  checkClickRateLimit: vi.fn().mockResolvedValue({ success: true }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/analytics/tracking-token', () => ({
  isTrackingTokenEnabled: vi.fn().mockReturnValue(false),
  validateTrackingToken: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock('@/lib/utils/bot-detection', () => ({
  detectBot: vi.fn().mockReturnValue({ isBot: false }),
}));

describe('POST /api/audience/click', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCheckPublicRateLimit.mockReturnValue(false);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckPublicRateLimit.mockReturnValue(true);
    mockGetPublicRateLimitStatus.mockReturnValue({
      retryAfterSeconds: 60,
      limit: 100,
      remaining: 0,
    });

    const { POST } = await import('@/app/api/audience/click/route');
    const request = new NextRequest('http://localhost/api/audience/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: '123e4567-e89b-12d3-a456-426614174000',
        linkId: '123e4567-e89b-12d3-a456-426614174001',
        linkType: 'social',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toBe('Rate limit exceeded');
  });

  it('returns 400 for invalid payload', async () => {
    const { POST } = await import('@/app/api/audience/click/route');
    const request = new NextRequest('http://localhost/api/audience/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'invalid' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid click payload');
  });

  it('records click for valid payload', async () => {
    const { POST } = await import('@/app/api/audience/click/route');
    const request = new NextRequest('http://localhost/api/audience/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: '123e4567-e89b-12d3-a456-426614174000',
        linkId: '123e4567-e89b-12d3-a456-426614174001',
        linkType: 'social',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
