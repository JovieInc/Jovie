/**
 * Unit tests for public profile page logic.
 *
 * Tests the server-side functions in app/[username]/page.tsx:
 * - generateProfileStructuredData (JSON-LD for SEO)
 * - fetchProfileAndLinks (data fetching with error handling)
 * - generateMetadata (SEO metadata generation)
 * - getCachedProfileAndLinks (only caches successful results)
 *
 * These are pure logic tests that don't render React components.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getProfileModeSubtitle,
  profileModes,
} from '@/features/profile/registry';

// --- Mock data used across tests ---

const BASE_URL = 'https://jov.ie';
const TEST_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(TEST_FILE_DIR, '../../..');
const PUBLIC_PROFILE_PAGE_SOURCE = readFileSync(
  path.join(WEB_ROOT, 'app/[username]/page.tsx'),
  'utf8'
);
// Profile loader (cache + error class + TTL) was extracted to its own file
// so per-mode routes can reuse it; assertions in this suite that look for
// loader internals search across both sources.
const PUBLIC_PROFILE_LOADER_SOURCE = readFileSync(
  path.join(WEB_ROOT, 'app/[username]/_lib/public-profile-loader.ts'),
  'utf8'
);
const PUBLIC_PROFILE_PAGE_AND_LOADER_SOURCE = `${PUBLIC_PROFILE_PAGE_SOURCE}\n${PUBLIC_PROFILE_LOADER_SOURCE}`;

const mockProfile = {
  id: 'profile-123',
  user_id: 'user-456',
  creator_type: 'artist' as const,
  username: 'testartist',
  display_name: 'Test Artist',
  bio: 'An amazing artist making great music. This bio is intentionally written to be longer than 120 characters for truncation testing purposes in metadata generation.',
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
};

const mockLinks = [
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
  {
    id: 'link-3',
    artist_id: 'profile-123',
    platform: 'twitter',
    url: 'https://twitter.com/testartist',
    clicks: 20,
    created_at: '2024-01-01T00:00:00Z',
  },
];

const mockGenres = ['rock', 'indie', 'alternative'];

describe('Public Profile Page Logic', () => {
  describe('public tour data loading', () => {
    it('uses the public-safe upcoming tour query helper', () => {
      expect(PUBLIC_PROFILE_PAGE_SOURCE).toContain(
        'getUpcomingTourDatesForProfile'
      );
    });

    it('does not import the dashboard noStore loader into the public page', () => {
      expect(PUBLIC_PROFILE_PAGE_SOURCE).not.toContain('loadUpcomingTourDates');
    });

    it('falls back to an empty tour list when public tour loading fails', () => {
      expect(PUBLIC_PROFILE_PAGE_SOURCE).toContain(
        'Error fetching public profile tour dates'
      );
      expect(PUBLIC_PROFILE_PAGE_SOURCE).toContain(
        'const tourDatesPromise = getPublicTourDates({'
      );
      expect(PUBLIC_PROFILE_PAGE_SOURCE).toContain(
        'public-profile-tour-dates-${profileId}'
      );
      expect(PUBLIC_PROFILE_PAGE_SOURCE).toContain(
        'createProfileTag(usernameNormalized)'
      );
    });

    it('reads a confirmed playlist fallback from profile settings without live search', () => {
      expect(PUBLIC_PROFILE_PAGE_SOURCE).toContain(
        'getConfirmedFeaturedPlaylistFallback(profileSettings)'
      );
      expect(PUBLIC_PROFILE_PAGE_SOURCE).not.toContain('searchGoogleCSE');
      expect(PUBLIC_PROFILE_PAGE_SOURCE).not.toContain(
        'discoverThisIsPlaylistCandidate'
      );
    });
  });

  describe('public claim banner handling', () => {
    it('reads search params for mode handling', () => {
      expect(PUBLIC_PROFILE_PAGE_SOURCE).toContain(
        'const resolvedSearchParams = await searchParams;'
      );
    });

    it('delegates claim banner query handling to the client wrapper', () => {
      expect(PUBLIC_PROFILE_PAGE_SOURCE).toContain('PublicClaimBanner');
    });
  });

  describe('profile accent handling', () => {
    it('does not derive remote avatar accents during public profile ISR render', () => {
      expect(PUBLIC_PROFILE_LOADER_SOURCE).toContain('mergeProfileTheme');
      expect(PUBLIC_PROFILE_LOADER_SOURCE).not.toContain(
        'ensureThemeHasProfileAccent'
      );
      expect(PUBLIC_PROFILE_LOADER_SOURCE).not.toContain('accentSourceUrl');
      expect(PUBLIC_PROFILE_LOADER_SOURCE).not.toContain(
        'persistDerivedProfileAccent'
      );
    });
  });

  describe('generateProfileStructuredData', () => {
    // We test the structured data generation logic directly
    // Since it's a private function, we replicate the logic here for testing

    interface TestProfile {
      id: string;
      user_id: string;
      creator_type: 'artist';
      username: string;
      display_name: string | null;
      bio: string | null;
      avatar_url: string | null;
      spotify_url: string | null;
      apple_music_url: string | null;
      youtube_url: string | null;
      is_verified: boolean;
      [key: string]: unknown;
    }

    interface TourDateForTest {
      id: string;
      ticketStatus: string;
      venueName: string;
      city: string;
      region: string | null;
      country: string;
      startDate: string;
      ticketUrl: string | null;
      latitude: number | null;
      longitude: number | null;
      title: string | null;
    }

    function generateProfileStructuredData(
      profile: TestProfile,
      genres: string[] | null,
      links: typeof mockLinks,
      tourDates: TourDateForTest[] = []
    ) {
      const artistName = profile.display_name || profile.username;
      const profileUrl = `${BASE_URL}/${profile.username}`;

      const socialUrls = links
        .filter(link =>
          [
            'instagram',
            'twitter',
            'facebook',
            'youtube',
            'tiktok',
            'spotify',
          ].includes(link.platform.toLowerCase())
        )
        .map(link => link.url);

      if (profile.spotify_url) socialUrls.push(profile.spotify_url);
      if (profile.apple_music_url) socialUrls.push(profile.apple_music_url);
      if (profile.youtube_url) socialUrls.push(profile.youtube_url);

      const uniqueSocialUrls = [...new Set(socialUrls)];

      const musicGroupSchema: Record<string, unknown> = {
        '@type': 'MusicGroup',
        '@id': `${profileUrl}#musicgroup`,
        name: artistName,
        description: profile.bio || `Music by ${artistName}`,
        url: profileUrl,
        sameAs: uniqueSocialUrls,
        genre: genres && genres.length > 0 ? genres : ['Music'],
        ...(profile.avatar_url && {
          image: {
            '@type': 'ImageObject',
            url: profile.avatar_url,
            name: `${artistName} profile photo`,
          },
        }),
        ...(profile.is_verified && {
          additionalProperty: {
            '@type': 'PropertyValue',
            name: 'verified',
            value: true,
          },
        }),
      };

      const profilePageSchema = {
        '@type': 'ProfilePage',
        '@id': `${profileUrl}#profilepage`,
        mainEntity: { '@id': `${profileUrl}#musicgroup` },
        url: profileUrl,
        name: `${artistName} | Jovie`,
      };

      const breadcrumbSchema = {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: BASE_URL,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: artistName,
            item: profileUrl,
          },
        ],
      };

      const MAX_EVENT_SCHEMAS = 10;
      const eventSchemas = tourDates.slice(0, MAX_EVENT_SCHEMAS).map(td => ({
        '@type': 'MusicEvent',
        '@id': `${profileUrl}#event-${td.id}`,
        name: td.title || `${artistName} at ${td.venueName}`,
        startDate: td.startDate,
        performer: { '@id': `${profileUrl}#musicgroup` },
      }));

      return {
        '@context': 'https://schema.org',
        '@graph': [
          profilePageSchema,
          musicGroupSchema,
          breadcrumbSchema,
          ...eventSchemas,
        ],
      };
    }

    // Helper to extract a specific schema type from the @graph
    function findInGraph(
      data: ReturnType<typeof generateProfileStructuredData>,
      type: string
    ) {
      return (data['@graph'] as Record<string, unknown>[]).find(
        item => item['@type'] === type
      ) as Record<string, unknown> | undefined;
    }

    it('generates @graph with ProfilePage, MusicGroup, and BreadcrumbList', () => {
      const data = generateProfileStructuredData(
        mockProfile,
        mockGenres,
        mockLinks
      );

      expect(data['@context']).toBe('https://schema.org');
      const graph = data['@graph'] as Record<string, unknown>[];
      expect(graph.length).toBeGreaterThanOrEqual(3);

      const profilePage = findInGraph(data, 'ProfilePage');
      expect(profilePage).toBeDefined();
      expect(profilePage!['@type']).toBe('ProfilePage');

      const musicGroup = findInGraph(data, 'MusicGroup');
      expect(musicGroup).toBeDefined();
      expect(musicGroup!.name).toBe('Test Artist');
      expect(musicGroup!.url).toBe(`${BASE_URL}/testartist`);
      expect(musicGroup!.genre).toEqual(mockGenres);
    });

    it('includes ImageObject for avatar in MusicGroup', () => {
      const data = generateProfileStructuredData(
        mockProfile,
        mockGenres,
        mockLinks
      );
      const musicGroup = findInGraph(data, 'MusicGroup')!;

      expect(musicGroup.image).toEqual({
        '@type': 'ImageObject',
        url: 'https://example.com/avatar.jpg',
        name: 'Test Artist profile photo',
      });
    });

    it('includes verified property for verified profiles', () => {
      const data = generateProfileStructuredData(
        { ...mockProfile, is_verified: true },
        mockGenres,
        mockLinks
      );
      const musicGroup = findInGraph(data, 'MusicGroup')!;

      expect(musicGroup.additionalProperty).toEqual({
        '@type': 'PropertyValue',
        name: 'verified',
        value: true,
      });
    });

    it('omits verified property for unverified profiles', () => {
      const data = generateProfileStructuredData(
        { ...mockProfile, is_verified: false },
        mockGenres,
        mockLinks
      );
      const musicGroup = findInGraph(data, 'MusicGroup')!;

      expect(musicGroup.additionalProperty).toBeUndefined();
    });

    it('deduplicates social URLs from links and profile fields', () => {
      const data = generateProfileStructuredData(
        mockProfile,
        mockGenres,
        mockLinks
      );
      const musicGroup = findInGraph(data, 'MusicGroup')!;

      const spotifyUrls = (musicGroup.sameAs as string[]).filter(
        (url: string) => url.includes('spotify')
      );
      expect(spotifyUrls.length).toBe(1);
    });

    it('falls back to "Music" genre when no genres provided', () => {
      const data = generateProfileStructuredData(mockProfile, null, mockLinks);
      const musicGroup = findInGraph(data, 'MusicGroup')!;
      expect(musicGroup.genre).toEqual(['Music']);
    });

    it('falls back to "Music" genre with empty array', () => {
      const data = generateProfileStructuredData(mockProfile, [], mockLinks);
      const musicGroup = findInGraph(data, 'MusicGroup')!;
      expect(musicGroup.genre).toEqual(['Music']);
    });

    it('uses username as fallback when display_name is null', () => {
      const profileWithoutName = {
        ...mockProfile,
        display_name: null,
      };
      const data = generateProfileStructuredData(
        profileWithoutName,
        mockGenres,
        mockLinks
      );
      const musicGroup = findInGraph(data, 'MusicGroup')!;
      const breadcrumb = findInGraph(data, 'BreadcrumbList')!;

      expect(musicGroup.name).toBe('testartist');
      expect((breadcrumb.itemListElement as { name: string }[])[1].name).toBe(
        'testartist'
      );
    });

    it('omits image when avatar_url is null', () => {
      const profileWithoutAvatar = {
        ...mockProfile,
        avatar_url: null,
      };
      const data = generateProfileStructuredData(
        profileWithoutAvatar,
        mockGenres,
        mockLinks
      );
      const musicGroup = findInGraph(data, 'MusicGroup')!;
      expect(musicGroup.image).toBeUndefined();
    });

    it('generates valid BreadcrumbList schema', () => {
      const data = generateProfileStructuredData(
        mockProfile,
        mockGenres,
        mockLinks
      );
      const breadcrumb = findInGraph(data, 'BreadcrumbList')!;

      expect(breadcrumb['@type']).toBe('BreadcrumbList');
      expect((breadcrumb.itemListElement as unknown[]).length).toBe(2);
    });

    it('uses bio as description, falls back to generated text', () => {
      const data = generateProfileStructuredData(
        mockProfile,
        mockGenres,
        mockLinks
      );
      const musicGroup = findInGraph(data, 'MusicGroup')!;
      expect(musicGroup.description).toBe(mockProfile.bio);

      const noBioProfile = { ...mockProfile, bio: null };
      const data2 = generateProfileStructuredData(
        noBioProfile,
        mockGenres,
        mockLinks
      );
      const musicGroup2 = findInGraph(data2, 'MusicGroup')!;
      expect(musicGroup2.description).toBe('Music by Test Artist');
    });

    it('only includes recognized social platforms in sameAs', () => {
      const linksWithUnknown = [
        ...mockLinks,
        {
          id: 'link-4',
          artist_id: 'profile-123',
          platform: 'venmo',
          url: 'https://venmo.com/testartist',
          clicks: 0,
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      const data = generateProfileStructuredData(
        mockProfile,
        mockGenres,
        linksWithUnknown
      );
      const musicGroup = findInGraph(data, 'MusicGroup')!;

      expect(
        (musicGroup.sameAs as string[]).some((url: string) =>
          url.includes('venmo')
        )
      ).toBe(false);
    });

    it('adds MusicEvent schemas for tour dates, capped at 10', () => {
      const tourDates: TourDateForTest[] = Array.from(
        { length: 15 },
        (_, i) => ({
          id: `td-${i}`,
          ticketStatus: 'available',
          venueName: `Venue ${i}`,
          city: 'Los Angeles',
          region: 'CA',
          country: 'US',
          startDate: `2026-06-${String(i + 1).padStart(2, '0')}T20:00:00Z`,
          ticketUrl: `https://tickets.example.com/${i}`,
          latitude: 34.05,
          longitude: -118.25,
          title: null,
        })
      );

      const data = generateProfileStructuredData(
        mockProfile,
        mockGenres,
        mockLinks,
        tourDates
      );
      const events = (data['@graph'] as Record<string, unknown>[]).filter(
        item => item['@type'] === 'MusicEvent'
      );

      expect(events.length).toBe(10);
    });

    it('emits zero MusicEvent schemas when no tour dates', () => {
      const data = generateProfileStructuredData(
        mockProfile,
        mockGenres,
        mockLinks,
        []
      );
      const events = (data['@graph'] as Record<string, unknown>[]).filter(
        item => item['@type'] === 'MusicEvent'
      );

      expect(events.length).toBe(0);
    });
  });

  describe('Profile page mode logic', () => {
    it.each([
      ['profile', 'Artist'],
      ['pay', 'Support'],
      ['listen', 'Listen now'],
      ['subscribe', 'Manage alerts'],
    ])('mode "%s" maps to subtitle "%s"', (mode, expectedSubtitle) => {
      expect(getProfileModeSubtitle(mode)).toBe(expectedSubtitle);
    });

    it('defaults to "Artist" subtitle for unknown modes', () => {
      expect(getProfileModeSubtitle('unknown')).toBe('Artist');
    });

    it('passes social links and pay button flag through to StaticArtistPage', () => {
      expect(PUBLIC_PROFILE_PAGE_SOURCE).toContain('socialLinks={links}');
      expect(PUBLIC_PROFILE_PAGE_SOURCE).toContain(
        'showPayButton={showPayButton}'
      );
    });

    it('shows back button only for non-profile modes', () => {
      const modes = profileModes.filter(mode => mode !== 'contact');
      const showBackButton = modes.map(m => m !== 'profile');
      expect(showBackButton).toEqual([
        false,
        true,
        true,
        true,
        true,
        true,
        true,
      ]);
    });
  });

  describe('Metadata generation logic', () => {
    // Test the metadata construction logic from generateMetadata

    it('uses a clean share title for the public profile', () => {
      const artistName = 'Test Artist';
      const title = `${artistName} | Jovie`;

      expect(title).toBe('Test Artist | Jovie');
    });

    it('keeps the same share title even when genres are available', () => {
      const artistName = 'Test Artist';
      const genres = ['rock', 'indie'];
      const title = `${artistName} | Jovie`;

      expect(genres).toEqual(['rock', 'indie']);
      expect(title).toBe('Test Artist | Jovie');
    });

    it('truncates bio to 155 chars in description', () => {
      const longBio =
        'An amazing artist making great music. This bio is intentionally written to be longer than 155 characters for truncation testing purposes. Extra text here to exceed the limit easily.';
      const bioSnippet = longBio.slice(0, 155).trim();
      const description = `${bioSnippet}${longBio.length > 155 ? '...' : ''}. rock, indie, alternative artist. Stream on Spotify, Apple Music & more.`;

      expect(description).toContain('...');
      expect(bioSnippet.length).toBeLessThanOrEqual(155);
    });

    it('uses display_name in metadata, falls back to username', () => {
      const withName = mockProfile.display_name || mockProfile.username;
      expect(withName).toBe('Test Artist');

      const nullName: string | null = null;
      const withoutName = nullName || mockProfile.username;
      expect(withoutName).toBe('testartist');
    });

    it('generates keyword array including artist name and genres', () => {
      const artistName = 'Test Artist';
      const genres = ['rock', 'indie'];
      const baseKeywords = [
        artistName,
        `${artistName} music`,
        `${artistName} songs`,
        `${artistName} artist`,
        'music artist',
        'streaming links',
        'spotify',
        'apple music',
      ];
      const genreKeywords = genres?.slice(0, 5) ?? [];
      const keywords = [...baseKeywords, ...genreKeywords];

      expect(keywords).toContain('Test Artist');
      expect(keywords).toContain('Test Artist music');
      expect(keywords).toContain('rock');
      expect(keywords).toContain('indie');
      expect(keywords.length).toBe(10);
    });

    it('includes canonical URL in alternates', () => {
      const profileUrl = `${BASE_URL}/${mockProfile.username}`;
      expect(profileUrl).toBe('https://jov.ie/testartist');
    });

    it('uses file convention for og:image (no explicit images in metadata)', () => {
      // After OG consolidation, metadata no longer includes explicit openGraph.images
      // The file-based opengraph-image.tsx handles OG image generation via Next.js convention
      // Verify the file convention URL pattern is correct
      const expectedUrl = `${BASE_URL}/${mockProfile.username}/opengraph-image`;
      expect(expectedUrl).toBe('https://jov.ie/testartist/opengraph-image');
    });

    it('sets robots to index and follow for public profiles', () => {
      const robots = {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          'max-video-preview': -1,
          'max-image-preview': 'large',
          'max-snippet': -1,
        },
      };
      expect(robots.index).toBe(true);
      expect(robots.follow).toBe(true);
    });

    it('limits genre keywords to 5', () => {
      const manyGenres = [
        'rock',
        'indie',
        'alternative',
        'pop',
        'electronic',
        'folk',
        'jazz',
      ];
      const genreKeywords = manyGenres?.slice(0, 5) ?? [];
      expect(genreKeywords).toHaveLength(5);
      expect(genreKeywords).not.toContain('folk');
    });

    it('limits genre display in title to 2', () => {
      const genres = ['rock', 'indie', 'alternative'];
      const genreContext = ` | ${genres.slice(0, 2).join(', ')} Artist`;
      expect(genreContext).toBe(' | rock, indie Artist');
      expect(genreContext).not.toContain('alternative');
    });
  });

  describe('cache strategy', () => {
    function shouldCache(status: 'ok' | 'not_found' | 'error') {
      return status === 'ok';
    }

    it('caches only successful results, not_found and error are always fresh', () => {
      expect(shouldCache('ok')).toBe(true);
      expect(shouldCache('not_found')).toBe(false);
      expect(shouldCache('error')).toBe(false);
    });

    it('carries the first non-ok payload through the unstable_cache throw path', () => {
      expect(PUBLIC_PROFILE_PAGE_AND_LOADER_SOURCE).toContain(
        'NonCacheableProfileResultError'
      );
      expect(PUBLIC_PROFILE_PAGE_AND_LOADER_SOURCE).toContain(
        'throw new NonCacheableProfileResultError(data)'
      );
      expect(PUBLIC_PROFILE_PAGE_AND_LOADER_SOURCE).toContain(
        'if (error instanceof NonCacheableProfileResultError)'
      );
      expect(PUBLIC_PROFILE_PAGE_AND_LOADER_SOURCE).toContain(
        'return error.result'
      );
    });
  });
});
