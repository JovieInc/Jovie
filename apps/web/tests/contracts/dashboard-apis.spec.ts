import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_USER_ID = 'user_123';
const NO_STORE = 'no-store';
const PROFILE_ID = '123e4567-e89b-12d3-a456-426614174000';

type QueryRows = Array<Record<string, unknown>>;

function createQueryResult(rows: QueryRows) {
  const promise = Promise.resolve(rows);
  const chain = () => createQueryResult(rows);

  return {
    from: chain,
    innerJoin: chain,
    leftJoin: chain,
    where: chain,
    orderBy: chain,
    limit: chain,
    offset: async () => rows,
    values: chain,
    returning: chain,
    set: chain,
    delete: chain,
    insert: chain,
    update: chain,
    onConflictDoNothing: async () => {},
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
}

function createSelectQueue(responses: QueryRows[]) {
  let callIndex = 0;

  return () => {
    const rows = responses[callIndex] ?? [];
    callIndex += 1;
    return createQueryResult(rows);
  };
}

function mockSession({
  unauthorized = false,
  tx,
}: {
  unauthorized?: boolean;
  tx?: unknown;
} = {}) {
  vi.doMock('@/lib/auth/session', () => ({
    withDbSession: async (callback: (userId: string) => Promise<unknown>) => {
      if (unauthorized) throw new Error('Unauthorized');
      return callback(TEST_USER_ID);
    },
    withDbSessionTx: async (
      callback: (transaction: unknown, userId: string) => Promise<unknown>
    ) => {
      if (unauthorized) throw new Error('Unauthorized');
      return callback(tx ?? {}, TEST_USER_ID);
    },
  }));
}

function mockDb(selectResponses: QueryRows[] = []) {
  const nextSelect = createSelectQueue(selectResponses);
  const db = {
    select: nextSelect,
    insert: () => createQueryResult([]),
    update: () => createQueryResult([]),
    delete: () => createQueryResult([]),
    execute: async () => ({ rows: [] }),
  };

  vi.doMock('@/lib/db', () => ({
    db,
    and: vi.fn(),
    eq: vi.fn(),
  }));

  return db;
}

function mockSocialLinkDependencies() {
  vi.doMock('@/lib/rate-limit', () => ({
    dashboardLinksRateLimit: {
      limit: vi.fn().mockResolvedValue({
        success: true,
        limit: 30,
        remaining: 29,
        reset: Date.now() + 1000,
      }),
    },
    createRateLimitHeaders: () => ({}),
  }));

  vi.doMock('@/lib/cache', () => ({
    invalidateSocialLinksCache: vi.fn().mockResolvedValue(undefined),
  }));

  vi.doMock('@/lib/ingestion/confidence', () => ({
    computeLinkConfidence: () => ({
      state: 'active' as const,
      confidence: 0.97,
    }),
  }));

  vi.doMock('@/lib/ingestion/magic-profile-avatar', () => ({
    maybeSetProfileAvatarFromLinks: vi.fn().mockResolvedValue(undefined),
  }));

  vi.doMock('@/lib/error-tracking', () => ({
    captureError: vi.fn(),
  }));

  vi.doMock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
  }));
}

function expectStatusOk(response: Response, body: unknown) {
  if (response.status !== 200) {
    throw new Error(
      `Expected 200 response, received ${response.status}: ${JSON.stringify(body)}`
    );
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('Dashboard API contracts', () => {
  describe('Analytics', () => {
    it('returns analytics payload with normalized arrays', async () => {
      mockSession();

      vi.doMock('@/lib/db/queries/analytics', () => ({
        getUserDashboardAnalytics: vi.fn().mockResolvedValue({
          profile_views: 42,
          unique_users: 21,
          top_cities: [{ city: 'Austin', count: 3 }],
          top_countries: undefined,
          top_referrers: null,
        }),
      }));

      const { GET } = await import('@/app/api/dashboard/analytics/route');
      const response = await GET(
        new Request(
          'http://localhost/api/dashboard/analytics?range=7d&view=full'
        )
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe(NO_STORE);
      expect(body).toMatchObject({
        profile_views: 42,
        unique_users: 21,
        top_cities: [{ city: 'Austin', count: 3 }],
        top_countries: [],
        top_referrers: [],
      });
    });

    it('surfaces unauthorized responses with consistent shape', async () => {
      mockSession({ unauthorized: true });

      const { GET } = await import('@/app/api/dashboard/analytics/route');
      const response = await GET(
        new Request('http://localhost/api/dashboard/analytics')
      );
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body).toEqual({ error: 'Unauthorized' });
    });
  });

  describe('Recent activity', () => {
    it('formats audience, visit, and click events into activity feed', async () => {
      mockSession();
      mockDb([
        [{ id: PROFILE_ID }],
        [
          {
            id: 'click_1',
            linkType: 'listen',
            createdAt: new Date('2024-01-02T00:00:00Z'),
            memberType: 'spotify',
            memberCity: null,
            memberCountry: 'US',
            clickCity: 'Paris',
            clickCountry: null,
            target: 'spotify',
          },
        ],
        [
          {
            id: 'visit_1',
            memberType: 'email',
            city: 'Austin',
            country: 'US',
            lastSeenAt: new Date('2024-01-03T00:00:00Z'),
          },
        ],
        [
          {
            id: 'sub_1',
            createdAt: new Date('2024-01-04T00:00:00Z'),
            countryCode: 'us',
            city: 'Chicago',
            channel: 'email',
          },
        ],
      ]);

      const { GET } = await import('@/app/api/dashboard/activity/recent/route');
      const response = await GET(
        new NextRequest(
          `http://localhost/api/dashboard/activity/recent?profileId=${PROFILE_ID}&limit=6`
        )
      );
      const body = await response.json();

      expectStatusOk(response, body);
      expect(response.headers.get('Cache-Control')).toBe(NO_STORE);
      expect(Array.isArray(body.activities)).toBe(true);
      expect(body.activities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'click_1',
            icon: '🎧',
            description: expect.stringContaining('Spotify'),
            timestamp: '2024-01-02T00:00:00.000Z',
          }),
          expect.objectContaining({
            id: expect.stringContaining('visit_1'),
            icon: '👀',
            timestamp: '2024-01-03T00:00:00.000Z',
          }),
          expect.objectContaining({
            id: 'subscribe:sub_1',
            icon: '📩',
            timestamp: '2024-01-04T00:00:00.000Z',
          }),
        ])
      );
    });
  });

  describe('Audience endpoints', () => {
    it('validates audience members requests and returns normalized payloads', async () => {
      const tx = {
        select: createSelectQueue([
          [{ id: PROFILE_ID }],
          [
            {
              id: 'member_1',
              type: 'email',
              displayName: 'Jane',
              visits: 4,
              engagementScore: 80,
              intentLevel: 'high',
              geoCity: 'Austin',
              geoCountry: 'US',
              deviceType: 'mobile',
              latestActions: ['visit'],
              referrerHistory: ['google.com'],
              email: 'jane@example.com',
              phone: null,
              spotifyConnected: false,
              purchaseCount: 1,
              tags: ['vip'],
              lastSeenAt: new Date('2024-01-02T00:00:00Z'),
              createdAt: new Date('2023-12-31T00:00:00Z'),
            },
          ],
          [{ total: 1 }],
        ]),
      };

      mockSession({ tx });

      const { GET } = await import(
        '@/app/api/dashboard/audience/members/route'
      );
      const response = await GET(
        new NextRequest(
          `http://localhost/api/dashboard/audience/members?profileId=${PROFILE_ID}&sort=lastSeen&direction=desc&page=1&pageSize=10`
        )
      );
      const body = await response.json();

      expectStatusOk(response, body);
      expect(body).toMatchObject({
        total: 1,
        members: [
          expect.objectContaining({
            id: 'member_1',
            latestActions: ['visit'],
            referrerHistory: ['google.com'],
            lastSeenAt: '2024-01-02T00:00:00.000Z',
            createdAt: '2023-12-31T00:00:00.000Z',
          }),
        ],
      });
    });

    it('paginates subscribers with contract-safe response', async () => {
      const tx = {
        select: createSelectQueue([
          [{ id: PROFILE_ID }],
          [
            {
              id: 'sub_1',
              email: 'fan@example.com',
              phone: null,
              countryCode: 'us',
              createdAt: new Date('2024-01-03T00:00:00Z'),
              channel: 'email',
            },
          ],
          [{ total: 1 }],
        ]),
      };

      mockSession({ tx });

      const { GET } = await import(
        '@/app/api/dashboard/audience/subscribers/route'
      );
      const response = await GET(
        new Request(
          `http://localhost/api/dashboard/audience/subscribers?profileId=${PROFILE_ID}&sort=createdAt&direction=desc&page=1&pageSize=10`
        )
      );
      const body = await response.json();

      expectStatusOk(response, body);
      expect(body).toEqual({
        total: 1,
        subscribers: [
          {
            id: 'sub_1',
            email: 'fan@example.com',
            phone: null,
            countryCode: 'us',
            createdAt: '2024-01-03T00:00:00.000Z',
            channel: 'email',
          },
        ],
      });
    });
  });

  describe('Profile', () => {
    it('returns current profile with caching headers', async () => {
      mockSession();
      mockDb([
        [
          {
            profile: {
              id: PROFILE_ID,
              username: 'artist',
              usernameNormalized: 'artist',
              displayName: 'Artist',
            },
          },
        ],
      ]);

      const { GET } = await import('@/app/api/dashboard/profile/route');
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe(NO_STORE);
      expect(body.profile).toMatchObject({
        id: PROFILE_ID,
        username: 'artist',
        displayName: 'Artist',
      });
    });

    it('accepts update payloads and normalizes username in test mode', async () => {
      mockSession();
      mockDb();

      vi.doMock('@clerk/nextjs/server', () => ({
        clerkClient: vi.fn().mockResolvedValue({
          users: {
            updateUser: vi.fn(),
            updateUserProfileImage: vi.fn(),
          },
        }),
      }));

      vi.doMock('@/lib/username/sync', () => ({
        syncCanonicalUsernameFromApp: vi.fn().mockResolvedValue(undefined),
        UsernameValidationError: class extends Error {},
      }));

      const { PUT } = await import('@/app/api/dashboard/profile/route');
      const response = await PUT(
        new Request('http://localhost/api/dashboard/profile', {
          method: 'PUT',
          body: JSON.stringify({
            updates: { username: 'TestUser', displayName: 'Test User' },
          }),
        })
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.profile.username).toBe('testuser');
      expect(body.profile.usernameNormalized).toBe('testuser');
    });
  });

  describe('Social links', () => {
    it('returns filtered social links for profile', async () => {
      mockSession();
      mockDb([
        [{ id: PROFILE_ID, usernameNormalized: 'artist' }],
        [
          {
            profileId: PROFILE_ID,
            linkId: 'link_active',
            platform: 'instagram',
            platformType: 'social',
            url: 'https://instagram.com/artist',
            sortOrder: 0,
            isActive: true,
            displayText: 'IG',
            state: 'active',
            confidence: 0.9,
            sourcePlatform: 'instagram',
            sourceType: 'manual',
            evidence: null,
            version: 2,
          },
          {
            profileId: PROFILE_ID,
            linkId: 'link_rejected',
            platform: 'spotify',
            platformType: 'listen',
            url: 'https://spotify.com/artist',
            sortOrder: 1,
            isActive: false,
            displayText: null,
            state: 'rejected',
            confidence: 0.5,
            sourcePlatform: 'spotify',
            sourceType: 'ingested',
            evidence: null,
            version: 1,
          },
        ],
      ]);

      const { GET } = await import('@/app/api/dashboard/social-links/route');
      const response = await GET(
        new Request(
          `http://localhost/api/dashboard/social-links?profileId=${PROFILE_ID}`
        )
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.links).toEqual([
        expect.objectContaining({
          id: 'link_active',
          platform: 'instagram',
          url: 'https://instagram.com/artist',
          isActive: true,
          state: 'active',
        }),
      ]);
    });

    it('saves dashboard links with optimistic versioning and rate limit headers', async () => {
      mockSocialLinkDependencies();

      const tx = {
        select: createSelectQueue([
          [
            {
              id: PROFILE_ID,
              usernameNormalized: 'artist',
              avatarUrl: null,
              avatarLockedByUser: false,
              userId: 'user_internal',
            },
          ],
          [],
        ]),
        delete: () => createQueryResult([]),
        insert: () => createQueryResult([]),
        update: () => createQueryResult([]),
      };

      mockSession({ tx });
      mockDb([[]]); // idempotency lookup

      const { PUT } = await import('@/app/api/dashboard/social-links/route');
      const response = await PUT(
        new Request('http://localhost/api/dashboard/social-links', {
          method: 'PUT',
          body: JSON.stringify({
            profileId: PROFILE_ID,
            links: [
              {
                platform: 'instagram',
                url: 'https://instagram.com/artist',
                sortOrder: 0,
                isActive: true,
              },
            ],
            idempotencyKey: 'idem-1',
          }),
        })
      );
      const body = await response.json();

      expectStatusOk(response, body);
      expect(response.headers.get('Cache-Control')).toBe(NO_STORE);
      expect(body).toEqual({ ok: true, version: 1 });
    });
  });
});
