import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BIO_LINK_ACTIVATION_WINDOW_DAYS } from '@/lib/distribution/instagram-activation';

const mockPublicVisitLimiterGetStatus = vi.hoisted(() => vi.fn());
const mockPublicVisitLimiterLimit = vi.hoisted(() => vi.fn());
const mockDetectBot = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDoesTableExist = vi.hoisted(() => vi.fn());
const mockWithSystemIngestionSession = vi.hoisted(() => vi.fn());
const mockCheckVisitRateLimit = vi.hoisted(() => vi.fn());
const mockIsTrackingTokenEnabled = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());

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
  doesTableExist: mockDoesTableExist,
}));

vi.mock('@/lib/db/schema', () => ({
  audienceMembers: {},
  audienceReferrers: {},
  creatorProfiles: {},
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mockWithSystemIngestionSession,
}));

vi.mock('@/lib/analytics/tracking-rate-limit', () => ({
  checkVisitRateLimit: mockCheckVisitRateLimit,
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: mockCaptureWarning,
  captureError: mockCaptureError,
}));

vi.mock('@/lib/analytics/tracking-token', () => ({
  isTrackingTokenEnabled: mockIsTrackingTokenEnabled,
  validateTrackingToken: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/audience/block-check', () => ({
  isVisitorBlocked: vi.fn().mockResolvedValue(false),
}));

const { POST } = await import('@/app/api/audience/visit/route');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe('POST /api/audience/visit', () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
    mockDoesTableExist.mockResolvedValue(true);
    mockCaptureError.mockReset();
  });

  it('returns 429 when rate limited', async () => {
    mockPublicVisitLimiterLimit.mockResolvedValue({
      success: false,
      limit: 100,
      remaining: 0,
      reset: new Date(Date.now() + 60_000),
    });

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

  it('returns 400 when the request body is empty', async () => {
    const request = new NextRequest('http://localhost/api/audience/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid JSON');
    expect(mockWithSystemIngestionSession).not.toHaveBeenCalled();
  });

  it('silently filters bot traffic', async () => {
    mockDetectBot.mockReturnValue({ isBot: true, reason: 'User-Agent match' });
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([{ id: 'profile_123', isPublic: true }]),
        }),
      }),
    });

    const insertedValues: unknown[] = [];
    mockWithSystemIngestionSession.mockImplementation(async callback => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation(value => {
          insertedValues.push(value);
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'inserted_member' }]),
            }),
          };
        }),
      });

      await callback({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: mockInsert,
      });
    });

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
    expect(insertedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          engagementScore: 0,
          tags: ['bot'],
          visits: 0,
        }),
      ])
    );
  });

  it('returns 403 when visitor is blocked', async () => {
    const { isVisitorBlocked } = await import('@/lib/audience/block-check');
    vi.mocked(isVisitorBlocked).mockResolvedValueOnce(true);

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([{ id: 'profile_123', isPublic: true }]),
        }),
      }),
    });

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
    expect(data.status).toBe('blocked');
    // Verify no downstream writes occurred
    expect(mockWithSystemIngestionSession).not.toHaveBeenCalled();
  });

  it('uses the resolved user agent for bot detection', async () => {
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
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'inserted_member' }]),
            }),
          }),
        }),
      });
    });

    const request = new NextRequest('http://localhost/api/audience/visit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-agent': 'Header User Agent',
      },
      body: JSON.stringify({
        profileId: '123e4567-e89b-12d3-a456-426614174000',
        userAgent: 'Body User Agent',
      }),
    });

    await POST(request);

    expect(mockDetectBot).toHaveBeenCalledWith(
      expect.any(NextRequest),
      '/api/audience/visit',
      expect.objectContaining({ userAgent: 'Body User Agent' })
    );
  });

  it('returns 400 for invalid payload', async () => {
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

  it('handles duplicate daily view upsert without failing request', async () => {
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
      const mockInsert = vi
        .fn()
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          }),
        })
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'inserted_member' }]),
            }),
          }),
        });

      await callback({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: mockInsert,
      });
    });

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
  });

  it('falls back when daily profile views conflict target is missing', async () => {
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
      const mockInsert = vi
        .fn()
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi
              .fn()
              .mockRejectedValue(
                new Error(
                  '42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification'
                )
              ),
          }),
        })
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'inserted_member' }]),
            }),
          }),
        });

      const mockUpdate = vi
        .fn()
        .mockReturnValueOnce({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'daily_row' }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        });

      await callback({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'aud_123',
                  visits: 1,
                  latestActions: [],
                  referrerHistory: [],
                  engagementScore: 1,
                  geoCity: null,
                  geoCountry: null,
                  deviceType: 'unknown',
                  utmParams: {},
                },
              ]),
            }),
          }),
        }),
        insert: mockInsert,
        update: mockUpdate,
      });
    });

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
      const mockInsert = vi.fn().mockReturnValue({
        values: vi
          .fn()
          .mockReturnValueOnce({
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          })
          .mockReturnValueOnce({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'inserted_member' }]),
            }),
          }),
      });

      await callback({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: mockInsert,
      });
    });

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

  it('fails soft when optional persistence degrades after fingerprint resolution', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([{ id: 'profile_123', isPublic: true }]),
        }),
      }),
    });
    mockWithSystemIngestionSession.mockRejectedValue(
      new Error('analytics persistence unavailable')
    );

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
    expect(data.degraded).toBe(true);
    expect(data.fingerprint).toBeDefined();
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Audience visit persistence degraded',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/audience/visit',
        method: 'POST',
        profileId: '123e4567-e89b-12d3-a456-426614174000',
      })
    );
  });

  it('writes one activated event for Instagram-sourced visits inside the activation window', async () => {
    const insideActivationWindow = new Date(
      Date.now() - (BIO_LINK_ACTIVATION_WINDOW_DAYS - 1) * MS_PER_DAY
    );

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 'profile_123',
              isPublic: true,
              onboardingCompletedAt: insideActivationWindow,
            },
          ]),
        }),
      }),
    });

    const insertedValues: unknown[] = [];
    mockWithSystemIngestionSession.mockImplementation(async callback => {
      const mockInsert = vi
        .fn()
        .mockReturnValueOnce({
          // 1. daily profile view insert
          values: vi.fn().mockImplementation(value => {
            insertedValues.push(value);
            return {
              onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
            };
          }),
        })
        .mockReturnValueOnce({
          // 2. distribution event insert (before audience member)
          values: vi.fn().mockImplementation(value => {
            insertedValues.push(value);
            return {
              onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
            };
          }),
        })
        .mockReturnValueOnce({
          // 3. audience member insert (new member path)
          values: vi.fn().mockImplementation(value => {
            insertedValues.push(value);
            return {
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi
                  .fn()
                  .mockResolvedValue([{ id: 'inserted_member' }]),
              }),
            };
          }),
        })
        .mockReturnValueOnce({
          // 4. audienceReferrers dual-write
          values: vi.fn().mockImplementation(value => {
            insertedValues.push(value);
            return Promise.resolve(undefined);
          }),
        });

      await callback({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: mockInsert,
      });
    });

    const request = new NextRequest('http://localhost/api/audience/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: '123e4567-e89b-12d3-a456-426614174000',
        referrer:
          'https://l.instagram.com/?u=https%3A%2F%2Fjov.ie%2Fartist-profile',
        utmParams: {
          content: 'bio',
          medium: 'social',
          source: 'instagram',
        },
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(insertedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          creatorProfileId: '123e4567-e89b-12d3-a456-426614174000',
          dedupeKey: 'instagram:activated:123e4567-e89b-12d3-a456-426614174000',
          eventType: 'activated',
          metadata: expect.objectContaining({
            referrerHost: 'l.instagram.com',
            surface: 'onboarding',
            utmContent: 'bio',
            utmSource: 'instagram',
          }),
          platform: 'instagram',
        }),
      ])
    );
  });

  it('does not write an activated event after the seven-day window expires', async () => {
    const expiredActivationWindow = new Date(
      Date.now() - (BIO_LINK_ACTIVATION_WINDOW_DAYS + 5) * MS_PER_DAY
    );

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 'profile_123',
              isPublic: true,
              onboardingCompletedAt: expiredActivationWindow,
            },
          ]),
        }),
      }),
    });

    const insertedValues: unknown[] = [];
    mockWithSystemIngestionSession.mockImplementation(async callback => {
      const mockInsert = vi
        .fn()
        .mockReturnValueOnce({
          values: vi.fn().mockImplementation(value => {
            insertedValues.push(value);
            return {
              onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
            };
          }),
        })
        .mockReturnValueOnce({
          values: vi.fn().mockImplementation(value => {
            insertedValues.push(value);
            return {
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi
                  .fn()
                  .mockResolvedValue([{ id: 'inserted_member' }]),
              }),
            };
          }),
        });

      await callback({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: mockInsert,
      });
    });

    const request = new NextRequest('http://localhost/api/audience/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: '123e4567-e89b-12d3-a456-426614174000',
        utmParams: {
          content: 'bio',
          medium: 'social',
          source: 'instagram',
        },
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(
      insertedValues.some(
        value =>
          typeof value === 'object' &&
          value !== null &&
          (value as { eventType?: unknown }).eventType === 'activated'
      )
    ).toBe(false);
  });

  it('skips the activated event write when creator_distribution_events is missing', async () => {
    const insideActivationWindow = new Date(
      Date.now() - (BIO_LINK_ACTIVATION_WINDOW_DAYS - 1) * MS_PER_DAY
    );
    const missingTableError = new Error('Failed query');
    Object.assign(missingTableError, {
      cause: {
        code: '42P01',
        message: 'undefined table',
      },
    });

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: 'profile_123',
              isPublic: true,
              onboardingCompletedAt: insideActivationWindow,
            },
          ]),
        }),
      }),
    });

    mockWithSystemIngestionSession.mockImplementation(async callback => {
      const mockInsert = vi.fn().mockReturnValue({
        values: vi
          .fn()
          .mockImplementation((value: Record<string, unknown>) => ({
            onConflictDoNothing:
              value.eventType === 'activated'
                ? vi.fn().mockRejectedValueOnce(missingTableError)
                : vi.fn().mockReturnValue({
                    returning: vi
                      .fn()
                      .mockResolvedValue([{ id: 'inserted_member' }]),
                  }),
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
          })),
      });

      await callback({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: mockInsert,
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      });
    });

    const request = new NextRequest('http://localhost/api/audience/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: '123e4567-e89b-12d3-a456-426614174000',
        referrer:
          'https://l.instagram.com/?u=https%3A%2F%2Fjov.ie%2Fartist-profile',
        utmParams: {
          content: 'bio',
          medium: 'social',
          source: 'instagram',
        },
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      '[audience/visit] creator_distribution_events table missing; skipping activation write',
      expect.any(Error),
      { profileId: '123e4567-e89b-12d3-a456-426614174000' }
    );
  });

  it('skips the aggregate write when daily_profile_views is missing', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([{ id: 'profile_123', isPublic: true }]),
        }),
      }),
    });
    mockDoesTableExist.mockResolvedValue(false);
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
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'inserted_member' }]),
            }),
          }),
        }),
      });
    });

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
    expect(mockCaptureWarning).not.toHaveBeenCalled();
  });
});
