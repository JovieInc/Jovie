/**
 * Shared feature flag constants and types.
 * Safe to import from both server and client modules.
 */

export const FEATURE_FLAG_KEYS = {
  CLAIM_HANDLE: 'feature_claim_handle',
  HERO_SPOTIFY_CLAIM_FLOW: 'feature_hero_spotify_claim_flow',
  BILLING_UPGRADE_DIRECT: 'billing.upgradeDirect',
  SUBSCRIBE_TWO_STEP: 'feature_subscribe_two_step',
  LATEST_RELEASE_CARD: 'feature_latest_release_card',
  SUBSCRIBE_CTA_EXPERIMENT: 'experiment_subscribe_cta_variant',
  SPOTIFY_OAUTH: 'feature_spotify_oauth',
} as const;

export type FeatureFlagKey =
  (typeof FEATURE_FLAG_KEYS)[keyof typeof FEATURE_FLAG_KEYS];

export type SubscribeCTAVariant = 'two_step' | 'inline';

export interface FeatureFlagsBootstrap {
  gates: Record<string, boolean>;
}
