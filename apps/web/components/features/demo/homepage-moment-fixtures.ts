import { HOMEPAGE_PROFILE_PREVIEW_CATALOG } from '@/features/home/tim-white-catalog';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import type { AudienceMember } from '@/types/audience';

/**
 * Canary data for the homepage product moments (`DemoHomepageMomentSurface`).
 *
 * Releases are Tim White's real catalog (the only approved person). The
 * subscriber rows are clearly generic: masked addresses, no names, no
 * counts beyond the rows themselves, so the shot carries no vanity metric.
 */

/** Client moments; the email moment is the server-rendered `homepage-email` surface. */
export const HOMEPAGE_MOMENT_IDS = [
  'smart-link',
  'capture',
  'list',
  'catalog',
] as const;
export type HomepageMomentId = (typeof HOMEPAGE_MOMENT_IDS)[number];

function catalogRelease(title: string) {
  const release = HOMEPAGE_PROFILE_PREVIEW_CATALOG.find(
    item => item.title === title
  );
  if (!release) throw new Error(`Unknown Tim White release: ${title}`);
  return release;
}

const TAKE_ME_OVER = catalogRelease('Take Me Over');
const THE_DEEP_END = catalogRelease('The Deep End');

/** The smart link a listener opens. */
export const HOMEPAGE_MOMENT_RELEASE = {
  title: TAKE_ME_OVER.title,
  artworkUrl: TAKE_ME_OVER.artworkUrl,
  slug: 'take-me-over',
} as const;

/** The next release, which the release-day email announces. */
export const HOMEPAGE_MOMENT_NEXT_RELEASE = {
  title: THE_DEEP_END.title,
  artworkUrl: THE_DEEP_END.artworkUrl,
  slug: 'the-deep-end',
} as const;

export const HOMEPAGE_MOMENT_PROVIDERS = [
  {
    key: 'spotify',
    label: 'Spotify',
    accent: '#1DB954',
    url: TIM_WHITE_PROFILE.spotifyUrl,
  },
  {
    key: 'apple_music',
    label: 'Apple Music',
    accent: '#FA243C',
    url: 'https://music.apple.com/us/search?term=Tim%20White%20Take%20Me%20Over',
  },
  {
    key: 'youtube_music',
    label: 'YouTube Music',
    accent: '#FF0000',
    url: 'https://music.youtube.com/search?q=Tim%20White%20Take%20Me%20Over',
  },
] as const;

const SUBSCRIBER_SEEDS = [
  { email: 'm••••@gmail.com', city: 'Los Angeles', country: 'US', hours: 1 },
  { email: 'j••••@icloud.com', city: 'London', country: 'GB', hours: 3 },
  { email: 's••••@outlook.com', city: 'Toronto', country: 'CA', hours: 6 },
  { email: 'a••••@gmail.com', city: 'Berlin', country: 'DE', hours: 9 },
  { email: 'r••••@proton.me', city: 'Melbourne', country: 'AU', hours: 14 },
] as const;

/**
 * Times are relative to render so Last Seen always reads as recent hours
 * (the table formats against the live clock).
 */
const captureNowMs = () => Date.now();
const SMART_LINK_URL = `https://jov.ie/${TIM_WHITE_PROFILE.handle}/${HOMEPAGE_MOMENT_RELEASE.slug}`;

export const HOMEPAGE_MOMENT_SUBSCRIBERS: readonly AudienceMember[] =
  SUBSCRIBER_SEEDS.map((seed, index) => {
    const at = new Date(captureNowMs() - seed.hours * 3_600_000).toISOString();
    return {
      id: `home-moment-subscriber-${index + 1}`,
      type: 'email',
      displayName: seed.email,
      locationLabel: `${seed.city}, ${seed.country}`,
      geoCity: seed.city,
      geoCountry: seed.country,
      visits: 1,
      engagementScore: 50,
      intentLevel: 'high',
      latestActions: [{ label: 'Subscribed', timestamp: at }],
      referrerHistory: [{ url: SMART_LINK_URL, timestamp: at }],
      utmParams: {},
      email: seed.email,
      phone: null,
      emailVisibleToArtist: true,
      spotifyConnected: false,
      purchaseCount: 0,
      tipAmountTotalCents: 0,
      tipCount: 0,
      tags: [],
      deviceType: 'mobile',
      lastSeenAt: at,
      hasActiveAlerts: true,
      activeAlertChannels: ['email'],
      lastAlertConfirmedAt: at,
    } satisfies AudienceMember;
  });
