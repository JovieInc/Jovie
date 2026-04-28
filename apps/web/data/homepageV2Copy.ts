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
    title: 'Jovie | Your AI Artist Manager.',
    description:
      'Plan releases, create assets, pitch playlists, and keep every drop moving from one AI workspace for artists.',
  },
  hero: {
    headline: 'Your AI Artist Manager.',
    subhead:
      'Plan releases, create assets, pitch playlists, and promote every drop from one AI workspace.',
    primaryCtaLabel: 'Start Free',
    secondaryCtaLabel: 'Explore Artist Profiles',
    microproof: 'Start free. 14-day Pro trial. No credit card required.',
  },
  systemOverview: {
    headline: 'What Jovie Handles for You.',
    subhead: 'Plan the release, make the assets, and keep follow-up moving.',
    cards: [
      {
        title: 'Plan the Release.',
        body: 'Keep timing, routing, and launch decisions in one place.',
      },
      {
        title: 'Create the Assets.',
        body: 'Build the art and copy without bouncing between tools.',
      },
      {
        title: 'Keep Momentum Warm.',
        body: 'Stay ready for the next song, show, or ask.',
      },
    ],
  },
  spotlight: {
    headline: 'One Link.\nAlways In Sync.',
    body: 'Release, ticket, and CTA stay aligned without rebuilding the page.',
    ctaLabel: 'Explore Artist Profiles',
    href: APP_ROUTES.ARTIST_PROFILES,
  },
  captureReactivation: {
    headline: 'Build the List Once.\nKeep It Working.',
    body: 'Set up the growth loop once. Jovie keeps each release, ticket, or ask moving after that.',
    captureLabel: 'Build the List',
    captureBody:
      'Turn profile traffic into a durable audience instead of starting from zero every drop.',
    reactivateLabel: 'Always-On Follow-Up',
    reactivateBody:
      'Each release, ticket, or ask reaches the right people without rebuilding the campaign.',
    ctaLabel: 'See Artist Notifications',
    href: APP_ROUTES.ARTIST_NOTIFICATIONS,
  },
  powerGrid: {
    headline: 'What Jovie Keeps in Sync.',
    subhead:
      'Routing, audience signal, and release context stay ready without another pile of tools.',
  },
  socialProof: {
    headline: 'Real artists. Real workflows.',
    body: 'Real release behavior, not generic creator proof.',
  },
  pricing: {
    headline: 'Simple Pricing.',
    body: 'One plan. 14-day free trial.',
    supportLine: '14-day Pro trial. No credit card required.',
    ctaLabel: 'See Pricing',
    href: APP_ROUTES.PRICING,
  },
  finalCta: {
    headline: 'Start With the Next Drop.',
    body: 'Jovie handles the plan, assets, and follow-up from there.',
    primaryCtaLabel: 'Claim My Workspace',
    secondaryCtaLabel: 'See Pricing',
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
        { href: APP_ROUTES.SIGNUP, label: 'Start Free Trial' },
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
