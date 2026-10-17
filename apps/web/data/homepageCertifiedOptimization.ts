import { HOMEPAGE_YOUTUBE_MVP } from './homepageYoutubeMvp';

/**
 * JOV-INV-012 optimization contract for the certified root homepage.
 *
 * Uses the existing analytics, model-experiment, audience-event, YouTube
 * experiment, and release-to-revenue surfaces. Do not add a parallel stack.
 * Search query text is never persisted as an analytics property.
 */

export const HOMEPAGE_CERTIFIED_VARIANT_ID =
  HOMEPAGE_YOUTUBE_MVP.variantIdentity;

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
  contentVariant: 'youtube-artist-loop',
  actionState: 'artist-search',
} as const;

export const HOMEPAGE_CERTIFIED_OPTIMIZATION_CONTRACT = {
  variantIdentity: HOMEPAGE_CERTIFIED_VARIANT_ID,
  exposure: HOMEPAGE_CERTIFIED_EVENTS.EXPOSURE,
  outcome: HOMEPAGE_CERTIFIED_EVENTS.SEARCH_SUBMITTED,
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
    'Regularly uploading YouTube artists understand the thumbnail, release, smart-link, and reachable-fan loop and use the name-search hero, Find me, to continue to /start. Waitlist writes happen only after verified auth.',
  primaryMetric:
    'homepage_certified_search_submitted / homepage_certified_exposed',
  guardrails: [
    'No implied customers or borrowed logos on `/`.',
    'No competing hero CTA: Search your name → Find me hands off to /start. Never replace it with Get started, Request access, or a waitlist-first link.',
    'Scope the homepage to youtube-artist-closed-loop-mvp-v1. Claims stay within youtube-thumbnails, release-launch, smart-links, and public-profile; fan contact requires opt-in.',
    'Do not persist search query text in analytics properties.',
  ],
  privacyAndConsent:
    'Anonymous page analytics only. No sensitive demographic inference. Search queries are not written to analytics events.',
  optimizerOwner: 'Product',
  cadence: 'weekly until a founder promote or rollback decision',
  decisionWriteback:
    'Keep this variant as control. Challengers require a new variantIdentity. Decisions write back on JOV-5885 and this contract.',
  rollbackOrControl:
    'Revert the scoped homepage composition and matching recipe/manifest together. Email capture remains the splash-B /waitlist surface, not `/`.',
} as const;
