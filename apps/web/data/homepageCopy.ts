import { APP_ROUTES } from '@/constants/routes';
import { MARKETING_CTA_INTENTS } from '@/data/marketingCtaIntents';

/**
 * Homepage copy. The visible headline is locked to the company identity
 * line (Tim, 2026-10-22). The rest of the page still sells the artist
 * profile and its offer (EVENT 2026-10-20). Every visible line is either written here against
 * a shipped capability or reused from a claim-backed source:
 *
 * - Fan-state lines live in `homepageFanStatesCopy.ts` and reuse
 *   `ARTIST_PROFILE_COPY`. This module stays light because the proxy imports
 *   it for the homepage markdown projection.
 * - Price, badge, and plan note come from `offer-truth` only. Never type a
 *   price, plan name, or trial length into this file; add the offer to
 *   `lib/billing/offer-truth.ts` and read it here (JOV-8368 owns the paid
 *   artist-profile pilot).
 * - Free inclusions name `free: true` rows of the entitlement registry.
 *
 * The SEO description and structured data stay on `COMPANY_IDENTITY`
 * (general identity invariant). The title mirrors the visible headline.
 */

export const HOMEPAGE_COPY = {
  seo: {
    // General enough for the company-identity invariant: no artist-only
    // definition in metadata. The description stays on COMPANY_IDENTITY.
    title: 'Jovie | Be found. Be understood.',
  },
  hero: {
    headline: 'Be found. Be understood.',
    subhead:
      'A free profile for your music, bio, and links. Your latest release leads, with tour dates and updates one tap away.',
    claim: {
      domain: 'jov.ie/',
      placeholder: 'you',
      action: 'Claim',
    },
    // Truthful under either waitlist state (shared CTA intent registry).
    supportNote: MARKETING_CTA_INTENTS.claimProfile.support,
    // Template capture: jov.ie/you with a monogram avatar and abstract
    // release art. No real person on `/` (Tim, 2026-10-26).
    profile: {
      scenarioId: 'template-profile-live-mobile',
      alt: 'A Jovie profile at jov.ie/you with its latest release first.',
    },
  },
  offer: {
    headline: 'Free to claim. Yours to share.',
    plan: 'free',
    includedLabel: 'Included free',
    // `entitlement` names the PRICING_COMPARISON row (lib/entitlements/
    // registry.ts) that proves the free plan includes it.
    included: [
      {
        label: 'Public artist profile at jov.ie/you',
        entitlement: 'Public Jovie profile page',
      },
      {
        label: 'Artist bio and social links',
        entitlement: 'Artist bio & social links',
      },
      {
        label: 'Release pages with listen links for every service',
        entitlement: 'Release pages with listen links per DSP',
      },
      { label: 'Unlimited smart links', entitlement: 'Unlimited smart links' },
      {
        label: 'Tour dates from Bandsintown',
        entitlement: 'Tour dates (Bandsintown)',
      },
    ],
    plansLink: { label: 'Compare plans', href: APP_ROUTES.PRICING },
  },
  close: {
    subhead:
      'Claim your name, review the details, and share one link everywhere.',
  },
} as const;

/**
 * Copy slots widen to `string` so a published page spec
 * (`lib/content-records/marketing-page.ts`) can fill them. The offer plan id
 * keeps its literal type: plans and prices come from offer truth only.
 */
type CopyText<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly CopyText<U>[]
    : T extends object
      ? { readonly [K in keyof T]: CopyText<T[K]> }
      : T;

type HomepageCopySource = typeof HOMEPAGE_COPY;

export interface HomepageCopy {
  readonly seo: CopyText<HomepageCopySource['seo']>;
  readonly hero: CopyText<HomepageCopySource['hero']>;
  readonly offer: Omit<CopyText<HomepageCopySource['offer']>, 'plan'> & {
    readonly plan: HomepageCopySource['offer']['plan'];
  };
  readonly close: CopyText<HomepageCopySource['close']>;
}
