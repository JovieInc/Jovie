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
  imageUrl: 'https://i.scdn.co/image/ab6761610000e5eb4293385bf5c9f34c02966e7a',
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
      'https://i.scdn.co/image/ab6761610000e5eb4293385bf5c9f34c02966e7a',
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
        'https://i.scdn.co/image/ab67616d0000b27399760620b5e8a1b49db3b399',
      releaseDate: '2022-10-14',
      spotifyPopularity: 54,
    },
    {
      id: 'rel-2',
      title: 'Sunshine Kitty',
      artworkUrl:
        'https://i.scdn.co/image/ab67616d0000b273e7c28c0e20e1b3455e0c81fc',
      releaseDate: '2019-09-20',
      spotifyPopularity: 48,
    },
    {
      id: 'rel-3',
      title: 'Blue Lips',
      artworkUrl:
        'https://i.scdn.co/image/ab67616d0000b2731d33ef44ae0dfae76a6e2141',
      releaseDate: '2017-11-17',
      spotifyPopularity: 42,
    },
    {
      id: 'rel-4',
      title: 'Lady Wood',
      artworkUrl:
        'https://i.scdn.co/image/ab67616d0000b2737dbcafa65e3159fd9b3c3685',
      releaseDate: '2016-10-28',
      spotifyPopularity: 40,
    },
    {
      id: 'rel-5',
      title: 'Queen of the Clouds',
      artworkUrl:
        'https://i.scdn.co/image/ab67616d0000b2735a015a8cc39e0c83e99e5eec',
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
      'https://i.scdn.co/image/ab6761610000e5eb4293385bf5c9f34c02966e7a',
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
