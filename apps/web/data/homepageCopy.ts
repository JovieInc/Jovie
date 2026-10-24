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
    profile: {
      scenarioId: 'tim-white-profile-live-mobile',
      alt: "Tim White's Jovie artist profile with his latest release first.",
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

export type HomepageCopy = typeof HOMEPAGE_COPY;
