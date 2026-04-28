import type { ProviderKey } from '@/lib/discography/types';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

export interface DemoPersonaTrack {
  readonly title: string;
  readonly slug: string;
  readonly trackNumber: number;
  readonly discNumber: number;
  readonly durationMs: number;
  readonly isrc: string;
  readonly isExplicit?: boolean;
}

export interface DemoPersonaRelease {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly releaseType:
    | 'single'
    | 'ep'
    | 'album'
    | 'compilation'
    | 'music_video';
  readonly releaseDate: string;
  readonly artworkUrl: string;
  readonly totalTracks: number;
  readonly totalDurationMs: number;
  readonly upc?: string;
  readonly label?: string | null;
  readonly spotifyPopularity: number;
  readonly artistNames: readonly string[];
  readonly genres: readonly string[];
  readonly primaryIsrc: string;
  readonly providerUrls: Readonly<Partial<Record<ProviderKey, string>>>;
  readonly tracks?: readonly DemoPersonaTrack[];
  /** JSONB metadata for the release (e.g., MusicVideoMetadata for music_video type) */
  readonly metadata?: Record<string, unknown>;
}

export interface DemoPersonaTourDate {
  readonly externalId: string;
  readonly title: string | null;
  readonly venueName: string;
  readonly city: string;
  readonly region: string | null;
  readonly country: string;
  readonly provider: 'bandsintown' | 'songkick' | 'manual';
  readonly ticketStatus: 'available' | 'sold_out' | 'cancelled';
  readonly ticketUrl: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly timezone: string | null;
  readonly startDate: string;
  readonly startTime: string | null;
}

export interface DemoPersonaSocialLink {
  readonly platform:
    | 'spotify'
    | 'apple_music'
    | 'instagram'
    | 'tiktok'
    | 'youtube'
    | 'twitter'
    | 'website'
    | 'venmo';
  readonly platformType:
    | 'music_streaming'
    | 'social'
    | 'video'
    | 'website'
    | 'payment';
  readonly url: string;
  readonly displayText: string;
  readonly sortOrder: number;
}

export interface DemoPersonaProfile {
  readonly handle: string;
  readonly displayName: string;
  readonly avatarSrc: string;
  readonly bio: string;
  readonly creatorType: 'artist';
  readonly location: string;
  readonly genres: readonly string[];
  readonly spotifyArtistId: string | null;
  readonly spotifyUrl: string | null;
  readonly appleMusicUrl: string | null;
  readonly appleMusicArtistId: string | null;
  readonly youtubeUrl: string | null;
  readonly youtubeMusicArtistId: string | null;
  readonly deezerArtistId: string | null;
  readonly tidalArtistId: string | null;
  readonly soundcloudArtistId: string | null;
  readonly bandsintownArtistName: string | null;
  readonly venmoHandle: string | null;
  readonly activeSinceYear: number | null;
  readonly spotifyFollowers: number | null;
  readonly spotifyPopularity: number | null;
  readonly isFeaturedByDefault: boolean;
  readonly isClaimedByDefault: boolean;
}

export interface DemoPersona {
  readonly id: 'founder' | 'internal-dj';
  readonly profile: DemoPersonaProfile;
  readonly socialLinks: readonly DemoPersonaSocialLink[];
  readonly releases: readonly DemoPersonaRelease[];
  readonly tourDates: readonly DemoPersonaTourDate[];
}

export const FOUNDER_DEMO_PERSONA: DemoPersona = {
  id: 'founder',
  profile: {
    handle: TIM_WHITE_PROFILE.handle,
    displayName: TIM_WHITE_PROFILE.name,
    avatarSrc: TIM_WHITE_PROFILE.avatarSrc,
    bio: 'Artist',
    creatorType: 'artist',
    location: 'San Francisco, CA',
    genres: ['Electronic', 'Dance'],
    spotifyArtistId: TIM_WHITE_PROFILE.spotifyArtistId,
    spotifyUrl: TIM_WHITE_PROFILE.spotifyUrl,
    appleMusicUrl: null,
    appleMusicArtistId: null,
    youtubeUrl: null,
    youtubeMusicArtistId: null,
    deezerArtistId: null,
    tidalArtistId: null,
    soundcloudArtistId: null,
    bandsintownArtistName: null,
    venmoHandle: null,
    activeSinceYear: 2021,
    spotifyFollowers: 12450,
    spotifyPopularity: 62,
    isFeaturedByDefault: true,
    isClaimedByDefault: true,
  },
  socialLinks: [],
  releases: [],
  tourDates: [],
};

export const INTERNAL_DJ_DEMO_PERSONA: DemoPersona = {
  id: 'internal-dj',
  profile: {
    handle: 'calvin-demo',
    displayName: 'Calvin Harris',
    avatarSrc: '/images/avatars/calvin-harris.jpg',
    bio: 'Festival-headlining DJ and producer with a catalog built for clubs, stadiums, and late-night drive time.',
    creatorType: 'artist',
    location: 'London, UK',
    genres: ['Dance', 'House', 'Electronic'],
    spotifyArtistId: '7CajNmpbOovFoOoasH2HaY',
    spotifyUrl:
      'https://open.spotify.com/intl-de/artist/7CajNmpbOovFoOoasH2HaY',
    appleMusicUrl: 'https://music.apple.com/us/search?term=Calvin%20Harris',
    appleMusicArtistId: null,
    youtubeUrl: 'https://www.youtube.com/@CalvinHarris',
    youtubeMusicArtistId: null,
    deezerArtistId: null,
    tidalArtistId: null,
    soundcloudArtistId: null,
    bandsintownArtistName: 'Calvin Harris',
    venmoHandle: 'calvin-demo',
    activeSinceYear: 2007,
    spotifyFollowers: 23099798,
    spotifyPopularity: 88,
    isFeaturedByDefault: false,
    isClaimedByDefault: true,
  },
  socialLinks: [
    {
      platform: 'spotify',
      platformType: 'music_streaming',
      url: 'https://open.spotify.com/intl-de/artist/7CajNmpbOovFoOoasH2HaY',
      displayText: 'Listen on Spotify',
      sortOrder: 1,
    },
    {
      platform: 'apple_music',
      platformType: 'music_streaming',
      url: 'https://music.apple.com/us/search?term=Calvin%20Harris',
      displayText: 'Listen on Apple Music',
      sortOrder: 2,
    },
    {
      platform: 'instagram',
      platformType: 'social',
      url: 'https://instagram.com/calvinharris',
      displayText: 'Instagram',
      sortOrder: 3,
    },
    {
      platform: 'tiktok',
      platformType: 'social',
      url: 'https://www.tiktok.com/@calvinharris',
      displayText: 'TikTok',
      sortOrder: 4,
    },
    {
      platform: 'youtube',
      platformType: 'video',
      url: 'https://www.youtube.com/@CalvinHarris',
      displayText: 'YouTube',
      sortOrder: 5,
    },
    {
      platform: 'twitter',
      platformType: 'social',
      url: 'https://x.com/calvinharris',
      displayText: 'X / Twitter',
      sortOrder: 6,
    },
    {
      platform: 'website',
      platformType: 'website',
      url: 'https://calvinharris.com',
      displayText: 'Official Website',
      sortOrder: 7,
    },
  ],
  releases: [
    {
      id: 'calvin-im-not-alone-remixes',
      title: "I'm Not Alone Remixes",
      slug: 'im-not-alone-remixes',
      releaseType: 'single',
      releaseDate: '2025-08-08',
      artworkUrl: '/images/demo/artwork-1.png',
      totalTracks: 1,
      totalDurationMs: 232000,
      upc: '194399301001',
      label: 'Columbia',
      spotifyPopularity: 84,
      artistNames: ['Calvin Harris'],
      genres: ['Dance', 'House'],
      primaryIsrc: 'GBARL2500808',
      providerUrls: {
        spotify:
          'https://open.spotify.com/search/I%27m%20Not%20Alone%20Remixes%20Calvin%20Harris',
        apple_music:
          'https://music.apple.com/us/search?term=I%27m%20Not%20Alone%20Remixes%20Calvin%20Harris',
        youtube_music:
          'https://music.youtube.com/search?q=I%27m+Not+Alone+Remixes+Calvin+Harris',
        amazon_music:
          'https://music.amazon.com/search/I%27m%20Not%20Alone%20Remixes%20Calvin%20Harris',
        tidal:
          'https://listen.tidal.com/search?q=I%27m%20Not%20Alone%20Remixes%20Calvin%20Harris',
      },
      tracks: [
        {
          title: "I'm Not Alone Remixes",
          slug: 'im-not-alone-remixes',
          trackNumber: 1,
          discNumber: 1,
          durationMs: 232000,
          isrc: 'GBARL2500808',
        },
      ],
    },
    {
      id: 'calvin-96-months',
      title: '96 Months',
      slug: '96-months',
      releaseType: 'album',
      releaseDate: '2025-09-05',
      artworkUrl: '/images/demo/artwork-2.png',
      totalTracks: 18,
      totalDurationMs: 4080000,
      upc: '194399301002',
      label: 'Columbia',
      spotifyPopularity: 91,
      artistNames: ['Calvin Harris'],
      genres: ['Dance', 'Electronic'],
      primaryIsrc: 'GBARL2500901',
      providerUrls: {
        spotify:
          'https://open.spotify.com/search/96%20Months%20Calvin%20Harris',
        apple_music:
          'https://music.apple.com/us/search?term=96%20Months%20Calvin%20Harris',
        youtube_music:
          'https://music.youtube.com/search?q=96+Months+Calvin+Harris',
        amazon_music:
          'https://music.amazon.com/search/96%20Months%20Calvin%20Harris',
        tidal:
          'https://listen.tidal.com/search?q=96%20Months%20Calvin%20Harris',
      },
      tracks: [
        {
          title: 'Free (with Ellie Goulding)',
          slug: 'free-with-ellie-goulding',
          trackNumber: 1,
          discNumber: 1,
          durationMs: 212000,
          isrc: 'GBARL2500901',
        },
        {
          title: 'How Deep Is Your Love',
          slug: 'how-deep-is-your-love',
          trackNumber: 2,
          discNumber: 1,
          durationMs: 212000,
          isrc: 'GBARL2500902',
        },
        {
          title: 'This Is What You Came For (with Rihanna)',
          slug: 'this-is-what-you-came-for',
          trackNumber: 3,
          discNumber: 1,
          durationMs: 222000,
          isrc: 'GBARL2500903',
        },
        {
          title: 'Miracle (with Ellie Goulding)',
          slug: 'miracle-with-ellie-goulding',
          trackNumber: 9,
          discNumber: 1,
          durationMs: 219000,
          isrc: 'GBARL2500909',
        },
        {
          title: 'Desire (with Sam Smith)',
          slug: 'desire-with-sam-smith',
          trackNumber: 11,
          discNumber: 1,
          durationMs: 180000,
          isrc: 'GBARL2500911',
        },
        {
          title: "Lovers In A Past Life (with Rag'n'Bone Man)",
          slug: 'lovers-in-a-past-life-with-ragnbone-man',
          trackNumber: 13,
          discNumber: 1,
          durationMs: 189000,
          isrc: 'GBARL2500913',
        },
      ],
    },
    {
      id: 'calvin-lovers',
      title: "Lovers In A Past Life (with Rag'n'Bone Man)",
      slug: 'lovers-in-a-past-life-with-ragnbone-man',
      releaseType: 'single',
      releaseDate: '2024-02-16',
      artworkUrl: '/images/demo/artwork-3.png',
      totalTracks: 1,
      totalDurationMs: 189000,
      upc: '194399301003',
      label: 'Columbia',
      spotifyPopularity: 78,
      artistNames: ['Calvin Harris', "Rag'n'Bone Man"],
      genres: ['Dance', 'Pop'],
      primaryIsrc: 'GBARL2400216',
      providerUrls: {
        spotify:
          'https://open.spotify.com/search/Lovers%20In%20A%20Past%20Life%20Calvin%20Harris%20Rag%27n%27Bone%20Man',
        apple_music:
          'https://music.apple.com/us/search?term=Lovers%20In%20A%20Past%20Life%20Calvin%20Harris%20Rag%27n%27Bone%20Man',
        youtube_music:
          'https://music.youtube.com/search?q=Lovers+In+A+Past+Life+Calvin+Harris+Rag%27n%27Bone+Man',
        amazon_music:
          'https://music.amazon.com/search/Lovers%20In%20A%20Past%20Life%20Calvin%20Harris%20Rag%27n%27Bone%20Man',
        tidal:
          'https://listen.tidal.com/search?q=Lovers%20In%20A%20Past%20Life%20Calvin%20Harris%20Rag%27n%27Bone%20Man',
      },
      tracks: [
        {
          title: "Lovers In A Past Life (with Rag'n'Bone Man)",
          slug: 'lovers-in-a-past-life-with-ragnbone-man',
          trackNumber: 1,
          discNumber: 1,
          durationMs: 189000,
          isrc: 'GBARL2400216',
        },
      ],
    },
    {
      id: 'calvin-desire',
      title: 'Desire with Sam Smith',
      slug: 'desire-with-sam-smith',
      releaseType: 'single',
      releaseDate: '2023-07-28',
      artworkUrl: '/images/demo/artwork-4.png',
      totalTracks: 1,
      totalDurationMs: 180000,
      upc: '194399301004',
      label: 'Columbia',
      spotifyPopularity: 82,
      artistNames: ['Calvin Harris', 'Sam Smith'],
      genres: ['Dance', 'Pop'],
      primaryIsrc: 'GBARL2300728',
      providerUrls: {
        spotify:
          'https://open.spotify.com/search/Desire%20Calvin%20Harris%20Sam%20Smith',
        apple_music:
          'https://music.apple.com/us/search?term=Desire%20Calvin%20Harris%20Sam%20Smith',
        youtube_music:
          'https://music.youtube.com/search?q=Desire+Calvin+Harris+Sam+Smith',
        amazon_music:
          'https://music.amazon.com/search/Desire%20Calvin%20Harris%20Sam%20Smith',
        tidal:
          'https://listen.tidal.com/search?q=Desire%20Calvin%20Harris%20Sam%20Smith',
      },
      tracks: [
        {
          title: 'Desire with Sam Smith',
          slug: 'desire-with-sam-smith',
          trackNumber: 1,
          discNumber: 1,
          durationMs: 180000,
          isrc: 'GBARL2300728',
        },
      ],
    },
    {
      id: 'calvin-miracle',
      title: 'Miracle with Ellie Goulding',
      slug: 'miracle-with-ellie-goulding',
      releaseType: 'single',
      releaseDate: '2023-07-22',
      artworkUrl: '/images/demo/artwork-5.png',
      totalTracks: 1,
      totalDurationMs: 219000,
      upc: '194399301005',
      label: 'Columbia',
      spotifyPopularity: 86,
      artistNames: ['Calvin Harris', 'Ellie Goulding'],
      genres: ['Dance', 'House'],
      primaryIsrc: 'GBARL2300722',
      providerUrls: {
        spotify:
          'https://open.spotify.com/search/Miracle%20Calvin%20Harris%20Ellie%20Goulding',
        apple_music:
          'https://music.apple.com/us/search?term=Miracle%20Calvin%20Harris%20Ellie%20Goulding',
        youtube_music:
          'https://music.youtube.com/search?q=Miracle+Calvin+Harris+Ellie+Goulding',
        amazon_music:
          'https://music.amazon.com/search/Miracle%20Calvin%20Harris%20Ellie%20Goulding',
        tidal:
          'https://listen.tidal.com/search?q=Miracle%20Calvin%20Harris%20Ellie%20Goulding',
      },
      tracks: [
        {
          title: 'Miracle with Ellie Goulding',
          slug: 'miracle-with-ellie-goulding',
          trackNumber: 1,
          discNumber: 1,
          durationMs: 219000,
          isrc: 'GBARL2300722',
        },
      ],
    },
    {
      id: 'calvin-miracle-video',
      title: 'Miracle (Official Music Video)',
      slug: 'miracle-official-music-video',
      releaseType: 'music_video',
      releaseDate: '2023-04-14',
      artworkUrl: 'https://i.ytimg.com/vi/v7GHn2WJCM4/maxresdefault.jpg',
      totalTracks: 0,
      totalDurationMs: 219000,
      label: 'Columbia',
      spotifyPopularity: 0,
      artistNames: ['Calvin Harris', 'Ellie Goulding'],
      genres: ['Dance', 'House'],
      primaryIsrc: '',
      providerUrls: {
        youtube: 'https://www.youtube.com/watch?v=v7GHn2WJCM4',
      },
      metadata: {
        youtubeVideoId: 'v7GHn2WJCM4',
        youtubeThumbnailUrl:
          'https://i.ytimg.com/vi/v7GHn2WJCM4/maxresdefault.jpg',
        youtubeChannelId: 'UCIjYyZxkFucP_W-tmXg_ILw',
        youtubeChannelName: 'Calvin Harris',
        duration: 219,
      },
    },
  ],
  tourDates: [
    {
      externalId: 'calvin-austin-2026',
      title: 'Festival Headline Set',
      venueName: 'Coca-Cola Sips & Sounds Music Festival',
      city: 'Austin',
      region: 'TX',
      country: 'USA',
      provider: 'manual',
      ticketStatus: 'available',
      ticketUrl: 'https://calvinharris.com/shows',
      latitude: 30.2672,
      longitude: -97.7431,
      timezone: 'America/Chicago',
      startDate: '2026-03-14T20:00:00-05:00',
      startTime: '8:00 PM',
    },
    {
      externalId: 'calvin-bengaluru-2026',
      title: null,
      venueName: 'NICE Grounds',
      city: 'Bengaluru',
      region: null,
      country: 'India',
      provider: 'bandsintown',
      ticketStatus: 'available',
      ticketUrl: 'https://calvinharris.com/shows',
      latitude: 12.9716,
      longitude: 77.5946,
      timezone: 'Asia/Kolkata',
      startDate: '2026-04-17T20:00:00+05:30',
      startTime: '8:00 PM',
    },
    {
      externalId: 'calvin-mumbai-2026',
      title: null,
      venueName: 'Infinity Bay, Sewri',
      city: 'Mumbai',
      region: null,
      country: 'India',
      provider: 'bandsintown',
      ticketStatus: 'available',
      ticketUrl: 'https://calvinharris.com/shows',
      latitude: 19.076,
      longitude: 72.8777,
      timezone: 'Asia/Kolkata',
      startDate: '2026-04-18T20:00:00+05:30',
      startTime: '8:00 PM',
    },
    {
      externalId: 'calvin-delhi-2026',
      title: null,
      venueName: 'Leisure Valley Ground',
      city: 'Delhi',
      region: null,
      country: 'India',
      provider: 'bandsintown',
      ticketStatus: 'available',
      ticketUrl: 'https://calvinharris.com/shows',
      latitude: 28.6139,
      longitude: 77.209,
      timezone: 'Asia/Kolkata',
      startDate: '2026-04-19T20:00:00+05:30',
      startTime: '8:00 PM',
    },
    {
      externalId: 'calvin-london-2026',
      title: null,
      venueName: 'The O2',
      city: 'London',
      region: null,
      country: 'UK',
      provider: 'manual',
      ticketStatus: 'available',
      ticketUrl: 'https://calvinharris.com/shows',
      latitude: 51.503,
      longitude: 0.003,
      timezone: 'Europe/London',
      startDate: '2026-04-25T21:00:00+01:00',
      startTime: '9:00 PM',
    },
    {
      externalId: 'calvin-vegas-2026-05-02',
      title: 'Encore Residency',
      venueName: 'Encore Beach Club',
      city: 'Las Vegas',
      region: 'NV',
      country: 'USA',
      provider: 'manual',
      ticketStatus: 'available',
      ticketUrl: 'https://calvinharris.com/shows',
      latitude: 36.1699,
      longitude: -115.1398,
      timezone: 'America/Los_Angeles',
      startDate: '2026-05-02T22:00:00-07:00',
      startTime: '10:00 PM',
    },
    {
      externalId: 'calvin-ibiza-2026-05-29',
      title: 'Ushuaia Ibiza Opening Party',
      venueName: 'Ushuaia Ibiza',
      city: 'Ibiza',
      region: null,
      country: 'Spain',
      provider: 'manual',
      ticketStatus: 'available',
      ticketUrl: 'https://calvinharris.com/shows',
      latitude: 38.9067,
      longitude: 1.4206,
      timezone: 'Europe/Madrid',
      startDate: '2026-05-29T23:30:00+02:00',
      startTime: '11:30 PM',
    },
    {
      externalId: 'calvin-ibiza-2026-06-05',
      title: 'Ushuaia Ibiza Residency',
      venueName: 'Ushuaia Ibiza',
      city: 'Ibiza',
      region: null,
      country: 'Spain',
      provider: 'manual',
      ticketStatus: 'available',
      ticketUrl: 'https://calvinharris.com/shows',
      latitude: 38.9067,
      longitude: 1.4206,
      timezone: 'Europe/Madrid',
      startDate: '2026-06-05T23:30:00+02:00',
      startTime: '11:30 PM',
    },
  ],
};

export function getInternalDemoPersona(id: DemoPersona['id']): DemoPersona {
  return id === 'founder' ? FOUNDER_DEMO_PERSONA : INTERNAL_DJ_DEMO_PERSONA;
}
