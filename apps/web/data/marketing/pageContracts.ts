import { APP_ROUTES } from '@/constants/routes';

export interface MarketingPageContract {
  readonly routeGlob: string;
  readonly url: string;
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
  href: 'https://jov.ie/waitlist',
  label: 'Claim your profile',
} as const;

export const MARKETING_PAGE_CONTRACTS = {
  '(home)/page.tsx': {
    routeGlob: '(home)/page.tsx',
    url: APP_ROUTES.HOME,
    job: 'orient an artist to the highest-value next move',
    proof: 'catalog, audience, and artist-presence workspace preview',
    successEvent: 'visitor starts the onboarding handoff',
    primaryCta: START_CTA,
  },
  '(marketing)/new/page.tsx': {
    routeGlob: '(marketing)/new/page.tsx',
    url: APP_ROUTES.LANDING_NEW,
    job: 'explain the release operating system',
    proof: 'homepage v2 system overview and pricing evidence',
    successEvent: 'visitor starts with a release prompt',
    primaryCta: START_CTA,
  },
  '(marketing)/pricing/page.tsx': {
    routeGlob: '(marketing)/pricing/page.tsx',
    url: APP_ROUTES.PRICING,
    job: 'compare plan value and reduce pricing ambiguity',
    proof: 'entitlement-derived tier cards, comparison, and FAQ',
    successEvent: 'visitor chooses a plan or starts onboarding',
    primaryCta: START_CTA,
  },
  '(marketing)/artist-profiles/page.tsx': {
    routeGlob: '(marketing)/artist-profiles/page.tsx',
    url: APP_ROUTES.ARTIST_PROFILES,
    job: 'show artists how profiles convert attention into owned fans',
    proof: 'profile gallery, capture flow, and conversion sections',
    successEvent: 'artist claims a profile',
    primaryCta: CLAIM_PROFILE_CTA,
  },
  '(marketing)/artist-profile/page.tsx': {
    routeGlob: '(marketing)/artist-profile/page.tsx',
    url: APP_ROUTES.ARTIST_PROFILE_LEGACY,
    job: 'preserve the legacy artist profile landing path',
    proof: 'same profile conversion system as the canonical plural route',
    successEvent: 'artist claims a profile from the alias',
    primaryCta: CLAIM_PROFILE_CTA,
  },
  '(marketing)/artist-notifications/page.tsx': {
    routeGlob: '(marketing)/artist-notifications/page.tsx',
    url: APP_ROUTES.ARTIST_NOTIFICATIONS,
    job: 'explain automatic fan notification value',
    proof: 'capture, opt-in, and reactivation flow evidence',
    successEvent: 'artist starts the notification workflow',
    primaryCta: START_CTA,
  },
  '(marketing)/download/page.tsx': {
    routeGlob: '(marketing)/download/page.tsx',
    url: APP_ROUTES.DOWNLOAD,
    job: 'route visitors to install the app',
    proof: 'platform setup steps and support content',
    successEvent: 'visitor begins the download path',
    primaryCta: START_CTA,
  },
  '(marketing)/pay/page.tsx': {
    routeGlob: '(marketing)/pay/page.tsx',
    url: APP_ROUTES.PAY,
    job: 'explain the artist payment surface',
    proof: 'pay landing capability and money-flow copy',
    successEvent: 'visitor starts the pay setup path',
    primaryCta: START_CTA,
  },
  '(marketing)/voice/page.tsx': {
    routeGlob: '(marketing)/voice/page.tsx',
    url: '/voice',
    job: 'describe the voice feature promise',
    proof: 'feature-grid and split-section capability evidence',
    successEvent: 'visitor starts from the voice surface',
    primaryCta: START_CTA,
  },
  '(marketing)/instant-merch/page.tsx': {
    routeGlob: '(marketing)/instant-merch/page.tsx',
    url: APP_ROUTES.INSTANT_MERCH,
    job: 'show how artists generate merch concepts quickly',
    proof: 'merch concept preview and workflow steps',
    successEvent: 'visitor starts the merch workflow',
    primaryCta: START_CTA,
  },
  '(marketing)/youtube-thumbnails/page.tsx': {
    routeGlob: '(marketing)/youtube-thumbnails/page.tsx',
    url: APP_ROUTES.YOUTUBE_THUMBNAILS,
    job: 'show creators how to package YouTube videos',
    proof: 'paste-channel before/after preview, workflow, and safeguards',
    successEvent: 'visitor pastes a channel and sees three thumbnails',
    primaryCta: START_CTA,
  },
  '(marketing)/launch/page.tsx': {
    routeGlob: '(marketing)/launch/page.tsx',
    url: APP_ROUTES.LAUNCH,
    job: 'explain the release launch system',
    proof: 'release-cycle sections, comparison, and final CTA',
    successEvent: 'visitor starts launch planning',
    primaryCta: START_CTA,
  },
  '(marketing)/product/[[...slug]]/page.tsx': {
    routeGlob: '(marketing)/product/[[...slug]]/page.tsx',
    url: `${APP_ROUTES.PRODUCT}/*`,
    job: 'explain the connected product and its four capability pillars',
    proof:
      'typed capability definitions with explicit live and early-access status',
    successEvent: 'visitor opens a capability or starts onboarding',
    primaryCta: START_CTA,
  },
  '(marketing)/for/[[...slug]]/page.tsx': {
    routeGlob: '(marketing)/for/[[...slug]]/page.tsx',
    url: `${APP_ROUTES.FOR}/*`,
    job: 'orient each audience without overstating product coverage',
    proof: 'typed persona definitions with explicit capability boundaries',
    successEvent: 'visitor opens the relevant proven product path',
    primaryCta: START_CTA,
  },
  '(marketing)/how-it-works/page.tsx': {
    routeGlob: '(marketing)/how-it-works/page.tsx',
    url: APP_ROUTES.HOW_IT_WORKS,
    job: 'explain the connected identity workflow in four steps',
    proof: 'source-bound identity, publishing, and response sequence',
    successEvent: 'visitor starts onboarding',
    primaryCta: START_CTA,
  },
  '(marketing)/tools/page.tsx': {
    routeGlob: '(marketing)/tools/page.tsx',
    url: APP_ROUTES.TOOLS,
    job: 'index acquisition tools that perform a real job before signup',
    proof: 'links to live capability-specific routes',
    successEvent: 'visitor opens a live tool',
    primaryCta: START_CTA,
  },
  '(marketing)/integrations/page.tsx': {
    routeGlob: '(marketing)/integrations/page.tsx',
    url: APP_ROUTES.INTEGRATIONS,
    job: 'state the current integration boundary without invented providers',
    proof: 'capability index and public developer contract',
    successEvent: 'visitor opens the developer guide or starts onboarding',
    primaryCta: START_CTA,
  },
  '(marketing)/about/page.tsx': {
    routeGlob: '(marketing)/about/page.tsx',
    url: APP_ROUTES.ABOUT,
    job: 'state what Jovie is and why it exists',
    proof: 'company story and FAQ context',
    successEvent: 'visitor continues into the product path',
    primaryCta: START_CTA,
  },
  '(marketing)/support/page.tsx': {
    routeGlob: '(marketing)/support/page.tsx',
    url: APP_ROUTES.SUPPORT,
    job: 'help visitors find support and answers',
    proof: 'support channels and FAQ content',
    successEvent: 'visitor resolves a support path',
    primaryCta: START_CTA,
  },
  '(marketing)/cli/page.tsx': {
    routeGlob: '(marketing)/cli/page.tsx',
    url: APP_ROUTES.CLI,
    job: 'explain command-line access to Jovie workflows',
    proof: 'command examples, FAQ, and policy links',
    successEvent: 'developer starts from the CLI surface',
    primaryCta: START_CTA,
  },
  '(marketing)/compare/[slug]/page.tsx': {
    routeGlob: '(marketing)/compare/[slug]/page.tsx',
    url: `${APP_ROUTES.COMPARE}/*`,
    job: 'compare Jovie against a known alternative',
    proof: 'comparison table, FAQ, and fit criteria',
    successEvent: 'visitor chooses whether Jovie fits',
    primaryCta: START_CTA,
  },
  '(marketing)/alternatives/[slug]/page.tsx': {
    routeGlob: '(marketing)/alternatives/[slug]/page.tsx',
    url: `${APP_ROUTES.ALTERNATIVES}/*`,
    job: 'explain an alternative category and Jovie fit',
    proof: 'category prose, feature grid, and FAQ',
    successEvent: 'visitor starts after evaluating alternatives',
    primaryCta: START_CTA,
  },
  '(marketing)/blog/page.tsx': {
    routeGlob: '(marketing)/blog/page.tsx',
    url: APP_ROUTES.BLOG,
    job: 'help visitors browse Jovie essays and updates',
    proof: 'blog feed and editorial categories',
    successEvent: 'visitor opens a relevant article',
    primaryCta: START_CTA,
  },
  '(marketing)/blog/category/[slug]/page.tsx': {
    routeGlob: '(marketing)/blog/category/[slug]/page.tsx',
    url: `${APP_ROUTES.BLOG}/category/*`,
    job: 'help visitors browse a focused editorial category',
    proof: 'category-scoped article feed',
    successEvent: 'visitor opens a relevant category article',
    primaryCta: START_CTA,
  },
  'waitlist/page.tsx': {
    routeGlob: 'waitlist/page.tsx',
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
  return (
    MARKETING_PAGE_CONTRACTS[routeGlob as MarketingPageContractRouteGlob] ??
    null
  );
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
