import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getReleasesForProfileLite: vi.fn(),
  unstableCache: vi.fn(),
}));

vi.mock('next/cache', () => ({
  unstable_cache: (
    operation: () => Promise<unknown>,
    keyParts: string[],
    options: { revalidate: number; tags: string[] }
  ) => {
    mocks.unstableCache(keyParts, options);
    return operation;
  },
}));

vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfileLite: mocks.getReleasesForProfileLite,
}));

describe('getCachedPublicReleasesForProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keys and tags the public release projection by immutable profile ID', async () => {
    const releases = [{ id: 'release-1' }];
    mocks.getReleasesForProfileLite.mockResolvedValue(releases);
    const { getCachedPublicReleasesForProfile } = await import(
      '@/lib/releases/public-release-loader'
    );

    await expect(
      getCachedPublicReleasesForProfile('profile-1')
    ).resolves.toEqual(releases);

    expect(mocks.unstableCache).toHaveBeenCalledWith(
      ['public-releases', 'profile-1'],
      expect.objectContaining({
        revalidate: 3600,
        tags: ['public-releases:profile-1'],
      })
    );
    expect(mocks.getReleasesForProfileLite).toHaveBeenCalledWith('profile-1');
  });
});
