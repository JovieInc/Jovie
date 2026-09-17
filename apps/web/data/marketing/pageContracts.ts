import { APP_ROUTES } from '@/constants/routes';
import { PRODUCT_CLAIM_HREF, PRODUCT_COPY } from '@/data/productCopy';

/**
 * Language scope describes the page's subject, never the visitor's
 * identity. Shared pages support unknown and multi-role visitors.
 * Editorial pages scope terminology to each article/comparison. This is
 * not a capability or publishing permission; those remain with the
 * existing offer/publication contracts.
 * See docs/marketing/LANGUAGE.md before adding or changing
 * customer-facing copy.
 */
export type MarketingCopyScope = 'shared' | 'music' | 'video' | 'editorial';

export interface MarketingPageContract {
  readonly routeGlob: string;
  readonly url: string;
  readonly copyScope: MarketingCopyScope;
  readonly job: string;
  readonly proof: string;
  readonly successEvent: string;
  readonly primaryCta: {
    readonly href: string;
    readonly label: string;
  };
}

const START_CTA = {
  href: APP_ROUTES.START,
  label: 'Find yourself',
} as const;

const CLAIM_PROFILE_CTA = {
  href: APP_ROUTES.SIGNUP,
  label: 'Claim your profile',
} as const;

export const MARKETING_PAGE_CONTRACTS = {
  '(home)/page.tsx': {
    routeGlob: '(home)/page.tsx',
    copyScope: 'shared',
    url: APP_ROUTES.HOME,
    job:
      'help visitors understand their public presence and start with their profile',
    proof: 'published profile and relationship examples',
    successEvent: 'visitor starts the onboarding handoff',
    primaryCta: START_CTA,
  },
  '(marketing)/new/page.tsx': {
    routeGlob: '(marketing)/new/page.tsx',
    copyScope: 'music',
    url: APP_ROUTES.LANDING_NEW,
    job: 'explain the release operating system',
    proof: 'homepage v2 system overview and pricing evidence',
    successEvent: 'visitor starts with a release prompt',
    primaryCta: START_CTA,
  },
  '(marketing)/pricing/page.tsx': {
    routeGlob: '(marketing)/pricing/page.tsx',
    copyScope: 'shared',
    url: APP_ROUTES.PRICING,
    job: 'compare plan value and reduce pricing ambiguity',
    proof: 'published plan terms and supported feature comparison',
    successEvent: 'visitor chooses a plan or starts onboarding',
    primaryCta: START_CTA,
  },
  '(marketing)/artist-profiles/page.tsx': {
    routeGlob: '(marketing)/artist-profiles/page.tsx',
    copyScope: 'music',
    url: APP_ROUTES.ARTIST_PROFILES,
    job:
      'show artists how profiles connect music, links, and permissioned fan updates',
    proof: 'profile gallery, capture flow, and conversion sections',
    successEvent: 'artist claims a profile',
    primaryCta: CLAIM_PROFILE_CTA,
  },
  '(marketing)/smart-links/page.tsx': {
    routeGlob: '(marketing)/smart-links/page.tsx',
    url: APP_ROUTES.SMART_LINKS,
    job: 'show artists how one release link remembers a fan streaming choice',
    proof:
      'interactive dial across two real release examples and a live Smart Link',
    successEvent: 'artist starts the Smart Link creation path',
    primaryCta: {
      href: `${APP_ROUTES.SIGNUP}?source=smart-links`,
      label: 'Create a Smart Link',
    },
  },
  '(marketing)/artist-profile/page.tsx': {
    routeGlob: '(marketing)/artist-profile/page.tsx',
    copyScope: 'music',
    url: APP_ROUTES.ARTIST_PROFILE_LEGACY,
    job: 'preserve the legacy artist profile landing path',
    proof: 'same profile conversion system as the canonical plural route',
    successEvent: 'artist claims a profile from the alias',
    primaryCta: CLAIM_PROFILE_CTA,
  },
  '(marketing)/artist-notifications/page.tsx': {
    routeGlob: '(marketing)/artist-notifications/page.tsx',
    copyScope: 'music',
    url: APP_ROUTES.ARTIST_NOTIFICATIONS,
    job: 'explain automatic fan notification value',
    proof: 'capture, opt-in, and reactivation flow evidence',
    successEvent: 'artist starts the notification workflow',
    primaryCta: START_CTA,
  },
  '(marketing)/download/page.tsx': {
    routeGlob: '(marketing)/download/page.tsx',
    copyScope: 'shared',
    url: APP_ROUTES.DOWNLOAD,
    job: 'route visitors to install the app',
    proof: 'platform setup steps and support content',
    successEvent: 'visitor begins the download path',
    primaryCta: START_CTA,
  },
  '(marketing)/pay/page.tsx': {
    routeGlob: '(marketing)/pay/page.tsx',
    copyScope: 'music',
    url: APP_ROUTES.PAY,
    job: 'explain the artist payment surface',
    proof: 'pay landing capability and money-flow copy',
    successEvent: 'visitor starts the pay setup path',
    primaryCta: START_CTA,
  },
  '(marketing)/voice/page.tsx': {
    routeGlob: '(marketing)/voice/page.tsx',
    copyScope: 'shared',
    url: '/voice',
    job: 'describe the voice feature promise',
    proof: 'feature-grid and split-section capability evidence',
    successEvent: 'visitor starts from the voice surface',
    primaryCta: START_CTA,
  },
  '(marketing)/instant-merch/page.tsx': {
    routeGlob: '(marketing)/instant-merch/page.tsx',
    copyScope: 'music',
    url: APP_ROUTES.INSTANT_MERCH,
    job: 'show how artists generate merch concepts quickly',
    proof: 'merch concept preview and workflow steps',
    successEvent: 'visitor starts the merch workflow',
    primaryCta: START_CTA,
  },
  '(marketing)/youtube-thumbnails/page.tsx': {
    routeGlob: '(marketing)/youtube-thumbnails/page.tsx',
    copyScope: 'video',
    url: APP_ROUTES.YOUTUBE_THUMBNAILS,
    job: 'show creators how to package YouTube videos',
    proof: 'paste-channel before/after preview, workflow, and safeguards',
    successEvent: 'visitor pastes a channel and sees three thumbnails',
    primaryCta: START_CTA,
  },
  '(marketing)/product/page.tsx': {
    routeGlob: '(marketing)/product/page.tsx',
    url: APP_ROUTES.PRODUCT,
    job: 'claim the public page that shows up when people search for you',
    proof: 'unclaimed jov.ie/you claim card with inset Claim action',
    successEvent: 'visitor claims the public page from the product hero',
    primaryCta: {
      href: PRODUCT_CLAIM_HREF,
      label: PRODUCT_COPY.claimCard.cta,
    },
  },
  '(marketing)/card/page.tsx': {
    routeGlob: '(marketing)/card/page.tsx',
    url: APP_ROUTES.CARD,
    job: 'explain the planned in-person profile-sharing product and how to get access updates',
    proof:
      'illustrative Wallet-card preview paired with an approved public-profile capture',
    successEvent:
      'visitor persists or confirms a deduplicated Jovie Card interest request',
    primaryCta: {
      href: `${APP_ROUTES.CARD}#join-the-list`,
      label: 'Join the list',
    },
  },
  '(marketing)/launch/page.tsx': {
    routeGlob: '(marketing)/launch/page.tsx',
    copyScope: 'music',
    url: APP_ROUTES.LAUNCH,
    job: 'explain the release launch system',
    proof: 'release-cycle sections, comparison, and final CTA',
    successEvent: 'visitor starts launch planning',
    primaryCta: START_CTA,
  },
  '(marketing)/about/page.tsx': {
    routeGlob: '(marketing)/about/page.tsx',
    copyScope: 'shared',
    url: APP_ROUTES.ABOUT,
    job: 'state what Jovie is and why it exists',
    proof: 'company story and FAQ context',
    successEvent: 'visitor continues into the product path',
    primaryCta: START_CTA,
  },
  '(marketing)/support/page.tsx': {
    routeGlob: '(marketing)/support/page.tsx',
    copyScope: 'shared',
    url: APP_ROUTES.SUPPORT,
    job: 'help visitors find support and answers',
    proof: 'support channels and FAQ content',
    successEvent: 'visitor resolves a support path',
    primaryCta: START_CTA,
  },
  '(marketing)/cli/page.tsx': {
    routeGlob: '(marketing)/cli/page.tsx',
    copyScope: 'music',
    url: APP_ROUTES.CLI,
    job: 'explain read-only command-line access to public artist data',
    proof: 'documented artist GET commands, FAQ, and policy links',
    successEvent:
      'developer reads the CLI installation and public artist command examples',
    primaryCta: START_CTA,
  },
  '(marketing)/compare/[slug]/page.tsx': {
    routeGlob: '(marketing)/compare/[slug]/page.tsx',
    copyScope: 'editorial',
    url: `${APP_ROUTES.COMPARE}/*`,
    job: 'compare Jovie against a known alternative',
    proof: 'comparison table, FAQ, and fit criteria',
    successEvent: 'visitor chooses whether Jovie fits',
    primaryCta: START_CTA,
  },
  '(marketing)/alternatives/[slug]/page.tsx': {
    routeGlob: '(marketing)/alternatives/[slug]/page.tsx',
    copyScope: 'editorial',
    url: `${APP_ROUTES.ALTERNATIVES}/*`,
    job: 'explain an alternative category and Jovie fit',
    proof: 'category prose, feature grid, and FAQ',
    successEvent: 'visitor starts after evaluating alternatives',
    primaryCta: START_CTA,
  },
  '(marketing)/blog/page.tsx': {
    routeGlob: '(marketing)/blog/page.tsx',
    copyScope: 'editorial',
    url: APP_ROUTES.BLOG,
    job: 'help visitors browse Jovie essays and updates',
    proof: 'blog feed and editorial categories',
    successEvent: 'visitor opens a relevant article',
    primaryCta: START_CTA,
  },
  '(marketing)/blog/category/[slug]/page.tsx': {
    routeGlob: '(marketing)/blog/category/[slug]/page.tsx',
    copyScope: 'editorial',
    url: `${APP_ROUTES.BLOG}/category/*`,
    job: 'help visitors browse a focused editorial category',
    proof: 'category-scoped article feed',
    successEvent: 'visitor opens a relevant category article',
    primaryCta: START_CTA,
  },
  'waitlist/page.tsx': {
    routeGlob: 'waitlist/page.tsx',
    copyScope: 'shared',
    url: APP_ROUTES.WAITLIST,
    job: 'collect public waitlist intent without a retired questionnaire',
    proof: 'splash-B waitlist sign-up shell',
    successEvent: 'visitor submits or confirms waitlist intent',
    primaryCta: {
      href: APP_ROUTES.WAITLIST,
      label: 'Join the waitlist',
    },
  },
} as const satisfies Readonly<Record<string, MarketingPageContract>>;

export type MarketingPageContractRouteGlob =
  keyof typeof MARKETING_PAGE_CONTRACTS;

export const MARKETING_PAGE_CONTRACT_ROUTE_GLOBS = Object.keys(
  MARKETING_PAGE_CONTRACTS
) as readonly MarketingPageContractRouteGlob[];

function matchesContractUrl(pattern: string, pathname: string) {
  if (!pattern.endsWith('/*')) {
    return pattern === pathname;
  }

  const prefix = pattern.slice(0, -2);
  return pathname.startsWith(`${prefix}/`) && pathname.length > prefix.length;
}

export function normalizeMarketingPathname(
  pathname: string | null | undefined
): string | null {
  if (!pathname) return null;

  try {
    const parsed = new URL(pathname, 'https://jovie.local');
    const normalized = parsed.pathname.replace(/\/+$/, '');
    return normalized === '' ? APP_ROUTES.HOME : normalized;
  } catch {
    const normalized = pathname.split(/[?#]/u)[0]?.replace(/\/+$/, '') ?? '';
    return normalized === '' ? APP_ROUTES.HOME : normalized;
  }
}

export function getMarketingPageContractForRouteGlob(
  routeGlob: string
): MarketingPageContract | null {
  if (!Object.hasOwn(MARKETING_PAGE_CONTRACTS, routeGlob)) return null;

  return MARKETING_PAGE_CONTRACTS[routeGlob as MarketingPageContractRouteGlob];
}

export function getMarketingPageContractForPathname(
  pathname: string | null | undefined
): MarketingPageContract | null {
  const normalized = normalizeMarketingPathname(pathname);
  if (!normalized) return null;

  return (
    Object.values(MARKETING_PAGE_CONTRACTS).find(contract =>
      matchesContractUrl(contract.url, normalized)
    ) ?? null
  );
}
