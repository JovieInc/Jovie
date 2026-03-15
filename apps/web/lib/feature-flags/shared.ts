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
  SMARTLINK_PRE_SAVE: 'smartlink_pre_save_campaigns',
  IOS_APPLE_MUSIC_PRIORITY: 'feature_ios_apple_music_priority',
  SUBSCRIBE_CTA_EXPERIMENT: 'experiment_subscribe_cta_variant',
  SPOTIFY_OAUTH: 'feature_spotify_oauth',
  STRIPE_CONNECT_ENABLED: 'stripe-connect-enabled',
  SHOW_EXAMPLE_PROFILES_CAROUSEL: 'show_example_profiles_carousel',
  ENABLE_LIGHT_MODE: 'enable_light_mode',
  SHOW_AUDIENCE_CRM_SECTION: 'show_audience_crm_section',
  SHOW_SEE_IT_IN_ACTION: 'show_see_it_in_action',
} as const;

export type FeatureFlagKey =
  (typeof FEATURE_FLAG_KEYS)[keyof typeof FEATURE_FLAG_KEYS];

export type SubscribeCTAVariant = 'two_step' | 'inline';

export interface FeatureFlagsBootstrap {
  gates: Record<string, boolean>;
}

/**
 * Code-level feature flags — toggle here to re-enable when ready.
 * These are not Statsig-backed; they are shipped with the build.
 */
export const FEATURE_FLAGS = {
  /**
   * JOV-1357: Threads in sidebar chat history.
   * Set to true when thread UX is ready for production.
   */
  THREADS_ENABLED: false,

  /**
   * "Replaces Linktree + Linkfire + Mailchimp" section on the marketing homepage.
   * Set to true when copy and design are approved.
   */
  SHOW_REPLACES_SECTION: false,

  /**
   * PWA install banner in the sidebar.
   * Set to true to enable the PWA install prompt for users.
   */
  PWA_INSTALL_BANNER: false,
} as const;
