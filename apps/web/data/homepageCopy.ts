import { APP_ROUTES } from '@/constants/routes';
import { MARKETING_CTA_INTENTS } from '@/data/marketingCtaIntents';

/**
 * Homepage copy. The visible headline is locked to the company identity
 * line (Tim, 2026-10-22). The rest of the page still sells the artist
 * profile and its offer (EVENT 2026-10-20). Every visible line is either written here against
 * a shipped capability or reused from a claim-backed source:
 *
 * - This module stays light because the proxy imports it for the
 *   homepage markdown projection.
 * - Shot ids name registry product shots (lib/screenshots/product-shots.ts);
 *   no raw image paths.
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
    // The loop in one line (Tim, 2026-11-01): the smart link, the capture,
    // the email on the next release. Builds from Spotify: entitlement
    // `Auto-sync from Spotify`; release emails: `Release notifications`.
    subhead:
      'Smart links that turn listeners into subscribers. Jovie builds them from your Spotify name and emails your list when the next song is out.',
    claim: {
      domain: 'jov.ie/',
      placeholder: 'you',
      action: 'Claim',
    },
    // Truthful under either waitlist state (shared CTA intent registry).
    supportNote: MARKETING_CTA_INTENTS.claimProfile.support,
    // Registry shot (lib/screenshots/product-shots.ts): the link from the
    // handle down to the featured release. No face on `/` (Tim, 2026-10-26).
    proofShot: 'home-profile-release',
  },
  loop: {
    headline: 'Every listen can turn into a subscriber.',
    steps: [
      {
        id: 'open',
        title: 'The link opens their app',
        body: 'One tap to Spotify, Apple Music, or YouTube Music. No menu of links to scan.',
        shot: 'home-smart-link',
      },
      {
        id: 'ask',
        title: 'They ask for the next one',
        body: 'Get Updates takes an email in one step, on every plan.',
        shot: 'home-capture',
      },
      {
        id: 'send',
        title: 'Jovie writes on release day',
        body: 'When the next song is out, everyone who asked gets it in their inbox.',
        shot: 'home-release-email',
      },
    ],
  },
  ownership: {
    headline: 'The list is yours.',
    body: 'Every email lands on your own list in Jovie, not a platform you rent, ready for the next release.',
    shot: 'home-subscriber-list',
    phoneShot: 'home-subscriber-list-phone',
  },
  offer: {
    headline: 'Collect for free. Send when you are ready.',
    plan: 'free',
    includedLabel: 'Included free',
    // `entitlement` names the PRICING_COMPARISON row (lib/entitlements/
    // registry.ts) that proves the plan includes it.
    included: [
      {
        label: 'Your link at jov.ie/you',
        entitlement: 'Public Jovie profile page',
      },
      {
        label: 'Built from your Spotify name',
        entitlement: 'Auto-sync from Spotify',
      },
      {
        label: 'A smart link for every release',
        entitlement: 'Release pages with listen links per DSP',
      },
      {
        label: 'Unlimited email capture',
        entitlement: 'Audience email capture',
      },
    ],
    paid: {
      plan: 'pro',
      includedLabel: 'Everything free, plus',
      included: [
        {
          label: 'Release day emails to your list',
          entitlement: 'Release notifications (email to your audience)',
        },
        { label: 'Export your list', entitlement: 'Contact export' },
        {
          label: 'Advanced analytics',
          entitlement: 'Advanced analytics & geographic insights',
        },
        { label: 'Verified badge', entitlement: 'Verified badge' },
      ],
    },
    plansLink: { label: 'Compare plans', href: APP_ROUTES.PRICING },
  },
  close: {
    headline: 'Start from your Spotify name.',
    subhead:
      'Claim your name and search for yourself. Jovie imports your releases, old and new, and gives every one a smart link.',
    shot: 'home-catalog',
    phoneShot: 'home-catalog-phone',
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
  readonly loop: CopyText<HomepageCopySource['loop']>;
  readonly ownership: CopyText<HomepageCopySource['ownership']>;
  readonly offer: Omit<CopyText<HomepageCopySource['offer']>, 'plan'> & {
    readonly plan: HomepageCopySource['offer']['plan'];
  };
  readonly close: CopyText<HomepageCopySource['close']>;
}
