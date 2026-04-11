import type {
  DemoPersona,
  DemoPersonaProfile,
  DemoPersonaRelease,
  DemoPersonaSocialLink,
  DemoPersonaTourDate,
} from '@/lib/demo-personas';
import type { ProviderKey } from '@/lib/discography/types';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

export interface TimWhiteDemoReleaseAnalyticsTarget {
  readonly totalClicks: number;
  readonly last7DaysClicks: number;
  readonly providerClicks: Readonly<Partial<Record<ProviderKey, number>>>;
}

export interface TimWhiteDemoManifest {
  readonly handle: string;
  readonly featuredReleaseId: string;
  readonly upcomingReleaseId: string;
  readonly dashboardReleaseSequenceIds: readonly string[];
  readonly profile: DemoPersonaProfile;
  readonly socialLinks: readonly DemoPersonaSocialLink[];
  readonly releases: readonly DemoPersonaRelease[];
  readonly tourDates: readonly DemoPersonaTourDate[];
  readonly analyticsTargets: Readonly<
    Partial<Record<string, TimWhiteDemoReleaseAnalyticsTarget>>
  >;
}

const TIM_WHITE_DEMO_SOCIAL_LINKS: readonly DemoPersonaSocialLink[] = [
  {
    platform: 'spotify',
    platformType: 'music_streaming',
    url: TIM_WHITE_PROFILE.spotifyUrl,
    displayText: 'Listen on Spotify',
    sortOrder: 1,
  },
  {
    platform: 'apple_music',
    platformType: 'music_streaming',
    url: 'https://music.apple.com/us/artist/tim-white/1711845195',
    displayText: 'Listen on Apple Music',
    sortOrder: 2,
  },
  {
    platform: 'instagram',
    platformType: 'social',
    url: 'https://instagram.com/timwhite',
    displayText: 'Instagram',
    sortOrder: 3,
  },
  {
    platform: 'tiktok',
    platformType: 'social',
    url: 'https://www.tiktok.com/@timwhite',
    displayText: 'TikTok',
    sortOrder: 4,
  },
  {
    platform: 'youtube',
    platformType: 'video',
    url: 'https://www.youtube.com/@timwhite',
    displayText: 'YouTube',
    sortOrder: 5,
  },
  {
    platform: 'website',
    platformType: 'website',
    url: 'https://jov.ie/timwhite',
    displayText: 'Official Website',
    sortOrder: 6,
  },
  {
    platform: 'venmo',
    platformType: 'payment',
    url: 'https://account.venmo.com/u/timwhite',
    displayText: 'Tip on Venmo',
    sortOrder: 7,
  },
];

const TIM_WHITE_DEMO_RELEASES: readonly DemoPersonaRelease[] = [
  {
    id: 'tim-take-me-over',
    title: 'Take Me Over',
    slug: 'take-me-over',
    releaseType: 'single',
    releaseDate: '2024-08-09',
    artworkUrl: '/img/releases/take-me-over.jpg',
    totalTracks: 1,
    totalDurationMs: 211000,
    upc: '860009904103',
    label: 'Jovie',
    spotifyPopularity: 63,
    artistNames: [TIM_WHITE_PROFILE.name],
    genres: ['Electronic', 'Dance'],
    primaryIsrc: 'QZFZ22481003',
    providerUrls: {
      spotify: `${TIM_WHITE_PROFILE.spotifyUrl}?context=take-me-over`,
      apple_music:
        'https://music.apple.com/us/search?term=Take%20Me%20Over%20Tim%20White',
      youtube_music:
        'https://music.youtube.com/search?q=Take+Me+Over+Tim+White',
      amazon_music:
        'https://music.amazon.com/search/Take%20Me%20Over%20Tim%20White',
      deezer: 'https://www.deezer.com/search/Take%20Me%20Over%20Tim%20White',
    },
    tracks: [
      {
        title: 'Take Me Over',
        slug: 'take-me-over',
        trackNumber: 1,
        discNumber: 1,
        durationMs: 211000,
        isrc: 'QZFZ22481003',
      },
    ],
  },
  {
    id: 'tim-the-deep-end',
    title: 'The Deep End',
    slug: 'the-deep-end',
    releaseType: 'single',
    releaseDate: '2025-11-14',
    artworkUrl: '/img/releases/the-deep-end.jpg',
    totalTracks: 1,
    totalDurationMs: 224000,
    upc: '860009904117',
    label: 'Jovie',
    spotifyPopularity: 72,
    artistNames: [TIM_WHITE_PROFILE.name],
    genres: ['Electronic', 'Dance'],
    primaryIsrc: 'QZFZ22511114',
    providerUrls: {
      spotify: `${TIM_WHITE_PROFILE.spotifyUrl}?context=the-deep-end`,
      apple_music:
        'https://music.apple.com/us/search?term=The%20Deep%20End%20Tim%20White',
      youtube_music:
        'https://music.youtube.com/search?q=The+Deep+End+Tim+White',
      amazon_music:
        'https://music.amazon.com/search/The%20Deep%20End%20Tim%20White',
      deezer: 'https://www.deezer.com/search/The%20Deep%20End%20Tim%20White',
    },
    tracks: [
      {
        title: 'The Deep End',
        slug: 'the-deep-end',
        trackNumber: 1,
        discNumber: 1,
        durationMs: 224000,
        isrc: 'QZFZ22511114',
      },
    ],
  },
  {
    id: 'tim-never-say-a-word',
    title: 'Never Say A Word',
    slug: 'never-say-a-word',
    releaseType: 'single',
    releaseDate: '2026-05-22',
    artworkUrl: '/img/releases/never-say-a-word.jpg',
    totalTracks: 1,
    totalDurationMs: 208000,
    upc: '860009904129',
    label: 'Jovie',
    spotifyPopularity: 78,
    artistNames: [TIM_WHITE_PROFILE.name],
    genres: ['Electronic', 'Dance'],
    primaryIsrc: 'QZFZ22605220',
    providerUrls: {
      spotify: `${TIM_WHITE_PROFILE.spotifyUrl}?context=never-say-a-word`,
      apple_music:
        'https://music.apple.com/us/search?term=Never%20Say%20A%20Word%20Tim%20White',
      youtube_music:
        'https://music.youtube.com/search?q=Never+Say+A+Word+Tim+White',
      amazon_music:
        'https://music.amazon.com/search/Never%20Say%20A%20Word%20Tim%20White',
      deezer:
        'https://www.deezer.com/search/Never%20Say%20A%20Word%20Tim%20White',
    },
    tracks: [
      {
        title: 'Never Say A Word',
        slug: 'never-say-a-word',
        trackNumber: 1,
        discNumber: 1,
        durationMs: 208000,
        isrc: 'QZFZ22605220',
      },
    ],
  },
];

const TIM_WHITE_DEMO_TOUR_DATES: readonly DemoPersonaTourDate[] = [
  {
    externalId: 'tim-white-san-francisco-2026-07-18',
    title: 'Tim White Live',
    venueName: 'The Independent',
    city: 'San Francisco',
    region: 'CA',
    country: 'US',
    provider: 'manual',
    ticketStatus: 'available',
    ticketUrl: 'https://www.theindependentsf.com',
    latitude: 37.7755,
    longitude: -122.4376,
    timezone: 'America/Los_Angeles',
    startDate: '2026-07-18T20:00:00.000Z',
    startTime: '20:00',
  },
  {
    externalId: 'tim-white-los-angeles-2026-08-14',
    title: 'Tim White Live',
    venueName: 'El Rey Theatre',
    city: 'Los Angeles',
    region: 'CA',
    country: 'US',
    provider: 'manual',
    ticketStatus: 'available',
    ticketUrl: 'https://www.theelrey.com',
    latitude: 34.0754,
    longitude: -118.3083,
    timezone: 'America/Los_Angeles',
    startDate: '2026-08-14T20:00:00.000Z',
    startTime: '20:00',
  },
];

export const TIM_WHITE_DEMO_MANIFEST: TimWhiteDemoManifest = {
  handle: TIM_WHITE_PROFILE.handle,
  featuredReleaseId: 'tim-the-deep-end',
  upcomingReleaseId: 'tim-never-say-a-word',
  dashboardReleaseSequenceIds: [
    'tim-the-deep-end',
    'tim-never-say-a-word',
    'tim-take-me-over',
  ],
  profile: {
    handle: TIM_WHITE_PROFILE.handle,
    displayName: TIM_WHITE_PROFILE.name,
    avatarSrc: TIM_WHITE_PROFILE.avatarSrc,
    bio: 'Producer, songwriter, and artist building cinematic dance records with a direct-to-fan launch stack that moves as fast as the music.',
    creatorType: 'artist',
    location: 'San Francisco, CA',
    genres: ['Electronic', 'Dance'],
    spotifyArtistId: TIM_WHITE_PROFILE.spotifyArtistId,
    spotifyUrl: TIM_WHITE_PROFILE.spotifyUrl,
    appleMusicUrl: 'https://music.apple.com/us/artist/tim-white/1711845195',
    appleMusicArtistId: '1711845195',
    youtubeUrl: 'https://www.youtube.com/@timwhite',
    youtubeMusicArtistId: 'UCtimwhite',
    deezerArtistId: 'tim-white-deezer',
    tidalArtistId: 'tim-white-tidal',
    soundcloudArtistId: 'tim-white',
    bandsintownArtistName: TIM_WHITE_PROFILE.name,
    venmoHandle: 'timwhite',
    activeSinceYear: 2014,
    spotifyFollowers: 48216,
    spotifyPopularity: 68,
    isFeaturedByDefault: true,
    isClaimedByDefault: true,
  },
  socialLinks: TIM_WHITE_DEMO_SOCIAL_LINKS,
  releases: TIM_WHITE_DEMO_RELEASES,
  tourDates: TIM_WHITE_DEMO_TOUR_DATES,
  analyticsTargets: {
    'tim-the-deep-end': {
      totalClicks: 2841,
      last7DaysClicks: 186,
      providerClicks: {
        spotify: 1540,
        apple_music: 640,
        youtube_music: 376,
        amazon_music: 190,
        deezer: 95,
      },
    },
    'tim-never-say-a-word': {
      totalClicks: 1487,
      last7DaysClicks: 93,
      providerClicks: {
        spotify: 700,
        apple_music: 370,
        youtube_music: 210,
        amazon_music: 117,
        deezer: 90,
      },
    },
    'tim-take-me-over': {
      totalClicks: 926,
      last7DaysClicks: 61,
      providerClicks: {
        spotify: 390,
        apple_music: 250,
        youtube_music: 145,
        amazon_music: 86,
        deezer: 55,
      },
    },
  },
};

export const TIM_WHITE_DEMO_PERSONA: DemoPersona = {
  id: 'founder',
  profile: TIM_WHITE_DEMO_MANIFEST.profile,
  socialLinks: TIM_WHITE_DEMO_MANIFEST.socialLinks,
  releases: TIM_WHITE_DEMO_MANIFEST.releases,
  tourDates: TIM_WHITE_DEMO_MANIFEST.tourDates,
};

export function getTimWhiteDemoReleaseById(id: string): DemoPersonaRelease {
  const release = TIM_WHITE_DEMO_MANIFEST.releases.find(item => item.id === id);

  if (!release) {
    throw new Error(`Unknown Tim White demo release: ${id}`);
  }

  return release;
}

export function getTimWhiteDashboardReleaseSequence(): DemoPersonaRelease[] {
  return TIM_WHITE_DEMO_MANIFEST.dashboardReleaseSequenceIds.map(
    getTimWhiteDemoReleaseById
  );
}
