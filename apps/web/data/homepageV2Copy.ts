import { APP_ROUTES } from '@/constants/routes';
import { ARTIST_NOTIFICATIONS_SPEC_TILES } from '@/data/artistNotificationsFeatures';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import {
  ARTIST_PROFILE_SPEC_TILES,
  type ArtistProfileFeatureTile,
} from '@/data/artistProfileFeatures';

function requireTile<T extends { readonly id: string }>(
  tiles: readonly T[],
  id: string
): T {
  const tile = tiles.find(candidate => candidate.id === id);

  if (!tile) {
    throw new Error(`Missing homepage v2 tile: ${id}`);
  }

  return tile;
}

export interface HomepageV2Copy {
  readonly seo: {
    readonly title: string;
    readonly description: string;
  };
  readonly hero: {
    readonly headline: string;
    readonly subhead: string;
    readonly primaryCtaLabel: string;
    readonly secondaryCtaLabel: string;
    readonly microproof: string;
  };
  readonly systemOverview: {
    readonly headline: string;
    readonly subhead: string;
    readonly cards: readonly {
      readonly title: string;
      readonly body: string;
      readonly ctaLabel?: string;
      readonly href?: string;
      readonly status?: string;
    }[];
  };
  readonly spotlight: {
    readonly headline: string;
    readonly body: string;
    readonly ctaLabel: string;
    readonly href: string;
  };
  readonly captureReactivation: {
    readonly headline: string;
    readonly body: string;
    readonly captureLabel: string;
    readonly captureBody: string;
    readonly reactivateLabel: string;
    readonly reactivateBody: string;
    readonly ctaLabel: string;
    readonly href: string;
  };
  readonly powerGrid: ArtistProfileLandingCopy['specWall'];
  readonly socialProof: {
    readonly headline: string;
    readonly body: string;
  };
  readonly pricing: {
    readonly headline: string;
    readonly body: string;
    readonly supportLine: string;
    readonly ctaLabel: string;
    readonly href: string;
  };
  readonly finalCta: {
    readonly headline: string;
    readonly body: string;
    readonly primaryCtaLabel: string;
    readonly secondaryCtaLabel: string;
  };
  readonly footerColumns: readonly {
    readonly title: string;
    readonly links: readonly {
      readonly href: string;
      readonly label: string;
    }[];
  }[];
}

export const HOMEPAGE_V2_NAV_LINKS = [
  { href: APP_ROUTES.ARTIST_PROFILES, label: 'Artist Profiles' },
  { href: APP_ROUTES.PRICING, label: 'Pricing' },
  { href: APP_ROUTES.SUPPORT, label: 'Support' },
] as const;

export const HOMEPAGE_V2_COPY: HomepageV2Copy = {
  seo: {
    title: 'Jovie | Make Every Release Feel Bigger.',
    description:
      'Artist profiles, smart links, fan capture, and reactivation built as one release system for artists.',
  },
  hero: {
    headline: 'Make every release feel bigger.',
    subhead:
      'Artist profiles, smart links, fan capture, and reactivation built as one quiet system for the fans already paying attention.',
    primaryCtaLabel: 'Get started',
    secondaryCtaLabel: 'Explore artist profiles',
    microproof: 'Start free. 14-day Pro trial. No credit card required.',
  },
  systemOverview: {
    headline: 'One system for the whole release cycle.',
    subhead:
      'Profiles, release surfaces, smart linking, and audience intelligence built to move attention toward action.',
    cards: [
      {
        title: 'Artist Profiles',
        body: 'One adaptive profile for listening, shows, support, capture, and follow-through.',
        ctaLabel: 'See Artist Profiles',
        href: APP_ROUTES.ARTIST_PROFILES,
      },
      {
        title: 'Release Pages',
        body: 'Launch pages for drops, pre-save windows, countdowns, and release-day routing.',
        status: 'Preview',
      },
      {
        title: 'Audience & Growth',
        body: 'Capture who showed up, understand intent, and bring the right fans back automatically.',
        ctaLabel: 'See audience features',
        href: `${APP_ROUTES.ARTIST_PROFILES}#capture-every-fan`,
      },
    ],
  },
  spotlight: {
    headline: 'Artist profiles built to convert.',
    body: 'Every profile is designed to move the next tap toward a stream, a ticket, a follow, or an opt-in.',
    ctaLabel: 'Explore Artist Profiles',
    href: APP_ROUTES.ARTIST_PROFILES,
  },
  captureReactivation: {
    headline: 'Capture every fan. Send them every release automatically.',
    body: 'Turn anonymous taps, QR scans, and support into people you can reach again when the next release or nearby show matters.',
    captureLabel: 'Capture',
    captureBody:
      'Give every visit a clean opt-in path without making the page feel like a form.',
    reactivateLabel: 'Reactivate',
    reactivateBody:
      'Send the right fans back to the right release or ticket page without turning yourself into a campaign manager.',
    ctaLabel: 'See how it works',
    href: `${APP_ROUTES.ARTIST_PROFILES}#capture-every-fan`,
  },
  powerGrid: {
    headline: 'Built for artists, by artists.',
    subhead: "Jovie's built to help artists release faster.",
  },
  socialProof: {
    headline: 'Real artists. Real workflows.',
    body: 'Real release behavior, not generic creator proof.',
  },
  pricing: {
    headline: 'Pricing.',
    body: 'Start free. Upgrade when you want notifications, deeper analytics, and fan reactivation.',
    supportLine: '14-day Pro trial. No credit card required.',
    ctaLabel: 'View pricing',
    href: APP_ROUTES.PRICING,
  },
  finalCta: {
    headline: "Don't lose the next fan.",
    body: 'One system for profiles, releases, audience capture, and return visits.',
    primaryCtaLabel: 'Get started',
    secondaryCtaLabel: 'View pricing',
  },
  footerColumns: [
    {
      title: 'Product',
      links: [
        { href: APP_ROUTES.ARTIST_PROFILES, label: 'Artist Profiles' },
        { href: APP_ROUTES.PRICING, label: 'Pricing' },
      ],
    },
    {
      title: 'Company',
      links: [{ href: APP_ROUTES.SUPPORT, label: 'Support' }],
    },
    {
      title: 'Legal',
      links: [
        { href: APP_ROUTES.LEGAL_PRIVACY, label: 'Privacy' },
        { href: APP_ROUTES.LEGAL_TERMS, label: 'Terms' },
      ],
    },
    {
      title: 'Account',
      links: [
        { href: APP_ROUTES.SIGNIN, label: 'Log in' },
        { href: APP_ROUTES.SIGNUP, label: 'Get started' },
      ],
    },
  ],
};

const ANALYTICS_TILE = requireTile(ARTIST_PROFILE_SPEC_TILES, 'rich-analytics');
const GEO_TILE = requireTile(ARTIST_PROFILE_SPEC_TILES, 'geo-insights');
const SYNC_TILE = requireTile(ARTIST_PROFILE_SPEC_TILES, 'always-in-sync');
const ACTIVATE_TILE = requireTile(
  ARTIST_PROFILE_SPEC_TILES,
  'activate-creators'
);
const CAPTURE_TILE = requireTile(
  ARTIST_NOTIFICATIONS_SPEC_TILES,
  'capture-once'
);
const ROUTING_TILE = requireTile(
  ARTIST_NOTIFICATIONS_SPEC_TILES,
  'one-profile-same-destination'
);

export const HOMEPAGE_V2_POWER_TILES: readonly ArtistProfileFeatureTile[] = [
  {
    ...ANALYTICS_TILE,
    layoutClassName:
      'xl:col-start-1 xl:row-start-1 xl:col-span-4 xl:row-span-2',
  },
  {
    ...GEO_TILE,
    layoutClassName:
      'xl:col-start-5 xl:row-start-1 xl:col-span-4 xl:row-span-2',
  },
  {
    ...CAPTURE_TILE,
    layoutClassName:
      'xl:col-start-9 xl:row-start-1 xl:col-span-4 xl:row-span-1',
  },
  {
    ...SYNC_TILE,
    layoutClassName:
      'xl:col-start-9 xl:row-start-2 xl:col-span-4 xl:row-span-1',
  },
  {
    ...ACTIVATE_TILE,
    layoutClassName:
      'xl:col-start-1 xl:row-start-3 xl:col-span-4 xl:row-span-1',
  },
  {
    ...ROUTING_TILE,
    layoutClassName:
      'xl:col-start-5 xl:row-start-3 xl:col-span-8 xl:row-span-2',
  },
] as const;
