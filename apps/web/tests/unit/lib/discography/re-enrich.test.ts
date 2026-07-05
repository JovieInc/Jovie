import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbExecute = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDiscoverLinksForRelease = vi.hoisted(() => vi.fn());
const mockGetReleasesForProfile = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    execute: mockDbExecute,
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/discography/discovery', () => ({
  discoverLinksForRelease: mockDiscoverLinksForRelease,
}));

vi.mock('@/lib/discography/queries', () => ({
  getReleasesForProfile: mockGetReleasesForProfile,
}));

function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockResolvedValue(rows);
  return chain;
}

describe('re-enrich bounded sweep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();

    mockDiscoverLinksForRelease.mockResolvedValue({
      discovered: [{ providerId: 'spotify' }],
      previewsBackfilled: 0,
      errors: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('limits profile and release queries during cron sweep', async () => {
    mockDbExecute.mockResolvedValueOnce({
      rows: [
        {
          creator_profile_id: 'profile-1',
          display_name: 'Artist One',
          release_count: 3,
          avg_provider_count: '2.0',
        },
      ],
    });
    mockDbExecute.mockResolvedValueOnce({
      rows: [{ release_id: 'release-1' }, { release_id: 'release-2' }],
    });

    const releaseSelect = makeSelectChain([
      {
        id: 'release-1',
        creatorProfileId: 'profile-1',
        title: 'Track A',
        deletedAt: null,
      },
      {
        id: 'release-2',
        creatorProfileId: 'profile-1',
        title: 'Track B',
        deletedAt: null,
      },
    ]);
    const linkSelect = makeSelectChain([
      {
        releaseId: 'release-1',
        providerId: 'spotify',
        ownerType: 'release',
        metadata: {},
        sourceType: 'manual',
      },
    ]);
    mockDbSelect
      .mockReturnValueOnce(releaseSelect)
      .mockReturnValueOnce(linkSelect);

    const { sweepUnderEnrichedProfilesForCron } = await import(
      '@/lib/discography/re-enrich'
    );

    const resultPromise = sweepUnderEnrichedProfilesForCron();
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual({
      profilesProcessed: 1,
      totalLinksDiscovered: 2,
      errors: [],
      hasMoreProfiles: true,
    });
    expect(mockDbExecute).toHaveBeenCalledTimes(2);
    expect(mockDiscoverLinksForRelease).toHaveBeenCalledTimes(2);
    expect(mockGetReleasesForProfile).not.toHaveBeenCalled();
  });

  it('uses bounded release query when releaseLimit is provided', async () => {
    mockDbExecute.mockResolvedValueOnce({
      rows: [{ release_id: 'release-1' }],
    });

    const releaseSelect = makeSelectChain([
      {
        id: 'release-1',
        creatorProfileId: 'profile-1',
        title: 'Track A',
        deletedAt: null,
      },
    ]);
    const linkSelect = makeSelectChain([]);
    mockDbSelect
      .mockReturnValueOnce(releaseSelect)
      .mockReturnValueOnce(linkSelect);

    const { reEnrichProfile } = await import('@/lib/discography/re-enrich');

    const resultPromise = reEnrichProfile('profile-1', { releaseLimit: 3 });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.releasesProcessed).toBe(1);
    expect(result.linksDiscovered).toBe(1);
    expect(mockGetReleasesForProfile).not.toHaveBeenCalled();
    expect(mockDbExecute).toHaveBeenCalledTimes(1);
  });

  it('falls back to full profile catalog when releaseLimit is omitted', async () => {
    mockGetReleasesForProfile.mockResolvedValueOnce([
      {
        id: 'release-1',
        title: 'Track A',
        providerLinks: [],
      },
    ]);

    const { reEnrichProfile } = await import('@/lib/discography/re-enrich');

    const resultPromise = reEnrichProfile('profile-1');
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.releasesProcessed).toBe(1);
    expect(mockGetReleasesForProfile).toHaveBeenCalledWith('profile-1', {
      includeDrafts: true,
    });
    expect(mockDbExecute).not.toHaveBeenCalled();
  });
});
