import { APP_ROUTES } from '@/constants/routes';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

/**
 * Bounded marketing revenue path (JOV-7329).
 *
 * The acceptable-to-sell gate: the smallest set of routes a real prospective
 * artist traverses from discovery → understanding → intended action, derived
 * from current runtime funnel evidence — not page count:
 *
 * - `MARKETING_NAV_LINKS` / `MARKETING_CUSTOMERS_FLYOUT` (Pen canonical header,
 *   2026-09-26): Product, Pricing, Customers → Artists.
 * - `MARKETING_CTA_INTENTS`: every claim CTA routes to `/start` (qualify chat,
 *   JOV-3379); the proof CTA routes to a live profile.
 * - `MARKETING_NAV_UTILITIES`: Log in / Find yourself handoffs.
 * - `/` homepage (`(home)/page.tsx`): the discovery landing.
 *
 * Defects on `core` stops are class 1–2 (block comprehension, trust, task
 * completion, truth, accessibility, or conversion-critical performance) and
 * block the marketing gate. `handoff` stops are owned outside the marketing
 * route group (auth/profile surfaces) but the marketing path must still route
 * to them truthfully. Routes not listed here continue through the
 * full-inventory certification wave (class 3–4) without holding this gate.
 */
export type BoundedPathRole =
  /** Discovery landing: what Jovie is and who it is for. */
  | 'landing'
  /** Understanding: product and audience comprehension pages. */
  | 'understanding'
  /** Offer: pricing/offer handoff. */
  | 'offer'
  /** Handoff: the intended next action; owned outside (marketing) but the
   * bounded path must reach it without a broken or misleading state. */
  | 'handoff';

export interface BoundedRevenuePathStop {
  readonly url: string;
  readonly role: BoundedPathRole;
  /**
   * Route-manifest glob(s) or app-relative page files that must exist for
   * this stop. Resolved relative to `apps/web/app/`.
   */
  readonly pageGlobs: readonly string[];
  /** Funnel evidence binding this stop to the revenue path. */
  readonly evidence: string;
}

export const BOUNDED_MARKETING_REVENUE_PATH: readonly BoundedRevenuePathStop[] =
  [
    {
      url: APP_ROUTES.HOME,
      role: 'landing',
      pageGlobs: ['(home)/page.tsx'],
      evidence:
        'Discovery landing; canonical homepage per route manifest and marketing (home) group.',
    },
    {
      url: APP_ROUTES.PRODUCT,
      role: 'understanding',
      pageGlobs: ['(marketing)/product/page.tsx'],
      evidence:
        'MARKETING_NAV_LINKS header link "Product" (Pen canonical header).',
    },
    {
      url: APP_ROUTES.SOLUTIONS_ARTISTS,
      role: 'understanding',
      pageGlobs: ['(marketing)/solutions/[audience]/page.tsx'],
      evidence:
        'MARKETING_CUSTOMERS_FLYOUT "Artists" — the only audience routed from header navigation.',
    },
    {
      url: APP_ROUTES.PRICING,
      role: 'offer',
      pageGlobs: ['(marketing)/pricing/page.tsx'],
      evidence:
        'MARKETING_NAV_LINKS header link "Pricing"; pricing/offer handoff.',
    },
    {
      url: APP_ROUTES.START,
      role: 'handoff',
      pageGlobs: ['(dynamic)/start/page.tsx'],
      evidence:
        'MARKETING_CTA_INTENTS claimProfile + "Find yourself" utility; every claim enters the /start qualify chat (JOV-3379).',
    },
    {
      url: TIM_WHITE_PROFILE.publicProfilePath,
      role: 'handoff',
      pageGlobs: ['[username]/page.tsx'],
      evidence:
        'MARKETING_CTA_INTENTS seeLiveProfile proof target ("See a live profile").',
    },
    {
      url: APP_ROUTES.SIGNIN,
      role: 'handoff',
      pageGlobs: ['(auth)/signin/page.tsx'],
      evidence: 'MARKETING_NAV_UTILITIES "Log in" utility.',
    },
  ] as const;

const normalizePathname = (href: string): string => {
  const [withoutHash] = href.split('#', 1);
  return (withoutHash ?? href).split('?')[0] ?? '';
};

/** Pathnames on the bounded path (handoff targets included). */
export const BOUNDED_REVENUE_PATH_URLS: ReadonlySet<string> = new Set(
  BOUNDED_MARKETING_REVENUE_PATH.map(stop => stop.url)
);

/** True when `href` resolves to a stop on the bounded revenue path. */
export function isBoundedRevenuePathHref(href: string): boolean {
  return BOUNDED_REVENUE_PATH_URLS.has(normalizePathname(href));
}
