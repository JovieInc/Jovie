import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const selectMock = vi.fn();
  const captureMessageMock = vi.fn();

  return {
    selectMock,
    captureMessageMock,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
  },
  doesTableExist: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: hoisted.captureMessageMock,
}));

import { getReleaseForProfileById } from '@/lib/discography/queries';

const CREATOR_PROFILE_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const RELEASE_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

/** Chain for the initial release lookup: select().from().where().limit(1) */
function createReleaseChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

/** Chain for track summaries: select().from().innerJoin().where().groupBy() */
function createTrackSummaryChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  };
}

/** Chain for artist names: select().from().innerJoin().where().orderBy() */
function createArtistNamesChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  };
}

/** Chain for provider links: select().from().where() (awaited directly) */
function createProviderLinksChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function mockHydrationChains() {
  hoisted.selectMock
    .mockReturnValueOnce(createTrackSummaryChain([]))
    .mockReturnValueOnce(createArtistNamesChain([]))
    .mockReturnValueOnce(createProviderLinksChain([]));
}

describe('getReleaseForProfileById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    '<id>',
    'not-a-uuid',
    'rel_1',
    '',
  ])('returns null without querying when releaseId is not a UUID (%s)', async releaseId => {
    const result = await getReleaseForProfileById(
      CREATOR_PROFILE_ID,
      releaseId
    );

    expect(result).toBeNull();
    expect(hoisted.selectMock).not.toHaveBeenCalled();
    expect(hoisted.captureMessageMock).toHaveBeenCalledTimes(1);
    expect(hoisted.captureMessageMock).toHaveBeenCalledWith(
      'getReleaseForProfileById: non-UUID releaseId',
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({ releaseId }),
      })
    );
  });

  it('queries and returns the release for a valid UUID (unchanged behavior)', async () => {
    const releaseRow = {
      id: RELEASE_ID,
      creatorProfileId: CREATOR_PROFILE_ID,
      title: 'Midnight Drive',
      slug: 'midnight-drive',
    };
    hoisted.selectMock.mockReturnValueOnce(createReleaseChain([releaseRow]));
    mockHydrationChains();

    const result = await getReleaseForProfileById(
      CREATOR_PROFILE_ID,
      RELEASE_ID
    );

    expect(result).toEqual({
      ...releaseRow,
      artistNames: [],
      providerLinks: [],
      trackSummary: undefined,
    });
    expect(hoisted.selectMock).toHaveBeenCalledTimes(4);
    expect(hoisted.captureMessageMock).not.toHaveBeenCalled();
  });

  it('returns null for a valid UUID that matches no release', async () => {
    hoisted.selectMock.mockReturnValueOnce(createReleaseChain([]));

    const result = await getReleaseForProfileById(
      CREATOR_PROFILE_ID,
      RELEASE_ID
    );

    expect(result).toBeNull();
    expect(hoisted.selectMock).toHaveBeenCalledTimes(1);
    expect(hoisted.captureMessageMock).not.toHaveBeenCalled();
  });
});
