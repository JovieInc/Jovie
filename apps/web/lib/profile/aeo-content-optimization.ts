/**
 * JOV-INV-012 optimization contract for retrieval-ready public-profile AEO.
 *
 * Canonical identity, release, credit, and event facts are identity-gated.
 * This contract uses existing analytics, audience-event, YouTube-experiment,
 * model-experiment, and release-to-revenue surfaces. Do not add a parallel
 * stack or optimize for token volume, FAQ quotas, or keyword repetition.
 */

export const PROFILE_AEO_VARIANT_ID =
  'public-profile.retrieval-ready-aeo:v1' as const;

export const PROFILE_AEO_OPTIMIZATION_CONTRACT = {
  kind: 'product',
  variantIdentity: PROFILE_AEO_VARIANT_ID,
  exposure:
    'Public profile page load tracked as analytics profile_view via ProfileViewTracker, with audience-event source links when a fan arrives from a smart-link or campaign.',
  outcome:
    'Artist-business outcome is attributed listen conversions and release-to-revenue GMV from the same public-profile exposure. Retrieval completeness is a gated identity-correctness constraint, not a promotion lever.',
  attribution:
    'profile_view and listen_clicks in the canonical analytics metrics layer, audience-event source links, YouTube-experiment promotions when a profile listen target is a connected video, model-experiment promotions only for reversible presentation copy, and release-to-revenue GMV keyed by release id.',
  contextDimensions: [
    'platform',
    'medium-or-channel',
    'country-or-locale',
    'genre-or-cohort',
    'artist-plus-career-era-or-lifecycle',
    'content-variant',
  ],
  hypothesis:
    'Semantically complete, independently extractable identity/release/credit/event passages increase qualified discovery that converts to attributed listens and GMV, without stuffing or repeating tokens for rank.',
  primaryMetric:
    'artist-business-outcome: release-to-revenue GMV and attributed listen conversions per public-profile exposure from the canonical analytics metrics layer.',
  guardrails: [
    'complaint',
    'trust',
    'brand',
    'identity permanence: do not auto-promote canonical fact copy',
    'no token-count, FAQ-quota, keyword-repetition, or doorway-page ranking heuristics',
  ],
  privacy:
    'Anonymous public-page analytics and first-party consented profile data only. No sensitive demographic inference and no cross-platform identity stitching.',
  optimizerOwner: 'Profile AEO / SEO (JOV-6244)',
  cadence:
    'Weekly review of the SEO/AEO ratchet plus release-to-revenue GMV. Auto-promote only bounded reversible presentation variants. Identity, legal, and external-publication fact changes stay gated.',
  decisionWriteback:
    'Presentation winners write model-experiment promotions and YouTube-experiment locked metrics. Canonical fact changes write back only through the artist profile source of truth; they never become an experiment arm.',
  rollback:
    'Revert lib/profile/aeo-content.ts and app/[username]/page.tsx AEO wiring to the previous control. Do not roll back canonical artist facts from an experiment decision.',
} as const;
