import { APP_ROUTES } from '@/constants/routes';
import { ARTIST_NOTIFICATIONS_SPEC_TILES } from '@/data/artistNotificationsFeatures';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import {
  ARTIST_PROFILE_SPEC_TILES,
  type ArtistProfileFeatureTile,
} from '@/data/artistProfileFeatures';
import { PRO_TRIAL_DURATION_DAYS } from '@/lib/billing/offer-truth';
import { ARTIST_VISIBILITY_OFFER } from '@/lib/config/plan-prices';
import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

// Footer CTA label tracks the prelaunch waitlist gate. Mirrors the hero
// front-door pattern: "Request access" while we're waitlisting, then
// "Start free trial" once the doors open.
const FOOTER_CTA_LABEL = FEATURE_FLAGS.WAITLIST_ENABLED
  ? 'Get started'
  : 'Start free trial';
const PAID_OFFER_NAME = ARTIST_VISIBILITY_OFFER.pro.displayName;

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
    title: 'Jovie | Your AI Presence Manager.',
    description:
      'Plan launches, create assets, draft pitches, and keep every update moving from one AI workspace for your work.',
  },
  hero: {
    headline: 'Your AI Presence Manager.',
    subhead:
      'Plan launches, create assets, draft pitches, and promote every update from one AI workspace.',
    primaryCtaLabel: 'Start Free',
    secondaryCtaLabel: 'Explore Artist Profiles',
    microproof: `Start free. ${PRO_TRIAL_DURATION_DAYS}-day ${PAID_OFFER_NAME} trial. No credit card required.`,
  },
  systemOverview: {
    headline: 'What Jovie Handles for You.',
    subhead: 'Plan the launch, make the assets, and keep follow-up moving.',
    cards: [
      {
        title: 'Plan the Launch.',
        body: 'Keep timing, routing, and launch decisions in one place.',
      },
      {
        title: 'Create the Assets.',
        body: 'Build the art and copy without bouncing between tools.',
      },
      {
        title: 'Keep Momentum Warm.',
        body: 'Stay ready for the next update, event, or ask.',
      },
    ],
  },
  spotlight: {
    headline: 'One Link.\nAlways In Sync.',
    body: 'Update, ticket, and CTA stay aligned without rebuilding the page.',
    ctaLabel: 'Explore Artist Profiles',
    href: APP_ROUTES.ARTIST_PROFILES,
  },
  captureReactivation: {
    headline: 'Build the List Once.\nKeep It Working.',
    body: 'Set up the growth loop once. Jovie keeps each update, ticket, or ask moving after that.',
    captureLabel: 'Build the List',
    captureBody:
      'Turn profile traffic into a durable audience instead of starting from zero every time.',
    reactivateLabel: 'Always-On Follow-Up',
    reactivateBody:
      'Each update, ticket, or ask reaches the right people without rebuilding the campaign.',
    ctaLabel: 'See Artist Notifications',
    href: APP_ROUTES.ARTIST_NOTIFICATIONS,
  },
  powerGrid: {
    headline: 'What Jovie Keeps in Sync.',
    subhead:
      'Routing, audience signal, and profile context stay ready without another pile of tools.',
  },
  socialProof: {
    headline: 'Real people. Real workflows.',
    body: 'Real usage patterns, not generic creator proof.',
  },
  pricing: {
    headline: 'Free to start.',
    body: `Jovie profiles are free forever. ${PAID_OFFER_NAME} has limited access.`,
    supportLine: 'Profiles stay free. Paid plans open from the waitlist.',
    ctaLabel: 'See Pricing',
    href: APP_ROUTES.PRICING,
  },
  finalCta: {
    headline: 'Keep your work moving.',
    body: 'Jovie handles the plan, assets, and follow-up from there.',
    primaryCtaLabel: FOOTER_CTA_LABEL,
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
