/**
 * Feature flag constants and types.
 * All flags are code-level: toggle the boolean here, deploy, done.
 * Overrides via dev toolbar are stored in localStorage.
 */

export const STATSIG_GATE_KEYS = {
  PROFILE_V2: 'feature_profile_v2',
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

export type StatsigGateKey =
  (typeof STATSIG_GATE_KEYS)[keyof typeof STATSIG_GATE_KEYS];

/**
 * @deprecated Use FEATURE_FLAGS + useCodeFlag for code flags and STATSIG_GATE_KEYS
 * only when interacting with legacy Statsig server evaluation.
 */
export const FEATURE_FLAG_KEYS = STATSIG_GATE_KEYS;

export type SubscribeCTAVariant = 'two_step' | 'inline';

export interface StatsigFeatureFlagsBootstrap {
  gates: Record<string, boolean>;
}

/** @deprecated Compatibility alias. Use StatsigFeatureFlagsBootstrap directly. */
export interface FeatureFlagsBootstrap extends StatsigFeatureFlagsBootstrap {}

/**
 * All feature flags — toggle the boolean, deploy, done.
 * Dev toolbar overrides are stored in localStorage under `__ff_overrides`.
 *
 * Former Statsig gates are marked with their old gate key for reference.
 * Set the boolean to true to enable a feature in production.
 */
export const FEATURE_FLAGS = {
  // ── Former Statsig gates ──────────────────────────────────────────
  /** Profile V2 layout (gate: feature_profile_v2) */
  PROFILE_V2: true,
  /** Handle claiming flow (gate: feature_claim_handle) */
  CLAIM_HANDLE: false,
  /** Hero Spotify claim flow (gate: feature_hero_spotify_claim_flow) */
  HERO_SPOTIFY_CLAIM_FLOW: false,
  /** Direct billing upgrade (gate: billing.upgradeDirect) */
  BILLING_UPGRADE_DIRECT: false,
  /** Two-step subscribe flow (gate: feature_subscribe_two_step) */
  SUBSCRIBE_TWO_STEP: false,
  /** Latest release card on profile (gate: feature_latest_release_card) */
  LATEST_RELEASE_CARD: true,
  /** Smartlink pre-save campaigns (gate: smartlink_pre_save_campaigns) */
  SMARTLINK_PRE_SAVE: false,
  /** iOS Apple Music priority in listen interface (gate: feature_ios_apple_music_priority) */
  IOS_APPLE_MUSIC_PRIORITY: false,
  /** Subscribe CTA experiment — default to two_step (gate: experiment_subscribe_cta_variant) */
  SUBSCRIBE_CTA_EXPERIMENT: false,
  /** Spotify OAuth login (gate: feature_spotify_oauth) */
  SPOTIFY_OAUTH: false,
  /** Stripe Connect payouts (gate: stripe-connect-enabled) */
  STRIPE_CONNECT_ENABLED: false,
  /** Example profiles carousel on homepage (gate: show_example_profiles_carousel) */
  SHOW_EXAMPLE_PROFILES_CAROUSEL: false,
  /** Light mode theme option (gate: enable_light_mode) */
  ENABLE_LIGHT_MODE: false,
  /** Audience CRM section in dashboard (gate: show_audience_crm_section) */
  SHOW_AUDIENCE_CRM_SECTION: false,
  /** "See it in action" section on homepage (gate: show_see_it_in_action) */
  SHOW_SEE_IT_IN_ACTION: false,
  // ── Code-level flags ──────────────────────────────────────────────
  /** JOV-1357: Threads in sidebar chat history */
  THREADS_ENABLED: false,
  /** "Replaces Linktree + Linkfire + Mailchimp" section on marketing homepage */
  SHOW_REPLACES_SECTION: false,
  /** Sticky phone tour on marketing homepage */
  SHOW_PHONE_TOUR: true,
  /** Logo bar ("Trusted by artists on") on marketing homepage */
  SHOW_LOGO_BAR: true,
  /** Feature showcase bento grid on marketing homepage */
  SHOW_FEATURE_SHOWCASE: false,
  /** Final CTA section on marketing homepage */
  SHOW_FINAL_CTA: true,

  /** Homepage sections below the hero (chapters, notify, bento, spec, CTA) */
  SHOW_HOMEPAGE_SECTIONS: false,
  /** Social proof section on staged homepage v2 (`/new`). */
  SHOW_HOMEPAGE_V2_SOCIAL_PROOF: false,

  /** Filter and display toolbar buttons on the releases page. */
  SHOW_RELEASE_TOOLBAR_EXTRAS: false,

  /** Playlist engine: cron generation, public pages, admin queue. */
  PLAYLIST_ENGINE: false,

  /** AI-generated release artwork via chat. */
  ALBUM_ART_GENERATION: true,
} as const;

export type CodeFlagName = keyof typeof FEATURE_FLAGS;

export const FF_OVERRIDES_KEY = '__ff_overrides';

export const CODE_FLAG_KEYS = {
  // Former Statsig gates
  PROFILE_V2: 'code:PROFILE_V2',
  CLAIM_HANDLE: 'code:CLAIM_HANDLE',
  HERO_SPOTIFY_CLAIM_FLOW: 'code:HERO_SPOTIFY_CLAIM_FLOW',
  BILLING_UPGRADE_DIRECT: 'code:BILLING_UPGRADE_DIRECT',
  SUBSCRIBE_TWO_STEP: 'code:SUBSCRIBE_TWO_STEP',
  LATEST_RELEASE_CARD: 'code:LATEST_RELEASE_CARD',
  SMARTLINK_PRE_SAVE: 'code:SMARTLINK_PRE_SAVE',
  IOS_APPLE_MUSIC_PRIORITY: 'code:IOS_APPLE_MUSIC_PRIORITY',
  SUBSCRIBE_CTA_EXPERIMENT: 'code:SUBSCRIBE_CTA_EXPERIMENT',
  SPOTIFY_OAUTH: 'code:SPOTIFY_OAUTH',
  STRIPE_CONNECT_ENABLED: 'code:STRIPE_CONNECT_ENABLED',
  SHOW_EXAMPLE_PROFILES_CAROUSEL: 'code:SHOW_EXAMPLE_PROFILES_CAROUSEL',
  ENABLE_LIGHT_MODE: 'code:ENABLE_LIGHT_MODE',
  SHOW_AUDIENCE_CRM_SECTION: 'code:SHOW_AUDIENCE_CRM_SECTION',
  SHOW_SEE_IT_IN_ACTION: 'code:SHOW_SEE_IT_IN_ACTION',
  // Code flags
  THREADS_ENABLED: 'code:THREADS_ENABLED',
  SHOW_REPLACES_SECTION: 'code:SHOW_REPLACES_SECTION',
  SHOW_PHONE_TOUR: 'code:SHOW_PHONE_TOUR',
  SHOW_LOGO_BAR: 'code:SHOW_LOGO_BAR',
  SHOW_FEATURE_SHOWCASE: 'code:SHOW_FEATURE_SHOWCASE',
  SHOW_FINAL_CTA: 'code:SHOW_FINAL_CTA',
  SHOW_HOMEPAGE_SECTIONS: 'code:SHOW_HOMEPAGE_SECTIONS',
  SHOW_HOMEPAGE_V2_SOCIAL_PROOF: 'code:SHOW_HOMEPAGE_V2_SOCIAL_PROOF',
  SHOW_RELEASE_TOOLBAR_EXTRAS: 'code:SHOW_RELEASE_TOOLBAR_EXTRAS',
  PLAYLIST_ENGINE: 'code:PLAYLIST_ENGINE',
  ALBUM_ART_GENERATION: 'code:ALBUM_ART_GENERATION',
} as const satisfies Record<CodeFlagName, string>;
