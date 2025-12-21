import { NextRequest } from 'next/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PUT, PATCH } from '@/app/api/dashboard/social-links/route';

const hoisted = vi.hoisted(() => {
  const profileResult = [
    {
      id: 'profile_123',
      usernameNormalized: 'artist-profile',
      avatarUrl: null,
      avatarLockedByUser: false,
      userId: 'user_uuid_123',
    },
  ];
  const existingLinksResult = [
    { id: 'link_1', sourceType: 'manual', version: 1 },
  ];
  const suggestedLinkResult = [
    {
      id: 'link_suggested',
      creatorProfileId: 'profile_123',
      platform: 'spotify',
      platformType: 'dsp',
      url: 'https://spotify.com/artist/123',
      sortOrder: 0,
      isActive: false,
      displayText: null,
      state: 'suggested',
      confidence: '0.80',
      sourcePlatform: null,
      sourceType: 'ingested',
      evidence: {},
      version: 1,
    },
  ];
  const activeLinkResult = [
    {
      id: 'link_active',
      creatorProfileId: 'profile_123',
      platform: 'instagram',
      platformType: 'social',
      url: 'https://instagram.com/artist',
      sortOrder: 0,
      isActive: true,
      displayText: null,
      state: 'active',
      confidence: '1.00',
      sourcePlatform: null,
      sourceType: 'manual',
      evidence: {},
      version: 2,
    },
  ];

  const withDbSession = vi.fn(
    async (callback: (userId: string) => Promise<Response>) =>
      callback('user_123')
  );

  const withDbSessionTx = vi.fn(
    async (callback: (tx: unknown, userId: string) => Promise<Response>) =>
      callback({}, 'user_123')
  );

  const select = vi.fn().mockImplementation(() => {
    const where = vi.fn().mockResolvedValue(existingLinksResult);
    const innerJoin = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(profileResult),
      }),
    });

    return {
      from: vi.fn().mockReturnValue({
        innerJoin,
        where,
      }),
    };
  });

  const deleteFn = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  });

  const insertFn = vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  });

  const updateFn = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([activeLinkResult[0]]),
      }),
    }),
  });

  const rateLimitResult = {
    success: true,
    limit: 30,
    remaining: 29,
    reset: Date.now() + 60000,
  };

  return {
    withDbSession,
    withDbSessionTx,
    select,
    deleteFn,
    insertFn,
    updateFn,
    profileResult,
    existingLinksResult,
    suggestedLinkResult,
    activeLinkResult,
    rateLimitResult,
  };
});

vi.mock('@/lib/auth/session', () => ({
  withDbSession: hoisted.withDbSession,
  withDbSessionTx: hoisted.withDbSessionTx,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.select,
    delete: hoisted.deleteFn,
    insert: hoisted.insertFn,
    update: hoisted.updateFn,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: { id: 'id', userId: 'user_id' },
  socialLinks: {
    id: 'id',
    creatorProfileId: 'creator_profile_id',
    version: 'version',
  },
  users: { id: 'id', clerkId: 'clerk_id' },
  dashboardIdempotencyKeys: {
    key: 'key',
    userId: 'user_id',
    endpoint: 'endpoint',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  eq: vi.fn((left: unknown, right: unknown) => [left, right]),
  gt: vi.fn((left: unknown, right: unknown) => [left, right]),
  inArray: vi.fn((column: unknown, values: unknown) => [column, values]),
  sql: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  dashboardLinksRateLimit: {
    limit: vi.fn().mockResolvedValue(hoisted.rateLimitResult),
  },
  createRateLimitHeaders: vi.fn().mockReturnValue({
    'X-RateLimit-Limit': '30',
    'X-RateLimit-Remaining': '29',
    'X-RateLimit-Reset': new Date().toISOString(),
  }),
}));

vi.mock('@/lib/ingestion/jobs', () => ({
  enqueueBeaconsIngestionJob: vi.fn().mockResolvedValue(undefined),
  enqueueLayloIngestionJob: vi.fn().mockResolvedValue(undefined),
  enqueueLinktreeIngestionJob: vi.fn().mockResolvedValue(undefined),
  enqueueYouTubeIngestionJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/ingestion/magic-profile-avatar', () => ({
  maybeSetProfileAvatarFromLinks: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/ingestion/strategies/beacons', () => ({
  isBeaconsUrl: vi.fn().mockReturnValue(false),
  validateBeaconsUrl: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/ingestion/strategies/laylo', () => ({
  isLayloUrl: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/ingestion/strategies/linktree', () => ({
  isLinktreeUrl: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/ingestion/strategies/youtube', () => ({
  validateYouTubeChannelUrl: vi.fn().mockReturnValue(null),
}));

describe('PUT /api/dashboard/social-links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid request body', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'not-json',
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error?: string };
    expect(data.error).toBe('Invalid request body');
  });

  it('rejects dangerous URL protocols', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          links: [
            {
              platform: 'website',
              url: 'javascript:alert(1)',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error?: string };
    expect(data.error).toContain('Invalid URL protocol');
  });

  it('rejects internal IP addresses', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          links: [
            {
              platform: 'website',
              url: 'http://192.168.1.1/admin',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error?: string };
    expect(data.error).toContain('internal');
  });

  it('rejects localhost URLs', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          links: [
            {
              platform: 'website',
              url: 'http://localhost:3000/secret',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error?: string };
    expect(data.error).toContain('internal');
  });

  it('rejects cloud metadata endpoints', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          links: [
            {
              platform: 'website',
              url: 'http://169.254.169.254/latest/meta-data/',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error?: string };
    expect(data.error).toContain('metadata');
  });

  it('returns 400 when platform is invalid', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          links: [
            {
              platform: 'not_a_platform',
              url: 'https://example.com',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error?: string };
    expect(data.error).toBe('Invalid platform');
  });

  it('returns 200 and ok true with version for valid payload', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          links: [
            {
              platform: 'website',
              url: 'https://example.com',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(200);
    const data = (await response.json()) as { ok?: boolean; version?: number };
    expect(data.ok).toBe(true);
    expect(data.version).toBeDefined();
  });

  it('accepts idempotencyKey in request body', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          idempotencyKey: 'test-key-123',
          links: [
            {
              platform: 'website',
              url: 'https://example.com',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(200);
    const data = (await response.json()) as { ok?: boolean };
    expect(data.ok).toBe(true);
  });

  it('accepts expectedVersion for optimistic locking', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          expectedVersion: 1,
          links: [
            {
              platform: 'website',
              url: 'https://example.com',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(200);
    const data = (await response.json()) as { ok?: boolean; version?: number };
    expect(data.ok).toBe(true);
  });

  it('includes rate limit headers in response', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          links: [],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.headers.get('X-RateLimit-Limit')).toBeDefined();
    expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
  });

  it('returns 409 when expectedVersion does not match current version', async () => {
    // Configure select to return existing links with version 5
    hoisted.select.mockImplementation(() => {
      const where = vi
        .fn()
        .mockResolvedValue([
          { id: 'link_1', sourceType: 'manual', version: 5 },
        ]);
      const innerJoin = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(hoisted.profileResult),
        }),
      });

      return {
        from: vi.fn().mockReturnValue({
          innerJoin,
          where,
        }),
      };
    });

    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          expectedVersion: 3, // Outdated version
          links: [
            {
              platform: 'website',
              url: 'https://example.com',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(409);
    const data = (await response.json()) as {
      error?: string;
      code?: string;
      currentVersion?: number;
      expectedVersion?: number;
    };
    expect(data.code).toBe('VERSION_CONFLICT');
    expect(data.currentVersion).toBe(5);
    expect(data.expectedVersion).toBe(3);
  });

  it('returns 409 when expectedVersion is provided but no links exist (empty state)', async () => {
    // Configure select to return no existing links (empty state = version 0)
    hoisted.select.mockImplementation(() => {
      const where = vi.fn().mockResolvedValue([]); // No existing links
      const innerJoin = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(hoisted.profileResult),
        }),
      });

      return {
        from: vi.fn().mockReturnValue({
          innerJoin,
          where,
        }),
      };
    });

    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          expectedVersion: 1, // Client thinks version is 1, but no links exist (version 0)
          links: [
            {
              platform: 'website',
              url: 'https://example.com',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(409);
    const data = (await response.json()) as {
      error?: string;
      code?: string;
      currentVersion?: number;
    };
    expect(data.code).toBe('VERSION_CONFLICT');
    expect(data.currentVersion).toBe(0);
  });
});

describe('PATCH /api/dashboard/social-links', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Configure select to return suggested link for PATCH tests
    hoisted.select.mockImplementation(() => {
      const where = vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(hoisted.suggestedLinkResult),
      });
      const innerJoin = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(hoisted.profileResult),
        }),
      });

      return {
        from: vi.fn().mockReturnValue({
          innerJoin,
          where,
        }),
      };
    });
  });

  it('returns 400 for invalid request body', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'not-json',
      }
    );

    const response = await PATCH(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error?: string };
    expect(data.error).toBe('Invalid request body');
  });

  it('returns 400 when action is invalid', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          linkId: 'link_suggested',
          action: 'invalid_action',
        }),
      }
    );

    const response = await PATCH(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error?: string };
    expect(data.error).toBe('Invalid request body');
  });

  it('accepts expectedVersion for optimistic locking', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          linkId: 'link_suggested',
          action: 'accept',
          expectedVersion: 1,
        }),
      }
    );

    const response = await PATCH(request as unknown as Request);

    expect(response.status).toBe(200);
    const data = (await response.json()) as { ok?: boolean };
    expect(data.ok).toBe(true);
  });

  it('includes rate limit headers in response', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          linkId: 'link_suggested',
          action: 'accept',
        }),
      }
    );

    const response = await PATCH(request as unknown as Request);

    expect(response.headers.get('X-RateLimit-Limit')).toBeDefined();
  });

  it('returns 400 with INVALID_STATE_TRANSITION when link is not in suggested state', async () => {
    // Configure select to return an active link (not suggested)
    hoisted.select.mockImplementation(() => {
      const where = vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(hoisted.activeLinkResult), // state: 'active'
      });
      const innerJoin = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(hoisted.profileResult),
        }),
      });

      return {
        from: vi.fn().mockReturnValue({
          innerJoin,
          where,
        }),
      };
    });

    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          linkId: 'link_active',
          action: 'accept', // Trying to accept an already-active link
        }),
      }
    );

    const response = await PATCH(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as {
      error?: string;
      code?: string;
      currentState?: string;
    };
    expect(data.code).toBe('INVALID_STATE_TRANSITION');
    expect(data.currentState).toBe('active');
    expect(data.error).toContain('only suggested links');
  });

  it('returns 409 when expectedVersion does not match for PATCH', async () => {
    // Configure select to return suggested link with different version
    hoisted.select.mockImplementation(() => {
      const where = vi.fn().mockReturnValue({
        limit: vi
          .fn()
          .mockResolvedValue([
            { ...hoisted.suggestedLinkResult[0], version: 5 },
          ]),
      });
      const innerJoin = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(hoisted.profileResult),
        }),
      });

      return {
        from: vi.fn().mockReturnValue({
          innerJoin,
          where,
        }),
      };
    });

    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          linkId: 'link_suggested',
          action: 'accept',
          expectedVersion: 2, // Outdated version
        }),
      }
    );

    const response = await PATCH(request as unknown as Request);

    expect(response.status).toBe(409);
    const data = (await response.json()) as {
      error?: string;
      code?: string;
      currentVersion?: number;
    };
    expect(data.code).toBe('VERSION_CONFLICT');
    expect(data.currentVersion).toBe(5);
  });
});

describe('URL validation', () => {
  it('blocks data: URLs', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          links: [
            {
              platform: 'website',
              url: 'data:text/html,<script>alert(1)</script>',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error?: string };
    expect(data.error).toContain('Invalid URL protocol');
  });

  it('blocks vbscript: URLs', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          links: [
            {
              platform: 'website',
              url: 'vbscript:msgbox("test")',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error?: string };
    expect(data.error).toContain('Invalid URL protocol');
  });

  it('blocks file: URLs', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          links: [
            {
              platform: 'website',
              url: 'file:///etc/passwd',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error?: string };
    expect(data.error).toContain('Invalid URL protocol');
  });

  it('blocks 10.x.x.x private IPs', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          links: [
            {
              platform: 'website',
              url: 'http://10.0.0.1/admin',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error?: string };
    expect(data.error).toContain('internal');
  });

  it('blocks 172.16.x.x-172.31.x.x private IPs', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          links: [
            {
              platform: 'website',
              url: 'http://172.16.0.1/admin',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error?: string };
    expect(data.error).toContain('internal');
  });

  it('blocks 127.x.x.x loopback IPs', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          links: [
            {
              platform: 'website',
              url: 'http://127.0.0.1:8080/secret',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error?: string };
    expect(data.error).toContain('internal');
  });

  it('allows valid public URLs', async () => {
    const request = new NextRequest(
      'http://localhost/api/dashboard/social-links',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          links: [
            {
              platform: 'spotify',
              url: 'https://open.spotify.com/artist/123abc',
            },
          ],
        }),
      }
    );

    const response = await PUT(request as unknown as Request);

    expect(response.status).toBe(200);
    const data = (await response.json()) as { ok?: boolean };
    expect(data.ok).toBe(true);
  });
});
