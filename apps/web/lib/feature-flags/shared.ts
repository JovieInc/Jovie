/**
 * Shared feature flag constants and types.
 * Safe to import from both server and client modules.
 */

export const FEATURE_FLAG_KEYS = {
  CLAIM_HANDLE: 'feature_claim_handle',
  BILLING_UPGRADE_DIRECT: 'billing.upgradeDirect',
  SUBSCRIBE_TWO_STEP: 'feature_subscribe_two_step',
  LATEST_RELEASE_CARD: 'feature_latest_release_card',
  SMARTLINK_PRE_SAVE: 'smartlink_pre_save_campaigns',
} as const;

export type FeatureFlagKey =
  (typeof FEATURE_FLAG_KEYS)[keyof typeof FEATURE_FLAG_KEYS];

export interface FeatureFlagsBootstrap {
  gates: Record<string, boolean>;
}
