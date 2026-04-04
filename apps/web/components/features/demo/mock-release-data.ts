/**
 * Rich mock data shaped to match real production component interfaces.
 *
 * - ReleaseViewModel[] for the real ReleaseTable component
 * - AudienceMember[] for the real UnifiedTable + audience columns
 *
 * All data is static — no DB, no auth, no server actions.
 */

import type {
  ReleaseSidebarAnalytics,
  ReleaseSidebarTrack,
} from '@/components/organisms/release-sidebar/types';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import type { AudienceMember } from '@/types';

// ── Provider config (matches the shape ReleaseTable expects) ────────────────

export const DEMO_PROVIDER_CONFIG: Record<
  string,
  { label: string; accent: string }
> = {
  spotify: { label: 'Spotify', accent: '#1DB954' },
  apple_music: { label: 'Apple Music', accent: '#FA2D48' },
  youtube: { label: 'YouTube', accent: '#FF0000' },
  youtube_music: { label: 'YouTube Music', accent: '#FF0000' },
  soundcloud: { label: 'SoundCloud', accent: '#FF5500' },
  deezer: { label: 'Deezer', accent: '#A238FF' },
  tidal: { label: 'Tidal', accent: '#000000' },
  amazon_music: { label: 'Amazon Music', accent: '#00A8E1' },
  bandcamp: { label: 'Bandcamp', accent: '#1DA0C3' },
  beatport: { label: 'Beatport', accent: '#94D500' },
  pandora: { label: 'Pandora', accent: '#224099' },
  napster: { label: 'Napster', accent: '#000000' },
  audiomack: { label: 'Audiomack', accent: '#FFA200' },
  qobuz: { label: 'Qobuz', accent: '#2C8CBA' },
  anghami: { label: 'Anghami', accent: '#D60062' },
  boomplay: { label: 'Boomplay', accent: '#FF6600' },
  iheartradio: { label: 'iHeartRadio', accent: '#C6002B' },
  tiktok: { label: 'TikTok', accent: '#010101' },
};

// Helper to create provider links
function makeProviders(
  keys: ProviderKey[],
  slug: string
): ReleaseViewModel['providers'] {
  return keys.map((key, i) => ({
    key,
    url: `https://${key}.example.com/${slug}`,
    source: 'ingested' as const,
    updatedAt: '2026-02-01T00:00:00Z',
    label: DEMO_PROVIDER_CONFIG[key].label,
    path: `/${slug}`,
    isPrimary: i < 3,
  }));
}

// ── Release view models ─────────────────────────────────────────────────────

export const DEMO_RELEASE_VIEW_MODELS: ReleaseViewModel[] = [
  {
    profileId: 'demo-profile',
    id: 'rel-take-me-over',
    title: 'Take Me Over',
    artistNames: ['Tim White', 'Erica Gibson'],
    releaseDate: '2014-10-01',
    artworkUrl:
      'https://i.scdn.co/image/ab67616d0000b2732c05c3b2fb08c606843e7d98',
    slug: 'take-me-over',
    smartLinkPath: '/tim-white/take-me-over',
    spotifyPopularity: 70,
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    totalDurationMs: 210_000,
    primaryIsrc: 'USRC17300001',
    genres: ['Dance', 'Pop'],
    providers: makeProviders(
      ['spotify', 'apple_music', 'youtube', 'amazon_music', 'deezer', 'tidal'],
      'take-me-over'
    ),
  },
  {
    profileId: 'demo-profile',
    id: 'rel-never-say-a-word',
    title: 'Never Say A Word',
    artistNames: ['Tim White'],
    releaseDate: '2024-05-07',
    artworkUrl:
      'https://i.scdn.co/image/ab67616d0000b273cbe401fd4a00b05b26a5233f',
    slug: 'never-say-a-word',
    smartLinkPath: '/tim-white/never-say-a-word',
    spotifyPopularity: 61,
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    totalDurationMs: 225_000,
    primaryIsrc: 'USRC17400002',
    genres: ['Pop', 'Electronic'],
    providers: makeProviders(
      ['spotify', 'apple_music', 'youtube', 'amazon_music', 'deezer'],
      'never-say-a-word'
    ),
  },
  {
    profileId: 'demo-profile',
    id: 'rel-deep-end',
    title: 'The Deep End',
    artistNames: ['Cosmic Gate', 'Tim White'],
    releaseDate: '2017-02-10',
    artworkUrl:
      'https://i.scdn.co/image/ab67616d0000b273164aac758a1deb79d33cc1b4',
    slug: 'the-deep-end',
    smartLinkPath: '/tim-white/the-deep-end',
    spotifyPopularity: 64,
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    totalDurationMs: 198_000,
    primaryIsrc: 'USRC17100003',
    genres: ['Trance', 'Progressive House'],
    providers: makeProviders(
      ['spotify', 'apple_music', 'youtube', 'amazon_music', 'deezer', 'tidal'],
      'the-deep-end'
    ),
  },
  {
    profileId: 'demo-profile',
    id: 'rel-revival',
    title: 'Revival',
    artistNames: ['Tom Fall', 'Tim White'],
    releaseDate: '2016-09-12',
    artworkUrl: undefined,
    slug: 'revival',
    smartLinkPath: '/tim-white/revival',
    spotifyPopularity: 53,
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 2,
    totalDurationMs: 469_000,
    primaryIsrc: 'USRC12345004',
    genres: ['Trance', 'Dance'],
    providers: makeProviders(
      ['spotify', 'apple_music', 'youtube', 'amazon_music', 'deezer'],
      'revival'
    ),
  },
  {
    profileId: 'demo-profile',
    id: 'rel-sober',
    title: 'Sober',
    artistNames: ['Jochen Miller', 'Tom Fall', 'Tim White'],
    releaseDate: '2016-11-07',
    artworkUrl: undefined,
    slug: 'sober',
    smartLinkPath: '/tim-white/sober',
    spotifyPopularity: 49,
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    totalDurationMs: 214_000,
    primaryIsrc: 'USRC12345005',
    genres: ['Dance', 'Electronic'],
    providers: makeProviders(
      ['spotify', 'apple_music', 'youtube', 'deezer'],
      'sober'
    ),
  },
  {
    profileId: 'demo-profile',
    id: 'rel-wheels-up',
    title: 'Wheels Up',
    artistNames: ['Lynx', 'Tim White'],
    releaseDate: '2018-04-27',
    artworkUrl: undefined,
    slug: 'wheels-up',
    smartLinkPath: '/tim-white/wheels-up',
    spotifyPopularity: 46,
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    totalDurationMs: 189_000,
    primaryIsrc: 'USRC12345006',
    genres: ['Pop', 'Dance'],
    providers: makeProviders(
      ['spotify', 'apple_music', 'youtube', 'amazon_music'],
      'wheels-up'
    ),
  },
  {
    profileId: 'demo-profile',
    id: 'rel-seaside-heights',
    title: 'Seaside Heights',
    artistNames: ['Tim White'],
    releaseDate: '2020-05-15',
    artworkUrl: undefined,
    slug: 'seaside-heights',
    smartLinkPath: '/tim-white/seaside-heights',
    spotifyPopularity: 43,
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    totalDurationMs: 201_000,
    primaryIsrc: 'USRC12345007',
    genres: ['Pop', 'Electronic'],
    providers: makeProviders(['spotify', 'apple_music'], 'seaside-heights'),
  },
  {
    profileId: 'demo-profile',
    id: 'rel-tomorrow-sounds',
    title: 'Tomorrow Sounds',
    artistNames: ['Tim White'],
    releaseDate: '2020-04-03',
    artworkUrl: undefined,
    slug: 'tomorrow-sounds',
    smartLinkPath: '/tim-white/tomorrow-sounds',
    spotifyPopularity: 39,
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    totalDurationMs: 203_000,
    primaryIsrc: 'USRC12345008',
    genres: ['Pop', 'Synthwave'],
    providers: makeProviders(['spotify'], 'tomorrow-sounds'),
  },
  {
    profileId: 'demo-profile',
    id: 'rel-doge-to-mars',
    title: 'Doge (To Mars)',
    artistNames: ['Tim White'],
    releaseDate: '2021-02-21',
    artworkUrl: undefined,
    slug: 'doge-to-mars',
    smartLinkPath: '/tim-white/doge-to-mars',
    spotifyPopularity: 35,
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    totalDurationMs: 186_000,
    primaryIsrc: 'USRC12345009',
    genres: ['Electronic', 'Pop'],
    providers: makeProviders(
      ['spotify', 'apple_music', 'youtube', 'bandcamp'],
      'doge-to-mars'
    ),
  },
  {
    profileId: 'demo-profile',
    id: 'rel-this-is-love',
    title: 'This Is Love',
    artistNames: ['Tim White'],
    releaseDate: '2020-01-31',
    artworkUrl: undefined,
    slug: 'this-is-love',
    smartLinkPath: '/tim-white/this-is-love',
    spotifyPopularity: 37,
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    totalDurationMs: 191_000,
    primaryIsrc: 'USRC12345010',
    genres: ['Pop', 'Dance'],
    providers: makeProviders(
      ['spotify', 'apple_music', 'youtube', 'deezer', 'tidal'],
      'this-is-love'
    ),
  },
  {
    profileId: 'demo-profile',
    id: 'rel-supernova-girl',
    title: 'Supernova Girl',
    artistNames: ['Tim White'],
    releaseDate: '2020-03-06',
    artworkUrl: undefined,
    slug: 'supernova-girl',
    smartLinkPath: '/tim-white/supernova-girl',
    spotifyPopularity: 33,
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    totalDurationMs: 153_000,
    primaryIsrc: 'USRC12345011',
    genres: ['Pop', 'Dance'],
    providers: makeProviders(['spotify', 'apple_music'], 'supernova-girl'),
  },
];

function makeDemoTracks(
  release: ReleaseViewModel,
  count = Math.min(Math.max(release.totalTracks, 1), 6)
): ReleaseSidebarTrack[] {
  return Array.from({ length: count }, (_, index) => {
    const trackNumber = index + 1;
    return {
      id: `${release.id}-track-${trackNumber}`,
      releaseId: release.id,
      releaseSlug: release.slug,
      title: count === 1 ? release.title : `${release.title} ${trackNumber}`,
      slug: `${release.slug}-track-${trackNumber}`,
      smartLinkPath: `${release.smartLinkPath}/tracks/${trackNumber}`,
      trackNumber,
      discNumber: 1,
      durationMs:
        release.totalDurationMs && count > 0
          ? Math.round(release.totalDurationMs / count)
          : 180_000,
      isrc: `${release.primaryIsrc ?? 'USRC00000000'}${trackNumber}`,
      isExplicit: release.isExplicit,
      previewUrl: release.previewUrl ?? null,
      audioUrl: null,
      audioFormat: null,
      providers: release.providers,
    };
  });
}

function makeDemoAnalytics(
  release: ReleaseViewModel,
  index: number
): ReleaseSidebarAnalytics {
  const totalClicks = 480 + index * 137;
  const providerClicks = release.providers.slice(0, 4).map((provider, i) => ({
    provider: provider.key,
    clicks: Math.max(24, Math.round(totalClicks / (i + 2.4))),
  }));

  return {
    totalClicks,
    last7DaysClicks: Math.max(32, Math.round(totalClicks * 0.18)),
    providerClicks,
  };
}

export const DEMO_RELEASE_SIDEBAR_FIXTURES = Object.fromEntries(
  DEMO_RELEASE_VIEW_MODELS.map((release, index) => [
    release.id,
    {
      analytics: makeDemoAnalytics(release, index),
      tracks: makeDemoTracks(release),
    },
  ])
);

// ── Audience members (50+ entries for rich demo) ────────────────────────────

const CITIES = [
  'Los Angeles, US',
  'New York, US',
  'London, UK',
  'Portland, OR',
  'Tokyo, JP',
  'Berlin, DE',
  'Toronto, CA',
  'Sydney, AU',
  'Seoul, KR',
  'Stockholm, SE',
  'Paris, FR',
  'Amsterdam, NL',
  'Austin, TX',
  'Chicago, IL',
  'Nashville, TN',
  'Miami, FL',
  'Seattle, WA',
  'Melbourne, AU',
  'Oslo, NO',
  'Copenhagen, DK',
];

const SOURCES = [
  'instagram.com',
  'twitter.com',
  'tiktok.com',
  'spotify.com',
  'google.com',
  'direct',
  'youtube.com',
  'facebook.com',
  'reddit.com',
  'soundcloud.com',
];

const ACTIONS = [
  'Played Night Drive',
  'Saved to library',
  'Shared profile',
  'Subscribed',
  'Viewed profile',
  'Clicked Spotify',
  'Clicked Apple Music',
  'Tipped $5',
  'Tipped $10',
  'Played Neon Nights',
  'Pre-saved Midnight Express',
  'Downloaded vCard',
  'Opened smart link',
  'Played The Sound',
  'Followed on Spotify',
  'Added to playlist',
  'Clicked YouTube',
  'Viewed tour dates',
  'Signed up for SMS',
  'Opened email',
];

const NAMES = [
  'alex.rivera@gmail.com',
  'jordan_beats',
  'maya.chen@outlook.com',
  'sam_music_fan',
  'olivia.k@hey.com',
  'dj_night_owl',
  'lena.park@icloud.com',
  'kai.nomura@proton.me',
  'mira_dreamwave',
  'ren.takashi@gmail.com',
  'leo.park@me.com',
  'nova_synth',
  'ash.morgan@yahoo.com',
  'zara_grooves',
  'finn.oconnor@gmail.com',
  'luna_beats42',
  'river.stone@pm.me',
  'eliot_bass',
  'jade.wu@hotmail.com',
  'phoenix_sounds',
  'casey.jones@gmail.com',
  'indie_wren',
  'blake.harper@icloud.com',
  'sky_frequencies',
  'reese.taylor@gmail.com',
  'echo_chamber',
  'drew.patel@outlook.com',
  'vinyl_jules',
  'rowan.lee@proton.me',
  'drift_audio',
  'sage.brown@gmail.com',
  'pulse_rider',
  'quinn.murphy@hey.com',
  'neon_fox',
  'avery.kim@me.com',
  'bass_pilgrim',
  'jules.martinez@gmail.com',
  'wave_walker',
  'morgan.cruz@outlook.com',
  'ambient_owl',
  'terry.nguyen@gmail.com',
  'sonic_drift',
  'pat.anderson@pm.me',
  'rhythm_sage',
  'cam.white@icloud.com',
  'groove_atlas',
  'alex.thompson@hey.com',
  'synth_nomad',
  'jessie.garcia@gmail.com',
  'deep_current',
  'riley.davis@outlook.com',
  'tone_shift',
  'chris.wilson@proton.me',
  'freq_rider',
];

const INTENT_TAGS: Record<string, string[]> = {
  high: ['superfan'],
  medium: ['engaged'],
};

const DEMO_DEVICE_TYPES = ['mobile', 'desktop', 'tablet'] as const;

function makeAudienceMember(index: number): AudienceMember {
  const name = NAMES[index % NAMES.length];
  const city = CITIES[index % CITIES.length];
  const [cityName, countryCode] = city.split(', ');
  const source = SOURCES[index % SOURCES.length];
  const action = ACTIONS[index % ACTIONS.length];
  const hasEmail = name.includes('@');
  const intentLevels: AudienceMember['intentLevel'][] = [
    'high',
    'medium',
    'low',
  ];
  const intentLevel = intentLevels[index % 3];
  const types: AudienceMember['type'][] = [
    'email',
    'anonymous',
    'sms',
    'spotify',
    'customer',
  ];

  // Days ago for lastSeenAt
  const daysAgo = Math.floor(index * 0.7);
  const lastSeen = new Date();
  lastSeen.setDate(lastSeen.getDate() - daysAgo);

  return {
    id: `aud-${String(index + 1).padStart(3, '0')}`,
    type: types[index % types.length],
    displayName: name,
    locationLabel: city,
    geoCity: cityName,
    geoCountry: countryCode,
    visits: Math.max(1, Math.floor(20 - index * 0.3)),
    engagementScore: Math.max(5, 95 - index * 1.5),
    intentLevel,
    latestActions: [{ label: action, timestamp: lastSeen.toISOString() }],
    referrerHistory: [{ url: source, timestamp: lastSeen.toISOString() }],
    utmParams:
      index % 4 === 0
        ? { source: 'ig', medium: 'social', campaign: 'spring26' }
        : {},
    email: hasEmail ? name : null,
    phone: index % 5 === 0 ? `+1555${String(1000 + index).slice(0, 4)}` : null,
    spotifyConnected: index % 3 === 0,
    purchaseCount: index < 10 ? Math.floor(Math.random() * 3) : 0,
    tipAmountTotalCents: index < 15 ? Math.floor(Math.random() * 2000) : 0,
    tipCount: index < 15 ? Math.floor(Math.random() * 5) : 0,
    tags: INTENT_TAGS[intentLevel ?? ''] ?? [],
    deviceType: DEMO_DEVICE_TYPES[index % 3],
    lastSeenAt: lastSeen.toISOString(),
  };
}

export const DEMO_AUDIENCE_MEMBERS: AudienceMember[] = Array.from(
  { length: 5 },
  (_, i) => makeAudienceMember(i)
);
