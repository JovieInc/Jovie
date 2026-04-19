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
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';
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
  release: (typeof INTERNAL_DJ_DEMO_PERSONA.releases)[number]
): ReleaseViewModel['providers'] {
  const entries = Object.entries(release.providerUrls) as Array<
    [ProviderKey, string]
  >;

  return entries.map(([key, url], i) => ({
    key,
    url,
    source: 'ingested' as const,
    updatedAt: '2026-02-01T00:00:00Z',
    label: DEMO_PROVIDER_CONFIG[key].label,
    path: `/${INTERNAL_DJ_DEMO_PERSONA.profile.handle}/${release.slug}`,
    isPrimary: i < 3,
  }));
}

// ── Release view models ─────────────────────────────────────────────────────

export const DEMO_RELEASE_VIEW_MODELS: ReleaseViewModel[] =
  INTERNAL_DJ_DEMO_PERSONA.releases.map(release => ({
    profileId: 'demo-profile',
    id: release.id,
    title: release.title,
    artistNames: [...release.artistNames],
    releaseDate: release.releaseDate,
    status: 'released' as const,
    artworkUrl: release.artworkUrl,
    slug: release.slug,
    smartLinkPath: `/${INTERNAL_DJ_DEMO_PERSONA.profile.handle}/${release.slug}`,
    spotifyPopularity: release.spotifyPopularity,
    releaseType: release.releaseType,
    isExplicit: Boolean(release.tracks?.some(track => track.isExplicit)),
    totalTracks: release.totalTracks,
    totalDiscs: Math.max(
      1,
      ...(release.tracks ?? []).map(track => track.discNumber)
    ),
    totalDurationMs: release.totalDurationMs,
    upc: release.upc,
    label: release.label ?? null,
    primaryIsrc: release.primaryIsrc,
    genres: [...release.genres],
    providers: makeProviders(release),
  }));

function makeDemoTracks(
  release: ReleaseViewModel,
  count = Math.min(Math.max(release.totalTracks, 1), 6)
): ReleaseSidebarTrack[] {
  const personaRelease = INTERNAL_DJ_DEMO_PERSONA.releases.find(
    item => item.id === release.id
  );
  if (personaRelease?.tracks?.length) {
    return personaRelease.tracks.slice(0, count).map(track => ({
      id: `${release.id}-track-${track.trackNumber}`,
      releaseId: release.id,
      releaseSlug: release.slug,
      title: track.title,
      slug: track.slug,
      smartLinkPath: `${release.smartLinkPath}/tracks/${track.trackNumber}`,
      trackNumber: track.trackNumber,
      discNumber: track.discNumber,
      durationMs: track.durationMs,
      isrc: track.isrc,
      isExplicit: Boolean(track.isExplicit),
      previewUrl: release.previewUrl ?? null,
      audioUrl: null,
      audioFormat: null,
      providers: release.providers,
    }));
  }

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
const DEMO_AUDIENCE_BASE_TIME = new Date('2026-04-15T18:00:00.000Z');

function getDeterministicPurchaseCount(index: number): number {
  return index < 10 ? index % 3 : 0;
}

function getDeterministicTipAmountCents(index: number): number {
  return index < 15 ? ((index * 347 + 116) % 2_000) + 100 : 0;
}

function getDeterministicTipCount(index: number): number {
  return index < 15 ? (index % 4) + 1 : 0;
}

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
  const lastSeen = new Date(DEMO_AUDIENCE_BASE_TIME);
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
    purchaseCount: getDeterministicPurchaseCount(index),
    tipAmountTotalCents: getDeterministicTipAmountCents(index),
    tipCount: getDeterministicTipCount(index),
    tags: INTENT_TAGS[intentLevel ?? ''] ?? [],
    deviceType: DEMO_DEVICE_TYPES[index % 3],
    lastSeenAt: lastSeen.toISOString(),
  };
}

export const DEMO_AUDIENCE_MEMBERS: AudienceMember[] = Array.from(
  { length: 12 },
  (_, i) => makeAudienceMember(i)
);
