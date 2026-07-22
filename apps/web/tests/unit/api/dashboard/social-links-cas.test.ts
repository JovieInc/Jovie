import { beforeEach, describe, expect, it, vi } from 'vitest';
import { socialLinks } from '@/lib/db/schema/links';

const PROFILE_ID = '00000000-0000-4000-8000-000000000001';
const LINK_ID = '00000000-0000-4000-8000-000000000002';

const mocks = vi.hoisted(() => ({
  captureError: vi.fn(),
  invalidateSocialLinksCache: vi.fn().mockResolvedValue(undefined),
  syncPrimaryMusicUrls: vi.fn().mockResolvedValue(undefined),
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
  },
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
  select: vi.fn((selection: Record<string, unknown>) => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => {
        if ('clerkId' in selection) {
          return [
            {
              id: PROFILE_ID,
              internalUserId: 'internal-user-1',
              clerkId: 'clerk-user-1',
            },
          ];
        }
        return [{ ...mocks.state }];
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
  insert: vi.fn(() => ({
    values: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('drizzle-orm', async () => {
  const actual =
    await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return { ...actual, and: mocks.and, eq: mocks.eq };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: vi.fn().mockResolvedValue({ userId: 'clerk-user-1' }),
}));
vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: vi.fn(async callback => callback(mockDb, 'clerk-user-1')),
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
    resetBarriers();
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
