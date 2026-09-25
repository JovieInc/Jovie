import { describe, expect, it } from 'vitest';
import {
  formatSchemaEventStartDate,
  generateMerchStructuredData,
  generateMusicStructuredData,
  generateProfileStructuredData,
  resolveArtistEntityType,
  resolveMusicContentSchemaType,
  validateMerchRichResults,
  validateMusicRichResults,
  validateProfileRichResults,
} from '@/lib/seo/structured-data';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { CreatorProfile, LegacySocialLink } from '@/types/db';

const BASE_PROFILE: CreatorProfile = {
  id: 'profile-123',
  user_id: 'user-456',
  creator_type: 'artist',
  username: 'testartist',
  display_name: 'Test Artist',
  bio: 'An amazing artist making great music.',
  avatar_url: 'https://example.com/avatar.jpg',
  spotify_url: 'https://open.spotify.com/artist/123',
  apple_music_url: 'https://music.apple.com/artist/123',
  youtube_url: 'https://youtube.com/channel/123',
  spotify_id: 'spotify-123',
  is_public: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  is_claimed: true,
  claim_token: null,
  claimed_at: '2024-01-01T00:00:00Z',
  profile_views: 100,
  username_normalized: 'testartist',
  search_text: 'test artist',
  display_title: 'Test Artist',
  profile_completion_pct: 80,
  settings: {},
  theme: {},
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
  location: 'Los Angeles, CA',
  active_since_year: 2018,
};

const MOCK_LINKS: LegacySocialLink[] = [
  {
    id: 'link-1',
    artist_id: 'profile-123',
    platform: 'spotify',
    url: 'https://open.spotify.com/artist/123',
    clicks: 50,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'link-2',
    artist_id: 'profile-123',
    platform: 'instagram',
    url: 'https://instagram.com/testartist',
    clicks: 30,
    created_at: '2024-01-01T00:00:00Z',
  },
];

const TOUR_DATE: TourDateViewModel = {
  id: 'td-1',
  profileId: 'profile-123',
  externalId: null,
  provider: 'manual',
  eventType: 'tour',
  confirmationStatus: 'confirmed',
  reviewedAt: null,
  title: 'Summer Tour Night',
  startDate: '2026-07-15T03:00:00.000Z',
  startTime: '20:00',
  timezone: 'America/Los_Angeles',
  venueName: 'The Forum',
  city: 'Los Angeles',
  region: 'CA',
  country: 'US',
  latitude: 33.95,
  longitude: -118.34,
  ticketUrl: 'https://tickets.example.com/td-1',
  ticketStatus: 'available',
  lastSyncedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function findInGraph(
  data: Record<string, unknown>,
  type: string
): Record<string, unknown> | undefined {
  const graph = data['@graph'] as Record<string, unknown>[];
  return graph.find(item => {
    const nodeType = item['@type'];
    if (typeof nodeType === 'string') return nodeType === type;
    if (Array.isArray(nodeType)) return nodeType.includes(type);
    return false;
  });
}

describe('structured-data entity types', () => {
  it('resolves solo artists as MusicGroup + Person', () => {
    expect(resolveArtistEntityType('artist')).toEqual(['MusicGroup', 'Person']);
    expect(resolveArtistEntityType('podcaster')).toBe('MusicGroup');
  });

  it('resolves releases as MusicAlbum + MusicRelease', () => {
    expect(resolveMusicContentSchemaType('release')).toEqual([
      'MusicAlbum',
      'MusicRelease',
    ]);
    expect(resolveMusicContentSchemaType('track')).toBe('MusicRecording');
  });
});

describe('formatSchemaEventStartDate', () => {
  it('formats startDate with explicit timezone offset', () => {
    const formatted = formatSchemaEventStartDate(
      '2026-07-15T03:00:00.000Z',
      'America/Los_Angeles'
    );
    expect(formatted).toMatch(/^2026-07-14T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it('formats UTC startDate with explicit zero offset', () => {
    const formatted = formatSchemaEventStartDate(
      '2026-07-15T03:00:00.000Z',
      'UTC'
    );
    expect(formatted).toMatch(/^2026-07-15T\d{2}:\d{2}:\d{2}\+00:00$/);
  });
});

describe('generateProfileStructuredData', () => {
  it('matches golden snapshot for profile entity graph', () => {
    const data = generateProfileStructuredData(
      BASE_PROFILE,
      ['rock', 'indie'],
      MOCK_LINKS,
      [TOUR_DATE]
    );

    expect(data).toMatchSnapshot();
    expect(validateProfileRichResults(data)).toEqual([]);
  });

  it('emits MusicGroup + Person for solo artists', () => {
    const data = generateProfileStructuredData(
      BASE_PROFILE,
      ['pop'],
      MOCK_LINKS
    );
    const artist = findInGraph(data, 'MusicGroup');
    expect(artist?.['@type']).toEqual(['MusicGroup', 'Person']);
  });

  it('includes MusicEvent with offset startDate, location, and offers', () => {
    const data = generateProfileStructuredData(
      BASE_PROFILE,
      ['pop'],
      MOCK_LINKS,
      [TOUR_DATE]
    );
    const event = findInGraph(data, 'MusicEvent');
    expect(event?.name).toBe('Summer Tour Night');
    expect(event?.startDate).toMatch(/[+-]\d{2}:\d{2}$/);
    expect(event?.location).toBeDefined();
    expect(event?.offers).toMatchObject({
      '@type': 'Offer',
      url: 'https://tickets.example.com/td-1',
    });
  });

  it('omits sameAs when no valid social URLs exist', () => {
    const data = generateProfileStructuredData(
      {
        ...BASE_PROFILE,
        spotify_url: '',
        apple_music_url: null,
        youtube_url: null,
        musicbrainz_id: null,
      },
      ['pop'],
      [
        {
          id: 'empty-link',
          artist_id: 'profile-123',
          platform: 'instagram',
          url: '   ',
          clicks: 0,
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
      [],
      []
    );
    const artist = findInGraph(data, 'MusicGroup');
    expect(artist?.sameAs).toBeUndefined();
  });

  it('emits linked-entity mentions on the artist node', () => {
    const data = generateProfileStructuredData(
      BASE_PROFILE,
      ['pop'],
      MOCK_LINKS,
      [],
      [],
      [
        {
          kind: 'release',
          name: 'Neon Circuit',
          url: 'https://jov.ie/testartist/neon-circuit',
        },
        {
          kind: 'artist',
          name: 'Guest Vocalist',
          url: 'https://jov.ie/guestvocalist',
        },
      ]
    );

    const artist = findInGraph(data, 'MusicGroup');
    expect(artist?.mentions).toEqual([
      {
        '@type': 'MusicRecording',
        name: 'Neon Circuit',
        url: 'https://jov.ie/testartist/neon-circuit',
      },
      {
        '@type': 'MusicGroup',
        name: 'Guest Vocalist',
        url: 'https://jov.ie/guestvocalist',
      },
    ]);
    expect(validateProfileRichResults(data)).toEqual([]);
  });

  it('caps mentions at 25 and omits the key when empty', () => {
    const manyMentions = Array.from({ length: 40 }, (_, i) => ({
      kind: 'release' as const,
      name: `Release ${i}`,
      url: `https://jov.ie/testartist/release-${i}`,
    }));

    const capped = generateProfileStructuredData(
      BASE_PROFILE,
      ['pop'],
      MOCK_LINKS,
      [],
      [],
      manyMentions
    );
    const cappedArtist = findInGraph(capped, 'MusicGroup');
    expect(cappedArtist?.mentions).toHaveLength(25);

    const without = generateProfileStructuredData(
      BASE_PROFILE,
      ['pop'],
      MOCK_LINKS
    );
    expect(findInGraph(without, 'MusicGroup')?.mentions).toBeUndefined();
  });
});

describe('generateMusicStructuredData', () => {
  const creator = {
    displayName: 'Test Artist',
    username: 'testartist',
    usernameNormalized: 'testartist',
    creatorType: 'artist' as const,
  };

  it('matches golden snapshot for release pages', () => {
    const data = generateMusicStructuredData(
      {
        type: 'release',
        title: 'Midnight Drive',
        slug: 'midnight-drive',
        artworkUrl: 'https://example.com/art.jpg',
        releaseDate: new Date('2024-03-01'),
        providerLinks: [
          { providerId: 'spotify', url: 'https://open.spotify.com/album/1' },
        ],
        releaseType: 'album',
        totalTracks: 10,
        primaryArtists: [{ name: 'Test Artist', handle: 'testartist' }],
      },
      creator,
      [
        {
          title: 'Track One',
          slug: 'track-one',
          trackNumber: 1,
          durationMs: 210000,
        },
      ]
    );

    expect(data).toMatchSnapshot();
    expect(validateMusicRichResults(data)).toEqual([]);
  });

  it('matches golden snapshot for track pages', () => {
    const data = generateMusicStructuredData(
      {
        type: 'track',
        title: 'Track One',
        slug: 'midnight-drive/track-one',
        artworkUrl: 'https://example.com/art.jpg',
        releaseDate: new Date('2024-03-01'),
        providerLinks: [
          { providerId: 'spotify', url: 'https://open.spotify.com/track/1' },
        ],
        durationMs: 210000,
        isrc: 'USRC17607839',
        trackNumber: 1,
        primaryArtists: [{ name: 'Test Artist', handle: 'testartist' }],
        inAlbum: {
          title: 'Midnight Drive',
          url: 'https://jov.ie/testartist/midnight-drive',
          id: 'https://jov.ie/testartist/midnight-drive#release',
        },
      },
      creator
    );

    expect(data).toMatchSnapshot();
    expect(validateMusicRichResults(data)).toEqual([]);
  });

  describe('byArtist credit projection (JOV-6542)', () => {
    const ownerCreator = {
      displayName: 'hello',
      username: 'hello',
      usernameNormalized: 'hello',
      creatorType: 'artist' as const,
      artistSameAs: ['https://open.spotify.com/artist/2o5jDhtHVPhrJdv3cEQ99Z'],
    };

    it('names the accepted credited artist, not the profile owner', () => {
      const data = generateMusicStructuredData(
        {
          type: 'release',
          title: 'A Town Called Paradise (Deluxe)',
          slug: 'a-town-called-paradise-deluxe',
          artworkUrl: null,
          releaseDate: null,
          providerLinks: [],
          primaryArtists: [{ name: 'Tiësto', handle: null }],
        },
        ownerCreator
      );

      const musicSchema = data['@graph'][0] as Record<string, unknown>;
      // Incident shape: owner "hello" vs accepted credited artist "Tiësto".
      expect(musicSchema.byArtist).toEqual({
        '@type': ['MusicGroup', 'Person'],
        name: 'Tiësto',
      });
      expect(validateMusicRichResults(data)).toEqual([]);
    });

    it('emits one entity per accepted co-primary artist', () => {
      const data = generateMusicStructuredData(
        {
          type: 'release',
          title: 'Revival',
          slug: 'revival',
          artworkUrl: null,
          releaseDate: null,
          providerLinks: [],
          primaryArtists: [
            { name: 'Tom Fall', handle: null },
            { name: 'Tim White', handle: 'tim' },
          ],
        },
        ownerCreator
      );

      const musicSchema = data['@graph'][0] as Record<string, unknown>;
      const byArtist = musicSchema.byArtist as Record<string, unknown>[];
      expect(byArtist).toHaveLength(2);
      expect(byArtist[0]).toEqual({
        '@type': ['MusicGroup', 'Person'],
        name: 'Tom Fall',
      });
      expect(byArtist[1]).toEqual({
        '@type': ['MusicGroup', 'Person'],
        '@id': 'https://jov.ie/tim#musicgroup',
        name: 'Tim White',
        url: 'https://jov.ie/tim',
      });
      // A co-primary with no supported destination never inherits the owner's
      // identity links or mints a fictional combined-name entity.
      expect(byArtist[0]).not.toHaveProperty('url');
      expect(byArtist[1]).not.toHaveProperty('sameAs');
      expect(validateMusicRichResults(data)).toEqual([]);
    });

    it('keeps the genuine owner-equals-artist case with entity sameAs', () => {
      const data = generateMusicStructuredData(
        {
          type: 'release',
          title: 'Wheels Up',
          slug: 'wheels-up',
          artworkUrl: null,
          releaseDate: null,
          providerLinks: [],
          primaryArtists: [{ name: 'hello', handle: 'hello' }],
        },
        ownerCreator
      );

      const musicSchema = data['@graph'][0] as Record<string, unknown>;
      expect(musicSchema.byArtist).toEqual({
        '@type': ['MusicGroup', 'Person'],
        '@id': 'https://jov.ie/hello#musicgroup',
        name: 'hello',
        url: 'https://jov.ie/hello',
        sameAs: ['https://open.spotify.com/artist/2o5jDhtHVPhrJdv3cEQ99Z'],
      });
      expect(validateMusicRichResults(data)).toEqual([]);
    });

    it('omits byArtist when no accepted primary credit evidence exists', () => {
      const withNoCredits = generateMusicStructuredData(
        {
          type: 'release',
          title: 'Untitled EP',
          slug: 'untitled-ep',
          artworkUrl: null,
          releaseDate: null,
          providerLinks: [],
        },
        ownerCreator
      );
      const noCreditsSchema = withNoCredits['@graph'][0] as Record<
        string,
        unknown
      >;
      // Missing evidence is not verified authorship: the claim is omitted,
      // never fabricated as the profile owner (JOV-6542 invariant 5).
      expect(noCreditsSchema.byArtist).toBeUndefined();

      // Whitespace-only/empty credit names are absent evidence, not artists.
      const withBlankCredits = generateMusicStructuredData(
        {
          type: 'release',
          title: 'Untitled EP',
          slug: 'untitled-ep',
          artworkUrl: null,
          releaseDate: null,
          providerLinks: [],
          primaryArtists: [{ name: '   ', handle: null }],
        },
        ownerCreator
      );
      const blankSchema = withBlankCredits['@graph'][0] as Record<
        string,
        unknown
      >;
      expect(blankSchema.byArtist).toBeUndefined();

      // featured/producer credits are not primary artists and must not leak
      // into byArtist: a non-primary credit group alone stays omitted —
      // the owner is never substituted to fill the gap.
      const withFeaturedOnly = generateMusicStructuredData(
        {
          type: 'release',
          title: 'Untitled EP',
          slug: 'untitled-ep',
          artworkUrl: null,
          releaseDate: null,
          providerLinks: [],
          credits: [
            {
              role: 'featured_artist',
              label: 'Featured artist',
              entries: [
                {
                  artistId: 'artist-dj-nova',
                  name: 'DJ Nova',
                  handle: null,
                  role: 'featured_artist',
                  position: 0,
                },
              ],
            },
          ],
        },
        ownerCreator
      );
      const featuredSchema = withFeaturedOnly['@graph'][0] as Record<
        string,
        unknown
      >;
      expect(featuredSchema.byArtist).toBeUndefined();
      expect(featuredSchema).toHaveProperty('contributor');
    });

    it('never links an opaque machine handle from a credited artist', () => {
      const data = generateMusicStructuredData(
        {
          type: 'release',
          title: 'Never Say a Word',
          slug: 'never-say-a-word',
          artworkUrl: null,
          releaseDate: null,
          providerLinks: [],
          primaryArtists: [{ name: 'Tim White', handle: 'tmoc9mm7xfvx02c' }],
        },
        ownerCreator
      );

      const musicSchema = data['@graph'][0] as Record<string, unknown>;
      // A non-owner credit carrying a machine handle stays a name-only
      // entity — no junk /tmoc... destination is minted (JOV-6201).
      expect(musicSchema.byArtist).toEqual({
        '@type': ['MusicGroup', 'Person'],
        name: 'Tim White',
      });
    });

    it('canonicalizes an owner-credit opaque handle to the owner profile', () => {
      const data = generateMusicStructuredData(
        {
          type: 'release',
          title: 'Never Say a Word',
          slug: 'never-say-a-word',
          artworkUrl: null,
          releaseDate: null,
          providerLinks: [],
          primaryArtists: [{ name: 'hello', handle: 'tmoc9mm7xfvx02c' }],
        },
        ownerCreator
      );

      const musicSchema = data['@graph'][0] as Record<string, unknown>;
      // Owner-equals-artist: the opaque handle canonicalizes to the owner's
      // handle and carries the owner's entity identity links.
      expect(musicSchema.byArtist).toEqual({
        '@type': ['MusicGroup', 'Person'],
        '@id': 'https://jov.ie/hello#musicgroup',
        name: 'hello',
        url: 'https://jov.ie/hello',
        sameAs: ['https://open.spotify.com/artist/2o5jDhtHVPhrJdv3cEQ99Z'],
      });
    });

    it('wraps one credited artist into the track-list recording ref', () => {
      const data = generateMusicStructuredData(
        {
          type: 'release',
          title: 'Wheels Up',
          slug: 'wheels-up',
          artworkUrl: null,
          releaseDate: null,
          providerLinks: [],
          primaryArtists: [{ name: 'LYNX', handle: 'lynx' }],
        },
        ownerCreator,
        [
          {
            title: 'Wheels Up',
            slug: 'wheels-up',
            trackNumber: 1,
            durationMs: 210000,
          },
        ]
      );

      const musicSchema = data['@graph'][0] as Record<string, unknown>;
      const track = musicSchema.track as Record<string, unknown>;
      const firstItem = (track.itemListElement as Record<string, unknown>[])[0]
        .item as Record<string, unknown>;

      expect(firstItem.byArtist).toEqual({
        '@id': 'https://jov.ie/lynx#musicgroup',
      });
    });

    it('points track-list recording refs at the credited artist, not the owner', () => {
      const data = generateMusicStructuredData(
        {
          type: 'release',
          title: 'Wheels Up',
          slug: 'wheels-up',
          artworkUrl: null,
          releaseDate: null,
          providerLinks: [],
          primaryArtists: [
            { name: 'Tim White', handle: null },
            { name: 'LYNX', handle: 'lynx' },
          ],
        },
        ownerCreator,
        [
          {
            title: 'Wheels Up',
            slug: 'wheels-up',
            trackNumber: 1,
            durationMs: 210000,
          },
        ]
      );

      const musicSchema = data['@graph'][0] as Record<string, unknown>;
      const track = musicSchema.track as Record<string, unknown>;
      const firstItem = (track.itemListElement as Record<string, unknown>[])[0]
        .item as Record<string, unknown>;
      // The ref targets the first credited artist WITH a supported
      // destination — never silently back to the owner's #musicgroup anchor.
      expect(firstItem.byArtist).toEqual({
        '@id': 'https://jov.ie/lynx#musicgroup',
      });
    });

    it('omits track-list recording refs when no credited artist has a destination', () => {
      const data = generateMusicStructuredData(
        {
          type: 'release',
          title: 'A Town Called Paradise (Deluxe)',
          slug: 'a-town-called-paradise-deluxe',
          artworkUrl: null,
          releaseDate: null,
          providerLinks: [],
          primaryArtists: [{ name: 'Tiësto', handle: null }],
        },
        ownerCreator,
        [
          {
            title: 'Red Lights',
            slug: 'red-lights',
            trackNumber: 1,
            durationMs: 210000,
          },
        ]
      );

      const musicSchema = data['@graph'][0] as Record<string, unknown>;
      const track = musicSchema.track as Record<string, unknown>;
      const firstItem = (track.itemListElement as Record<string, unknown>[])[0]
        .item as Record<string, unknown>;
      // No supported destination exists for the credited artist: the
      // unsupported identity claim is omitted, not substituted with the owner.
      expect(firstItem.byArtist).toBeUndefined();
    });
  });
});

describe('generateMerchStructuredData', () => {
  it('matches golden snapshot for product + offer', () => {
    const data = generateMerchStructuredData({
      title: 'Tour Tee',
      description: 'Soft cotton tee from the 2026 tour.',
      imageUrl: 'https://example.com/tee.jpg',
      artistName: 'Test Artist',
      handle: 'testartist',
      cardId: 'card-1',
      retailPriceCents: 3200,
    });

    expect(data).toMatchSnapshot();
    expect(validateMerchRichResults(data)).toEqual([]);
  });

  it('includes AggregateRating only when review data is supplied', () => {
    const withoutRating = generateMerchStructuredData({
      title: 'Tour Tee',
      description: 'Soft cotton tee.',
      imageUrl: null,
      artistName: 'Test Artist',
      handle: 'testartist',
      cardId: 'card-1',
      retailPriceCents: 3200,
    });
    expect(withoutRating.aggregateRating).toBeUndefined();
    expect(withoutRating.image).toBeUndefined();

    const withRating = generateMerchStructuredData({
      title: 'Tour Tee',
      description: 'Soft cotton tee.',
      imageUrl: null,
      artistName: 'Test Artist',
      handle: 'testartist',
      cardId: 'card-1',
      retailPriceCents: 3200,
      aggregateRating: { ratingValue: 4.8, reviewCount: 12 },
    });
    expect(withRating.aggregateRating).toMatchObject({
      '@type': 'AggregateRating',
      ratingValue: 4.8,
      reviewCount: 12,
    });
    expect(validateMerchRichResults(withRating)).toEqual([]);
  });
});
