import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseProfileContext } from '@/lib/releases/release-types';

const APP_USER_ID = '11111111-1111-4111-8111-111111111111';
const OWN_PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_PROFILE_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
  getReleasesFromDb: vi.fn(),
  getWeeklyReleaseClickCounts: vi.fn(),
  cacheStore: new Map<string, unknown>(),
  withDbSessionTx: vi.fn(),
  verifyProfileOwnership: vi.fn(),
}));

vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => Promise<unknown>, keyParts: unknown[]) => {
    const cacheKey = JSON.stringify(keyParts);
    return async () => {
      if (mocks.cacheStore.has(cacheKey)) {
        return mocks.cacheStore.get(cacheKey);
      }
      const value = await fn();
      mocks.cacheStore.set(cacheKey, value);
      return value;
    };
  },
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/app/app/(shell)/dashboard/actions/dashboard-data', () => ({
  getDashboardDataEssential: vi.fn(),
}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: vi.fn().mockResolvedValue({ userId: APP_USER_ID }),
}));
vi.mock('@/lib/auth/build-app-shell-signin-url', () => ({
  buildAppShellSignInUrl: vi.fn((path: string) => path),
}));
vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: mocks.withDbSessionTx,
}));
vi.mock('@/lib/db/queries/shared', () => ({
  verifyProfileOwnership: mocks.verifyProfileOwnership,
}));
vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfile: mocks.getReleasesFromDb,
  getReleaseForProfileById: vi.fn(),
}));
vi.mock('@/lib/db/queries/analytics', () => ({
  getWeeklyReleaseClickCounts: mocks.getWeeklyReleaseClickCounts,
}));
vi.mock('@/lib/discography/view-models', () => ({
  buildProviderLabels: () => ({}),
}));
vi.mock('@/lib/releases/release-view-models', () => ({
  mapReleaseToViewModel: (release: { id: string }) => ({ id: release.id }),
}));

function context(profileId: string): ReleaseProfileContext {
  return {
    userId: APP_USER_ID,
    profileId,
    profileHandle: 'handle',
    spotifyId: null,
    appleMusicId: null,
    settings: null,
  };
}

describe('release matrix ownership (JOV-6267)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheStore.clear();
    mocks.getReleasesFromDb.mockResolvedValue([]);
    mocks.getWeeklyReleaseClickCounts.mockResolvedValue(new Map());
    mocks.withDbSessionTx.mockImplementation(async operation =>
      operation({ execute: vi.fn() }, APP_USER_ID)
    );
  });

  it('denies own userId + other profileId on cache miss and hit', async () => {
    const { loadReleaseMatrixForProfile, loadArchivedReleaseMatrixForProfile } =
      await import('@/lib/releases/release-matrix-loader');

    mocks.verifyProfileOwnership.mockResolvedValue({ id: OWN_PROFILE_ID });
    await loadReleaseMatrixForProfile(context(OWN_PROFILE_ID));
    await loadArchivedReleaseMatrixForProfile(context(OWN_PROFILE_ID));

    mocks.getReleasesFromDb.mockClear();
    mocks.verifyProfileOwnership.mockResolvedValue(null);
    await expect(
      loadReleaseMatrixForProfile(context(OTHER_PROFILE_ID))
    ).rejects.toThrow('Unauthorized');
    await expect(
      loadArchivedReleaseMatrixForProfile(context(OTHER_PROFILE_ID))
    ).rejects.toThrow('Unauthorized');
    expect(mocks.getReleasesFromDb).not.toHaveBeenCalled();
    expect(mocks.verifyProfileOwnership).toHaveBeenCalledWith(
      expect.anything(),
      OTHER_PROFILE_ID,
      APP_USER_ID
    );
  });
});
