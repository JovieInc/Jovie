import { describe, expect, it } from 'vitest';
import {
  findExistingRelease,
  normalizeReleaseTitle,
} from '@/lib/discography/release-identity';

const TIM = 'tim-id';
const VIGEL = 'vigel-id';

const vigelVersion = {
  id: 'rel-vigel',
  slug: 'seaside-heights',
  title: 'Seaside Heights',
  upc: 'UPC-2019',
  releaseDate: new Date('2019-09-20T00:00:00.000Z'),
  metadata: {
    spotifyId: 'album-2019',
    spotifyArtists: [{ id: VIGEL }, { id: TIM }],
  },
};

const incoming = (overrides = {}) => ({
  providerAlbumId: 'album-2020',
  upc: 'UPC-2020',
  normalizedTitle: normalizeReleaseTitle('Seaside Heights'),
  artistIds: [TIM],
  releaseDate: new Date('2020-05-15T00:00:00.000Z'),
  ...overrides,
});

describe('findExistingRelease', () => {
  it('never merges a same-title solo recording into the collaboration', () => {
    expect(findExistingRelease(incoming(), [vigelVersion])).toBeNull();
  });

  it('never merges a same-title, same-artist re-release on another date', () => {
    const solo = {
      ...vigelVersion,
      metadata: { spotifyId: 'x', spotifyArtists: [{ id: TIM }] },
    };
    expect(findExistingRelease(incoming(), [solo])).toBeNull();
  });

  it('matches by provider album id first', () => {
    expect(
      findExistingRelease(incoming({ providerAlbumId: 'album-2019' }), [
        vigelVersion,
      ])?.id
    ).toBe('rel-vigel');
  });

  it('matches by UPC', () => {
    expect(
      findExistingRelease(incoming({ upc: 'UPC-2019' }), [vigelVersion])?.id
    ).toBe('rel-vigel');
  });

  it('treats a market edition (same title, artists, date) as the same release', () => {
    expect(
      findExistingRelease(
        incoming({
          providerAlbumId: 'album-2019-gb',
          upc: null,
          artistIds: [TIM, VIGEL],
          releaseDate: new Date('2019-09-20T00:00:00.000Z'),
        }),
        [vigelVersion]
      )?.id
    ).toBe('rel-vigel');
  });

  it('re-verifies a legacy row (no provider id in metadata) through its Spotify link', () => {
    const legacy = {
      ...vigelVersion,
      id: 'rel-legacy',
      metadata: {},
      providerLinked: true,
    };
    expect(findExistingRelease(incoming(), [legacy])?.id).toBe('rel-legacy');
  });
});
