/**
 * Unit tests for resolveEntityIds() — Wikidata + ISNI extraction from MusicBrainz.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetMusicBrainzArtist = vi.hoisted(() => vi.fn());
const mockStoreRawIdentityLinks = vi.hoisted(() => vi.fn());

vi.mock('@/lib/dsp-enrichment/providers/musicbrainz', () => ({
  getMusicBrainzArtist: mockGetMusicBrainzArtist,
}));

vi.mock('@/lib/identity/store', () => ({
  storeRawIdentityLinks: mockStoreRawIdentityLinks,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { resolveEntityIds } from '@/lib/entity/resolve';

describe('resolveEntityIds', () => {
  const tx = {} as Parameters<typeof resolveEntityIds>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreRawIdentityLinks.mockResolvedValue(2);
  });

  it('stores Wikidata QID and ISNI from MusicBrainz artist record', async () => {
    mockGetMusicBrainzArtist.mockResolvedValue({
      name: 'Long Tail Artist',
      relations: [
        {
          type: 'wikidata',
          url: { resource: 'https://www.wikidata.org/wiki/Q12345' },
        },
      ],
      isnis: ['0000 0001 2103 2683'],
    });

    const result = await resolveEntityIds(
      tx,
      'profile-1',
      'mbid-abc',
      'https://open.spotify.com/artist/spotid'
    );

    expect(result).toEqual({
      wikidata: 'Q12345',
      isnis: ['0000 0001 2103 2683'],
    });
    expect(mockStoreRawIdentityLinks).toHaveBeenCalledWith(
      tx,
      'profile-1',
      'musicbrainz_entity_resolution',
      'https://open.spotify.com/artist/spotid',
      expect.arrayContaining([
        expect.objectContaining({
          platform: 'wikidata',
          externalId: 'Q12345',
          url: 'https://www.wikidata.org/wiki/Q12345',
        }),
        expect.objectContaining({
          platform: 'isni',
          externalId: '0000000121032683',
          url: 'https://isni.org/isni/0000000121032683',
        }),
      ])
    );
  });

  it('returns null when MusicBrainz lookup fails', async () => {
    mockGetMusicBrainzArtist.mockRejectedValue(new Error('timeout'));

    const result = await resolveEntityIds(
      tx,
      'profile-1',
      'mbid-abc',
      'https://open.spotify.com/artist/spotid'
    );

    expect(result).toBeNull();
    expect(mockStoreRawIdentityLinks).not.toHaveBeenCalled();
  });

  it('returns empty isnis when MusicBrainz artist has no url-rels or ISNIs', async () => {
    mockGetMusicBrainzArtist.mockResolvedValue({
      name: 'Unlinked Artist',
      relations: [],
      isnis: [],
    });

    const result = await resolveEntityIds(
      tx,
      'profile-2',
      'mbid-xyz',
      'https://musicbrainz.org/artist/mbid-xyz'
    );

    expect(result).toEqual({ wikidata: null, isnis: [] });
    expect(mockStoreRawIdentityLinks).not.toHaveBeenCalled();
  });
});
