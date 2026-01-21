import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscogRelease } from '@/lib/db/schema';

const hoisted = vi.hoisted(() => {
  const selectMock = vi.fn();
  const doesTableExist = vi.fn();

  return {
    selectMock,
    doesTableExist,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
  },
  doesTableExist: hoisted.doesTableExist,
}));

import {
  getReleaseBySlug,
  getReleasesForProfile,
  getTracksForRelease,
} from '@/lib/discography/queries';

describe('discography table guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty releases when discog releases table is missing', async () => {
    hoisted.doesTableExist.mockResolvedValueOnce(false);

    const result = await getReleasesForProfile('profile_123');

    expect(result).toEqual([]);
    expect(hoisted.selectMock).not.toHaveBeenCalled();
    expect(hoisted.doesTableExist).toHaveBeenCalledWith('discog_releases');
  });

  it('returns empty tracks when discog tracks table is missing', async () => {
    hoisted.doesTableExist.mockResolvedValueOnce(false);

    const result = await getTracksForRelease('release_123');

    expect(result).toEqual([]);
    expect(hoisted.selectMock).not.toHaveBeenCalled();
    expect(hoisted.doesTableExist).toHaveBeenCalledWith('discog_tracks');
  });

  it('returns release data without provider links when provider links table is missing', async () => {
    const release = {
      id: 'release_123',
    } as DiscogRelease;

    const selectLimitMock = vi.fn().mockResolvedValue([release]);
    const selectWhereMock = vi.fn().mockReturnValue({
      limit: selectLimitMock,
    });
    const selectFromMock = vi.fn().mockReturnValue({
      where: selectWhereMock,
    });

    hoisted.selectMock.mockReturnValue({
      from: selectFromMock,
    });

    hoisted.doesTableExist
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await getReleaseBySlug('profile_123', 'release-slug');

    expect(result).toEqual({
      ...release,
      providerLinks: [],
    });
    expect(hoisted.selectMock).toHaveBeenCalledTimes(1);
    expect(hoisted.doesTableExist).toHaveBeenNthCalledWith(
      1,
      'discog_releases'
    );
    expect(hoisted.doesTableExist).toHaveBeenNthCalledWith(2, 'provider_links');
  });
});
