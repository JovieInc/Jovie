/**
 * Mock data for the onboarding demo route.
 *
 * Provides realistic but static fixtures so the demo can render
 * every onboarding step without real API calls or auth.
 */

export interface MockSelectedArtist {
  id: string;
  imageUrl: string | null;
  name: string;
  url: string;
}

export interface MockDiscoveryDspItem {
  confidenceScore: number | null;
  externalArtistId: string | null;
  externalArtistImageUrl: string | null;
  externalArtistName: string | null;
  externalArtistUrl: string | null;
  id: string;
  providerId: string;
  providerLabel: string;
  status: 'suggested' | 'confirmed' | 'rejected' | 'auto_confirmed';
}

export interface MockDiscoverySocialItem {
  confidence: number;
  id: string;
  kind: 'link' | 'suggestion';
  platform: string;
  platformLabel: string;
  source: string | null;
  state: string;
  url: string;
  username: string | null;
  version: number | null;
}

export interface MockDiscoveryRelease {
  artworkUrl: string | null;
  id: string;
  releaseDate: string | null;
  spotifyPopularity: number | null;
  title: string;
}

export interface MockDiscoverySnapshot {
  counts: {
    activeSocialCount: number;
    dspCount: number;
    releaseCount: number;
  };
  dspItems: MockDiscoveryDspItem[];
  hasPendingDiscoveryJob: boolean;
  profile: {
    activeSinceYear: number | null;
    appleMusicConnected: boolean;
    avatarUrl: string | null;
    bio: string | null;
    displayName: string | null;
    genres: string[] | null;
    hometown: string | null;
    id: string;
    location: string | null;
    onboardingCompletedAt: string | null;
    username: string;
  };
  releases: MockDiscoveryRelease[];
  selectedSpotifyProfile: MockSelectedArtist | null;
  socialItems: MockDiscoverySocialItem[];
}

export const DEMO_SELECTED_ARTIST: MockSelectedArtist = {
  id: '4NHQUGzhtTLFvgF5SZesLK',
  imageUrl:
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop',
  name: 'Tove Lo',
  url: 'https://open.spotify.com/artist/4NHQUGzhtTLFvgF5SZesLK',
};

export const DEMO_DISCOVERY_SNAPSHOT: MockDiscoverySnapshot = {
  counts: {
    activeSocialCount: 3,
    dspCount: 4,
    releaseCount: 8,
  },
  dspItems: [
    {
      id: 'dsp-apple',
      providerId: 'apple_music',
      providerLabel: 'Apple Music',
      externalArtistId: '1234567',
      externalArtistName: 'Tove Lo',
      externalArtistUrl: 'https://music.apple.com/artist/tove-lo/543416880',
      externalArtistImageUrl: null,
      confidenceScore: 0.98,
      status: 'auto_confirmed',
    },
    {
      id: 'dsp-tidal',
      providerId: 'tidal',
      providerLabel: 'Tidal',
      externalArtistId: '4609060',
      externalArtistName: 'Tove Lo',
      externalArtistUrl: 'https://tidal.com/browse/artist/4609060',
      externalArtistImageUrl: null,
      confidenceScore: 0.95,
      status: 'suggested',
    },
    {
      id: 'dsp-deezer',
      providerId: 'deezer',
      providerLabel: 'Deezer',
      externalArtistId: '5765568',
      externalArtistName: 'Tove Lo',
      externalArtistUrl: 'https://www.deezer.com/artist/5765568',
      externalArtistImageUrl: null,
      confidenceScore: 0.92,
      status: 'confirmed',
    },
    {
      id: 'dsp-soundcloud',
      providerId: 'soundcloud',
      providerLabel: 'SoundCloud',
      externalArtistId: null,
      externalArtistName: 'Tove Lo',
      externalArtistUrl: 'https://soundcloud.com/tovelo',
      externalArtistImageUrl: null,
      confidenceScore: 0.7,
      status: 'suggested',
    },
  ],
  hasPendingDiscoveryJob: false,
  profile: {
    activeSinceYear: 2012,
    appleMusicConnected: true,
    avatarUrl:
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop',
    bio: 'Swedish singer-songwriter known for dark pop anthems and genre-bending production.',
    displayName: 'Tove Lo',
    genres: ['Dark Pop', 'Electropop', 'Swedish Pop', 'Dance Pop'],
    hometown: 'Stockholm, Sweden',
    id: 'demo-profile',
    location: 'Los Angeles, CA',
    onboardingCompletedAt: null,
    username: 'tovelo',
  },
  releases: [
    {
      id: 'rel-1',
      title: 'Dirt Femme',
      artworkUrl:
        'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop',
      releaseDate: '2022-10-14',
      spotifyPopularity: 54,
    },
    {
      id: 'rel-2',
      title: 'Sunshine Kitty',
      artworkUrl:
        'https://images.unsplash.com/photo-1501612780327-45045538702b?w=300&h=300&fit=crop',
      releaseDate: '2019-09-20',
      spotifyPopularity: 48,
    },
    {
      id: 'rel-3',
      title: 'Blue Lips',
      artworkUrl:
        'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop',
      releaseDate: '2017-11-17',
      spotifyPopularity: 42,
    },
    {
      id: 'rel-4',
      title: 'Lady Wood',
      artworkUrl:
        'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop',
      releaseDate: '2016-10-28',
      spotifyPopularity: 40,
    },
    {
      id: 'rel-5',
      title: 'Queen of the Clouds',
      artworkUrl:
        'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&h=300&fit=crop',
      releaseDate: '2014-09-30',
      spotifyPopularity: 50,
    },
  ],
  selectedSpotifyProfile: DEMO_SELECTED_ARTIST,
  socialItems: [
    {
      id: 'social-ig',
      kind: 'link',
      platform: 'instagram',
      platformLabel: 'Instagram',
      url: 'https://instagram.com/tovelo',
      username: '@tovelo',
      state: 'active',
      confidence: 1,
      source: 'spotify',
      version: null,
    },
    {
      id: 'social-twitter',
      kind: 'link',
      platform: 'twitter',
      platformLabel: 'Twitter / X',
      url: 'https://twitter.com/ToveLo',
      username: '@ToveLo',
      state: 'active',
      confidence: 0.95,
      source: 'spotify',
      version: null,
    },
    {
      id: 'social-tiktok',
      kind: 'suggestion',
      platform: 'tiktok',
      platformLabel: 'TikTok',
      url: 'https://tiktok.com/@tovelo',
      username: '@tovelo',
      state: 'pending',
      confidence: 0.82,
      source: 'web-search',
      version: null,
    },
    {
      id: 'social-yt',
      kind: 'link',
      platform: 'youtube',
      platformLabel: 'YouTube',
      url: 'https://youtube.com/@ToveLoVEVO',
      username: 'ToveLoVEVO',
      state: 'active',
      confidence: 0.9,
      source: 'spotify',
      version: null,
    },
  ],
};

export const DEMO_LATE_ARRIVALS = [
  {
    id: 'late-1',
    title: '2 new Apple Music links matched',
    subtitle: 'Apple Music',
  },
  {
    id: 'late-2',
    title: 'TikTok profile confirmed',
    subtitle: 'Social',
  },
];

export const DEMO_HANDLE_SUGGESTIONS = ['tovelo', 'tove-lo', 'tovelomusic'];

export interface MockSpotifySearchResult {
  id: string;
  name: string;
  imageUrl: string | null;
  followers: number;
  url: string;
}

export const DEMO_SPOTIFY_SEARCH_RESULTS: MockSpotifySearchResult[] = [
  {
    id: '4NHQUGzhtTLFvgF5SZesLK',
    name: 'Tove Lo',
    imageUrl:
      'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop',
    followers: 4_200_000,
    url: 'https://open.spotify.com/artist/4NHQUGzhtTLFvgF5SZesLK',
  },
  {
    id: '2xyz',
    name: 'Tove Styrke',
    imageUrl: null,
    followers: 280_000,
    url: 'https://open.spotify.com/artist/2xyz',
  },
  {
    id: '3abc',
    name: 'Tove Bøygard',
    imageUrl: null,
    followers: 1_200,
    url: 'https://open.spotify.com/artist/3abc',
  },
];
