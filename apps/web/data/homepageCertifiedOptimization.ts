import { FEATURE_FLAGS } from '@/lib/flags/marketing-static';

/**
 * JOV-INV-012 optimization contract for the certified root homepage.
 *
 * Uses the existing analytics, model-experiment, audience-event, YouTube
 * experiment, and release-to-revenue surfaces. Do not add a parallel stack.
 * Search query text is never persisted as an analytics property.
 */

export const HOMEPAGE_CERTIFIED_VARIANT_ID =
  'homepage-certified:control-how-the-world-sees-you:v1' as const;

export const HOMEPAGE_CERTIFIED_EVENTS = {
  EXPOSURE: 'homepage_certified_exposed',
  SEARCH_EXPOSED: 'homepage_certified_search_exposed',
  SEARCH_SUBMITTED: 'homepage_certified_search_submitted',
  ACCESS_EXPOSED: 'homepage_certified_access_exposed',
  ACCESS_REQUESTED: 'homepage_certified_access_requested',
} as const;

export const HOMEPAGE_CERTIFIED_PLACEMENTS = ['hero', 'close'] as const;

export type HomepageCertifiedPlacement =
  (typeof HOMEPAGE_CERTIFIED_PLACEMENTS)[number];

export const HOMEPAGE_CERTIFIED_CONTEXT = {
  variantIdentity: HOMEPAGE_CERTIFIED_VARIANT_ID,
  platform: 'web',
  contentVariant: 'certified-section-1',
  actionState: FEATURE_FLAGS.WAITLIST_ENABLED ? 'waitlist-on' : 'waitlist-off',
} as const;

export const HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT = {
  variantIdentity: HOMEPAGE_CERTIFIED_VARIANT_ID,
  exposure: HOMEPAGE_CERTIFIED_EVENTS.EXPOSURE,
  outcome: FEATURE_FLAGS.WAITLIST_ENABLED
    ? HOMEPAGE_CERTIFIED_EVENTS.ACCESS_REQUESTED
    : HOMEPAGE_CERTIFIED_EVENTS.SEARCH_SUBMITTED,
  attribution: {
    surfaces: [
      'analytics',
      'model-experiments',
      'audience-events',
      'youtube-experiments',
      'release-to-revenue',
    ],
    eventProperties: [
      'variantIdentity',
      'platform',
      'contentVariant',
      'placement',
    ],
  },
  eligibleContextDimensions: [
    'platform',
    'medium-or-channel',
    'country-or-locale',
    'content-variant',
  ],
  hypothesis:
    'A broad company homepage converts qualified visitors through Request access while gated, and a name-search hero when open.',
  primaryMetric: FEATURE_FLAGS.WAITLIST_ENABLED
    ? 'homepage_certified_access_requested / homepage_certified_exposed'
    : 'homepage_certified_search_submitted / homepage_certified_exposed',
  guardrails: [
    'No implied customers or borrowed logos on `/`.',
    'No competing hero CTA: Request access while gated, Search your name → Find me when open.',
    'Broad company-level copy; do not narrow the homepage to one ICP.',
    'Do not persist search query text in analytics properties.',
  ],
  privacyAndConsent:
    'Anonymous page analytics only. No sensitive demographic inference. Search queries are not written to analytics events.',
  optimizerOwner: 'Product',
  cadence: 'weekly until a founder promote or rollback decision',
  decisionWriteback:
    'Keep this variant as control. Challengers require a new variantIdentity. Decisions write back on JOV-5864 and this contract.',
  rollbackOrControl:
    'Revert `apps/web/app/(home)/page.tsx` to MarketingPosterHero. Email capture remains the splash-B /waitlist surface, not `/`.',
} as const;
