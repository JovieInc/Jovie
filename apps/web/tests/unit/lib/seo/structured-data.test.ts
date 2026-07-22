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
