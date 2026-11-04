import { APP_ROUTES } from '@/constants/routes';

/** Approved general homepage brief (2026-11-02). Visible claims describe
 * public discovery, profile links, and permissioned relationships only.
 * Product evidence uses the existing screenshot registry, never invented UI.
 * Legacy offer data remains for the existing isolated offer story; the root
 * recipe does not mount a pricing section while public signup is closed.
 */

export const HOMEPAGE_COPY = {
  seo: {
    // General enough for the company-identity invariant: no artist-only
    // definition in metadata. The description stays on COMPANY_IDENTITY.
    title: 'Jovie | Control how the world sees you.',
  },
  hero: {
    headline: 'Control how the world sees you.',
    subhead: 'Find what the internet knows. Turn it into relationships.',
    claim: {
      domain: 'jov.ie/',
      placeholder: 'you',
      action: 'Join the waitlist',
    },
    supportNote: 'Public signup is closed. Join the waitlist for an invite.',
    // Retained for the standalone legacy canvas stories. The root uses the
    // generic identity crop in section two instead of this release example.
    proofShot: 'home-profile-release',
  },
  loop: {
    headline: 'jov.ie/you',
    body: 'One place for your public profile, the links that matter, and a way for people to keep in touch.',
    profileScenario: 'template-profile-live-mobile',
    profileAlt:
      'Jovie profile preview with Your Name, jov.ie/you, social links, and Get Updates',
  },
  ownership: {
    headline: 'Your relationships, in reach.',
    body: 'When someone asks to hear from you, their email lands in your own list in Jovie.',
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
  access: {
    label: 'Join the waitlist',
    href: '#waitlist',
    invite: 'Have an invite? Sign in',
    inviteHref: '/signin',
  },
  close: {
    headline: 'Make your presence your own.',
    subhead:
      'Tell us who you are and how you plan to use Jovie. We’ll email you when your invite is ready.',
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
  readonly access: CopyText<HomepageCopySource['access']>;
  readonly close: CopyText<HomepageCopySource['close']>;
}
