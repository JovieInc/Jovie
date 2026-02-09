import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPublicClickLimiterGetStatus = vi.hoisted(() => vi.fn());
const mockPublicClickLimiterLimit = vi.hoisted(() => vi.fn());

vi.mock('@/lib/rate-limit', () => ({
  publicClickLimiter: {
    getStatus: mockPublicClickLimiterGetStatus,
    limit: mockPublicClickLimiterLimit,
  },
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: '123e4567-e89b-12d3-a456-426614174000',
              isPublic: true,
            },
          ]),
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  audienceMembers: {
    id: 'id',
    creatorProfileId: 'creator_profile_id',
    fingerprint: 'fingerprint',
    visits: 'visits',
    engagementScore: 'engagement_score',
    intentLevel: 'intent_level',
    deviceType: 'device_type',
    geoCity: 'geo_city',
    geoCountry: 'geo_country',
    spotifyConnected: 'spotify_connected',
    latestActions: 'latest_actions',
    lastSeenAt: 'last_seen_at',
    updatedAt: 'updated_at',
  },
  clickEvents: {
    creatorProfileId: 'creator_profile_id',
    linkId: 'link_id',
    linkType: 'link_type',
    ipAddress: 'ip_address',
    userAgent: 'user_agent',
    referrer: 'referrer',
    country: 'country',
    city: 'city',
    deviceType: 'device_type',
    os: 'os',
    browser: 'browser',
    isBot: 'is_bot',
    metadata: 'metadata',
    audienceMemberId: 'audience_member_id',
  },
  creatorProfiles: {
    id: 'id',
    isPublic: 'is_public',
  },
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: vi.fn().mockImplementation(async callback => {
    const insert = vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => {
        const base: any = Promise.resolve(undefined);
        base.onConflictDoNothing = vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 'audience_member_1',
              visits: 0,
              engagementScore: 0,
              latestActions: [],
              geoCity: null,
              geoCountry: null,
              deviceType: 'unknown',
              spotifyConnected: false,
            },
          ]),
        });
        return base;
      }),
    }));

    await callback({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert,
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

vi.mock('@/lib/utils/pii-encryption', () => ({
  encryptIP: vi.fn().mockReturnValue('encrypted-ip'),
}));

vi.mock('@/lib/utils/bot-detection', () => ({
  detectBot: vi.fn().mockReturnValue({ isBot: false }),
}));

describe('POST /api/audience/click', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPublicClickLimiterGetStatus.mockReturnValue({
      blocked: false,
      retryAfterSeconds: 0,
      limit: 100,
      remaining: 100,
    });
    mockPublicClickLimiterLimit.mockResolvedValue({ success: true });
  });

  it('returns 429 when rate limited', async () => {
    mockPublicClickLimiterLimit.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
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
