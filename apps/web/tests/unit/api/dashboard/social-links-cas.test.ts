import { beforeEach, describe, expect, it, vi } from 'vitest';
import { socialLinks } from '@/lib/db/schema/links';

const PROFILE_ID = '00000000-0000-4000-8000-000000000001';
const LINK_ID = '00000000-0000-4000-8000-000000000002';

interface LinkState {
  id: string;
  creatorProfileId: string;
  platform: string;
  url: string;
  isActive: boolean;
  state: string;
  version: number;
}

const mocks = vi.hoisted(() => ({
  captureError: vi.fn(),
  invalidateSocialLinksCache: vi.fn().mockResolvedValue(undefined),
  syncPrimaryMusicUrls: vi.fn().mockResolvedValue(undefined),
  getCachedAuth: vi.fn(),
  profileLeftJoin: vi.fn(),
  selections: [] as Record<string, unknown>[],
  eq: vi.fn((left, right) => ({ left, right })),
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  state: {
    id: '00000000-0000-4000-8000-000000000002',
    creatorProfileId: '00000000-0000-4000-8000-000000000001',
    platform: 'instagram',
    url: 'https://instagram.com/older',
    isActive: true,
    state: 'active',
    version: 1,
  } as LinkState | null,
  concurrentCreateWins: false,
  transactionTail: Promise.resolve(),
  deleteUpdateReached: Promise.resolve(),
  resolveDeleteUpdateReached: undefined as (() => void) | undefined,
  releaseDeleteUpdate: undefined as (() => void) | undefined,
  deleteUpdateGate: Promise.resolve(),
}));

function resetBarriers() {
  mocks.deleteUpdateReached = new Promise<void>(resolve => {
    mocks.resolveDeleteUpdateReached = resolve;
  });
  mocks.deleteUpdateGate = new Promise<void>(resolve => {
    mocks.releaseDeleteUpdate = resolve;
  });
}

function versionFromPredicate(predicate: {
  conditions: Array<{ left: unknown; right: unknown }>;
}): number | undefined {
  return predicate.conditions.find(
    condition => condition.left === socialLinks.version
  )?.right as number | undefined;
}

const mockDb = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue([]),
  select: vi.fn((selection: Record<string, unknown>) => {
    mocks.selections.push(selection);
    const chain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: mocks.profileLeftJoin.mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => {
        if ('internalUserId' in selection) {
          return [
            {
              id: PROFILE_ID,
              internalUserId: 'internal-user-1',
            },
          ];
        }
        return mocks.state ? [{ ...mocks.state }] : [];
      }),
    };
    return chain;
  }),
  update: vi.fn(() => {
    let values: Record<string, unknown> = {};
    let predicate: {
      conditions: Array<{ left: unknown; right: unknown }>;
    };
    const chain = {
      set(nextValues: Record<string, unknown>) {
        values = nextValues;
        return chain;
      },
      where(nextPredicate: typeof predicate) {
        predicate = nextPredicate;
        return chain;
      },
      async returning() {
        if (values.state === 'rejected') {
          mocks.resolveDeleteUpdateReached?.();
          await mocks.deleteUpdateGate;
        }
        if (!mocks.state) return [];
        if (versionFromPredicate(predicate) !== mocks.state.version) return [];
        mocks.state = {
          ...mocks.state,
          ...values,
          version: Number(values.version),
        };
        return [{ id: mocks.state.id, version: mocks.state.version }];
      },
    };
    return chain;
  }),
  insert: vi.fn((table: unknown) => {
    if (table !== socialLinks) {
      return {
        values: vi.fn().mockResolvedValue([]),
      };
    }

    let values: Record<string, unknown> = {};
    const chain = {
      values(nextValues: Record<string, unknown>) {
        values = nextValues;
        return chain;
      },
      onConflictDoNothing: vi.fn(() => chain),
      async returning() {
        if (mocks.concurrentCreateWins) {
          mocks.state = {
            id: LINK_ID,
            creatorProfileId: PROFILE_ID,
            platform: String(values.platform),
            url: String(values.url),
            isActive: true,
            state: 'active',
            version: 1,
          };
          return [];
        }

        mocks.state = {
          id: LINK_ID,
          creatorProfileId: PROFILE_ID,
          platform: String(values.platform),
          url: String(values.url),
          isActive: true,
          state: 'active',
          version: 1,
        };
        return [{ id: LINK_ID }];
      },
    };
    return chain;
  }),
}));

vi.mock('drizzle-orm', async () => {
  const actual =
    await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return { ...actual, and: mocks.and, eq: mocks.eq };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mocks.getCachedAuth,
}));
vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: vi.fn(async callback => {
    let release: (() => void) | undefined;
    const tx = {
      ...mockDb,
      execute: async (...args: unknown[]) => {
        const previous = mocks.transactionTail;
        mocks.transactionTail = new Promise<void>(resolve => {
          release = resolve;
        });
        await previous;
        return mockDb.execute(...args);
      },
    };
    try {
      return await callback(tx, 'clerk-user-1');
    } finally {
      release?.();
    }
  }),
}));
vi.mock('@/lib/db/queries/shared', () => ({
  getAuthenticatedProfile: vi.fn().mockResolvedValue({
    id: PROFILE_ID,
    usernameNormalized: 'artist',
  }),
}));
vi.mock('@/lib/db/social-links-sync', () => ({
  syncPrimaryMusicUrlsFromSocialLinks: mocks.syncPrimaryMusicUrls,
}));
vi.mock('@/lib/cache', () => ({
  invalidateSocialLinksCache: mocks.invalidateSocialLinksCache,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));
vi.mock('@/lib/rate-limit', () => ({
  createRateLimitHeaders: vi.fn(() => ({})),
  dashboardLinksLimiter: {
    limit: vi.fn().mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
    }),
  },
  getClientIP: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

describe('social link compare-and-swap routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state = {
      id: LINK_ID,
      creatorProfileId: PROFILE_ID,
      platform: 'instagram',
      url: 'https://instagram.com/older',
      isActive: true,
      state: 'active',
      version: 1,
    };
    mocks.getCachedAuth.mockResolvedValue({ userId: 'internal-user-1' });
    mocks.selections = [];
    mocks.concurrentCreateWins = false;
    mocks.transactionTail = Promise.resolve();
    resetBarriers();
  });

  it('authorizes a post-cutover profile by app user UUID without joining legacy Clerk identity', async () => {
    const { POST } = await import('@/app/api/chat/confirm-link/route');

    const response = await POST(
      new Request('http://localhost/api/chat/confirm-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: PROFILE_ID,
          platform: 'instagram',
          url: 'https://instagram.com/newer',
          normalizedUrl: 'https://instagram.com/newer',
          expectedVersion: 1,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.selections[0]).toEqual({
      id: expect.anything(),
      internalUserId: expect.anything(),
    });
    expect(mocks.selections[0]).not.toHaveProperty('clerkId');
    expect(mocks.profileLeftJoin).not.toHaveBeenCalled();
  });

  it('denies a different app user even when legacy Clerk identity is unavailable', async () => {
    mocks.getCachedAuth.mockResolvedValue({ userId: 'different-app-user' });
    const { POST } = await import('@/app/api/chat/confirm-link/route');

    const response = await POST(
      new Request('http://localhost/api/chat/confirm-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: PROFILE_ID,
          platform: 'instagram',
          url: 'https://instagram.com/newer',
          normalizedUrl: 'https://instagram.com/newer',
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.profileLeftJoin).not.toHaveBeenCalled();
  });

  it('returns a version conflict when deletion wins before a stale update reaches the server', async () => {
    mocks.state = null;
    const { POST } = await import('@/app/api/chat/confirm-link/route');

    const response = await POST(
      new Request('http://localhost/api/chat/confirm-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: PROFILE_ID,
          platform: 'instagram',
          url: 'https://instagram.com/newer',
          normalizedUrl: 'https://instagram.com/newer',
          expectedVersion: 1,
        }),
      })
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'VERSION_CONFLICT',
      expectedVersion: 1,
    });
    expect(mockDb.insert).not.toHaveBeenCalledWith(socialLinks);
    expect(mocks.state).toBeNull();
  });

  it('returns a version conflict when an identical concurrent create wins the unique insert', async () => {
    mocks.state = null;
    mocks.concurrentCreateWins = true;
    const { POST } = await import('@/app/api/chat/confirm-link/route');

    const response = await POST(
      new Request('http://localhost/api/chat/confirm-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: PROFILE_ID,
          platform: 'instagram',
          url: 'https://instagram.com/concurrent',
          normalizedUrl: 'https://instagram.com/concurrent',
        }),
      })
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'VERSION_CONFLICT',
      expectedVersion: 0,
      currentVersion: 1,
    });
    expect(mocks.syncPrimaryMusicUrls).not.toHaveBeenCalled();
  });

  it('serializes concurrent different-URL creates for the same platform', async () => {
    mocks.state = null;
    const { POST } = await import('@/app/api/chat/confirm-link/route');
    const request = (url: string) =>
      POST(
        new Request('http://localhost/api/chat/confirm-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId: PROFILE_ID,
            platform: 'instagram',
            url,
            normalizedUrl: url,
          }),
        })
      );

    const [first, second] = await Promise.all([
      request('https://instagram.com/first'),
      request('https://instagram.com/second'),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toMatchObject({
      linkId: LINK_ID,
      outcome: 'created',
    });
    expect(await second.json()).toMatchObject({
      linkId: LINK_ID,
      outcome: 'updated',
    });
    expect(mockDb.insert).toHaveBeenCalledWith(socialLinks);
    expect(
      mockDb.insert.mock.calls.filter(([table]) => table === socialLinks)
    ).toHaveLength(1);
    expect(mocks.state).toMatchObject({
      id: LINK_ID,
      url: 'https://instagram.com/second',
      version: 2,
    });
    expect(mockDb.execute).toHaveBeenCalledTimes(2);
  });

  it('accepts a social link through PATCH with compare-and-swap versioning', async () => {
    mocks.state = {
      ...mocks.state!,
      isActive: false,
      state: 'suggested',
    };
    const { PATCH } = await import(
      '@/app/api/dashboard/social-links/route.patch'
    );

    const response = await PATCH(
      new Request('http://localhost/api/dashboard/social-links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: PROFILE_ID,
          linkId: LINK_ID,
          action: 'accept',
          expectedVersion: 1,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      version: 2,
      link: {
        id: LINK_ID,
        isActive: true,
        state: 'active',
        version: 2,
      },
    });
    expect(mocks.state).toMatchObject({
      isActive: true,
      state: 'active',
      version: 2,
    });
    expect(mocks.syncPrimaryMusicUrls).toHaveBeenCalledWith(
      expect.objectContaining({
        select: mockDb.select,
        update: mockDb.update,
      }),
      PROFILE_ID
    );
    expect(mocks.invalidateSocialLinksCache).toHaveBeenCalledWith(
      PROFILE_ID,
      'artist'
    );
  });

  it('returns VERSION_CONFLICT from PATCH before mutating a stale link', async () => {
    const { PATCH } = await import(
      '@/app/api/dashboard/social-links/route.patch'
    );

    const response = await PATCH(
      new Request('http://localhost/api/dashboard/social-links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: PROFILE_ID,
          linkId: LINK_ID,
          action: 'dismiss',
          expectedVersion: 2,
        }),
      })
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: 'VERSION_CONFLICT',
      expectedVersion: 2,
      currentVersion: 1,
    });
    expect(mocks.state).toMatchObject({
      isActive: true,
      state: 'active',
      version: 1,
    });
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mocks.syncPrimaryMusicUrls).not.toHaveBeenCalled();
    expect(mocks.invalidateSocialLinksCache).not.toHaveBeenCalled();
  });

  it('rejects an older delete after a newer re-add wins the same link version', async () => {
    const { DELETE } = await import(
      '@/app/api/dashboard/social-links/route.delete'
    );
    const { POST } = await import('@/app/api/chat/confirm-link/route');

    const olderDelete = DELETE(
      new Request('http://localhost/api/dashboard/social-links', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: PROFILE_ID,
          linkId: LINK_ID,
          action: 'dismiss',
          expectedVersion: 1,
        }),
      })
    );
    await mocks.deleteUpdateReached;

    const newerAddResponse = await POST(
      new Request('http://localhost/api/chat/confirm-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: PROFILE_ID,
          platform: 'instagram',
          url: 'https://instagram.com/newer',
          normalizedUrl: 'https://instagram.com/newer',
          expectedVersion: 1,
        }),
      })
    );
    mocks.releaseDeleteUpdate?.();
    const olderDeleteResponse = await olderDelete;

    expect(newerAddResponse.status).toBe(200);
    expect(await newerAddResponse.json()).toMatchObject({
      linkId: LINK_ID,
      version: 2,
      outcome: 'updated',
    });
    expect(olderDeleteResponse.status).toBe(409);
    expect(await olderDeleteResponse.json()).toMatchObject({
      code: 'VERSION_CONFLICT',
      expectedVersion: 1,
      currentVersion: 2,
    });
    expect(mocks.state).toMatchObject({
      url: 'https://instagram.com/newer',
      isActive: true,
      state: 'active',
      version: 2,
    });
    expect(mocks.syncPrimaryMusicUrls).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateSocialLinksCache).not.toHaveBeenCalled();
  });
});
