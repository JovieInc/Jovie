export const LEGACY_STATSIG_GATE_KEYS = {
  BILLING_UPGRADE_DIRECT: 'billing.upgradeDirect',
  SMARTLINK_PRE_SAVE: 'smartlink_pre_save_campaigns',
  IOS_APPLE_MUSIC_PRIORITY: 'feature_ios_apple_music_priority',
  SUBSCRIBE_CTA_EXPERIMENT: 'experiment_subscribe_cta_variant',
  PROFILE_ALERT_OPTIN_EXPERIMENT: 'profile_alert_optin_cta_variant',
  SPOTIFY_OAUTH: 'feature_spotify_oauth',
  STRIPE_CONNECT_ENABLED: 'stripe-connect-enabled',
  SHOW_EXAMPLE_PROFILES_CAROUSEL: 'show_example_profiles_carousel',
  SHOW_SEE_IT_IN_ACTION: 'show_see_it_in_action',
  DESIGN_V1: 'design_v1',
  SHELL_CHAT_V1: 'feature_shell_chat_v1',
  DESIGN_V1_RELEASES: 'design_v1_releases',
  DESIGN_V1_TASKS: 'design_v1_tasks',
  DESIGN_V1_CHAT_ENTITIES: 'design_v1_chat_entities',
  DESIGN_V1_LYRICS: 'design_v1_lyrics',
  DESIGN_V1_LIBRARY: 'design_v1_library',
  DESIGN_V1_AUTH: 'design_v1_auth',
  DESIGN_V1_ONBOARDING: 'design_v1_onboarding',
  CHAT_JANK_MONITOR: 'chat_jank_monitor',
  AI_CONNECTORS_BETA: 'ai_connectors_beta',
} as const;

export type StatsigGateKey =
  (typeof LEGACY_STATSIG_GATE_KEYS)[keyof typeof LEGACY_STATSIG_GATE_KEYS];

export type SubscribeCTAVariant = 'two_step' | 'inline';
export type ProfileAlertOptInVariant = 'button' | 'toggle';
export interface StatsigFeatureFlagsBootstrap {
  gates: Record<string, boolean>;
}

export const APP_FLAG_DEFAULTS = {
  BILLING_UPGRADE_DIRECT: false,
  SMARTLINK_PRE_SAVE: false,
  IOS_APPLE_MUSIC_PRIORITY: false,
  SPOTIFY_OAUTH: false,
  STRIPE_CONNECT_ENABLED: false,
  PLAYLIST_ENGINE: false,
  ALBUM_ART_GENERATION: true,
  CHAT_JANK_MONITOR: false,
  RELEASE_PLAN_DEMO: false,
  AI_CONNECTORS_BETA: false,
  // DESIGN_V1 and all its surface aliases are permanently enabled.
  // Statsig gate "design_v1" is also set to 100% rollout.
  // The true default here ensures the new design is on even if Statsig is
  // unavailable or the gate evaluation falls through.
  DESIGN_V1: true,
  SHELL_CHAT_V1: true,
  DESIGN_V1_RELEASES: true,
  DESIGN_V1_TASKS: true,
  DESIGN_V1_CHAT_ENTITIES: true,
  DESIGN_V1_LYRICS: true,
  DESIGN_V1_LIBRARY: true,
  DESIGN_V1_AUTH: true,
  DESIGN_V1_ONBOARDING: true,
} as const;

export type AppFlagName = keyof typeof APP_FLAG_DEFAULTS;
export type AppFlagSnapshot = Record<AppFlagName, boolean>;

export const APP_FLAG_KEYS = {
  BILLING_UPGRADE_DIRECT: LEGACY_STATSIG_GATE_KEYS.BILLING_UPGRADE_DIRECT,
  SMARTLINK_PRE_SAVE: LEGACY_STATSIG_GATE_KEYS.SMARTLINK_PRE_SAVE,
  IOS_APPLE_MUSIC_PRIORITY: LEGACY_STATSIG_GATE_KEYS.IOS_APPLE_MUSIC_PRIORITY,
  SPOTIFY_OAUTH: LEGACY_STATSIG_GATE_KEYS.SPOTIFY_OAUTH,
  STRIPE_CONNECT_ENABLED: LEGACY_STATSIG_GATE_KEYS.STRIPE_CONNECT_ENABLED,
  PLAYLIST_ENGINE: 'playlist_engine',
  ALBUM_ART_GENERATION: 'album_art_generation',
  CHAT_JANK_MONITOR: 'chat_jank_monitor',
  RELEASE_PLAN_DEMO: 'release_plan_demo',
  AI_CONNECTORS_BETA: 'ai_connectors_beta',
  DESIGN_V1: 'design_v1',
  SHELL_CHAT_V1: LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
  DESIGN_V1_RELEASES: LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
  DESIGN_V1_TASKS: LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
  DESIGN_V1_CHAT_ENTITIES: LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
  DESIGN_V1_LYRICS: LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
  DESIGN_V1_LIBRARY: LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
  DESIGN_V1_AUTH: LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
  DESIGN_V1_ONBOARDING: LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
} as const satisfies Record<AppFlagName, string>;

export const APP_FLAG_OVERRIDE_KEYS = {
  BILLING_UPGRADE_DIRECT: 'code:BILLING_UPGRADE_DIRECT',
  SMARTLINK_PRE_SAVE: 'code:SMARTLINK_PRE_SAVE',
  IOS_APPLE_MUSIC_PRIORITY: 'code:IOS_APPLE_MUSIC_PRIORITY',
  SPOTIFY_OAUTH: 'code:SPOTIFY_OAUTH',
  STRIPE_CONNECT_ENABLED: 'code:STRIPE_CONNECT_ENABLED',
  PLAYLIST_ENGINE: 'code:PLAYLIST_ENGINE',
  ALBUM_ART_GENERATION: 'code:ALBUM_ART_GENERATION',
  CHAT_JANK_MONITOR: 'code:CHAT_JANK_MONITOR',
  RELEASE_PLAN_DEMO: 'code:RELEASE_PLAN_DEMO',
  AI_CONNECTORS_BETA: 'code:AI_CONNECTORS_BETA',
  DESIGN_V1: 'code:DESIGN_V1',
  SHELL_CHAT_V1: 'code:DESIGN_V1',
  DESIGN_V1_RELEASES: 'code:DESIGN_V1',
  DESIGN_V1_TASKS: 'code:DESIGN_V1',
  DESIGN_V1_CHAT_ENTITIES: 'code:DESIGN_V1',
  DESIGN_V1_LYRICS: 'code:DESIGN_V1',
  DESIGN_V1_LIBRARY: 'code:DESIGN_V1',
  DESIGN_V1_AUTH: 'code:DESIGN_V1',
  DESIGN_V1_ONBOARDING: 'code:DESIGN_V1',
} as const satisfies Record<AppFlagName, string>;

export const APP_FLAG_TO_STATSIG_GATE = {
  BILLING_UPGRADE_DIRECT: LEGACY_STATSIG_GATE_KEYS.BILLING_UPGRADE_DIRECT,
  SMARTLINK_PRE_SAVE: LEGACY_STATSIG_GATE_KEYS.SMARTLINK_PRE_SAVE,
  IOS_APPLE_MUSIC_PRIORITY: LEGACY_STATSIG_GATE_KEYS.IOS_APPLE_MUSIC_PRIORITY,
  SPOTIFY_OAUTH: LEGACY_STATSIG_GATE_KEYS.SPOTIFY_OAUTH,
  STRIPE_CONNECT_ENABLED: LEGACY_STATSIG_GATE_KEYS.STRIPE_CONNECT_ENABLED,
  CHAT_JANK_MONITOR: LEGACY_STATSIG_GATE_KEYS.CHAT_JANK_MONITOR,
  AI_CONNECTORS_BETA: LEGACY_STATSIG_GATE_KEYS.AI_CONNECTORS_BETA,
} as const satisfies Partial<Record<AppFlagName, StatsigGateKey>>;

export type StatsigBackedAppFlagName = keyof typeof APP_FLAG_TO_STATSIG_GATE;

export const APP_FLAG_DESCRIPTIONS = {
  BILLING_UPGRADE_DIRECT: 'Direct billing upgrade (skip pricing page)',
  SMARTLINK_PRE_SAVE: 'Spotify pre-save campaigns',
  IOS_APPLE_MUSIC_PRIORITY: 'Prefer Apple Music on iOS',
  SPOTIFY_OAUTH: 'Spotify OAuth login',
  STRIPE_CONNECT_ENABLED: 'Stripe Connect payouts',
  PLAYLIST_ENGINE: 'Playlist engine surfaces',
  ALBUM_ART_GENERATION: 'AI-generated release artwork via chat',
  CHAT_JANK_MONITOR:
    'Chat jank instrumentation (message continuity + streaming)',
  RELEASE_PLAN_DEMO: 'Release plan demo page (YC wedge)',
  AI_CONNECTORS_BETA:
    'AI Connectors v1 beta (Gmail booking extraction → calendar)',
  DESIGN_V1: 'New production design',
  SHELL_CHAT_V1: 'New production design alias for shell and chat',
  DESIGN_V1_RELEASES: 'New production design alias for releases',
  DESIGN_V1_TASKS: 'New production design alias for tasks',
  DESIGN_V1_CHAT_ENTITIES: 'New production design alias for chat entities',
  DESIGN_V1_LYRICS: 'New production design alias for lyrics',
  DESIGN_V1_LIBRARY: 'New production design alias for library',
  DESIGN_V1_AUTH: 'New production design alias for auth',
  DESIGN_V1_ONBOARDING: 'New production design alias for onboarding',
} as const satisfies Record<AppFlagName, string>;

export const DESIGN_V1_ALIAS_FLAGS = [
  'SHELL_CHAT_V1',
  'DESIGN_V1_RELEASES',
  'DESIGN_V1_TASKS',
  'DESIGN_V1_CHAT_ENTITIES',
  'DESIGN_V1_LYRICS',
  'DESIGN_V1_LIBRARY',
  'DESIGN_V1_AUTH',
  'DESIGN_V1_ONBOARDING',
] as const satisfies readonly AppFlagName[];

export type DesignV1AliasFlagName = (typeof DESIGN_V1_ALIAS_FLAGS)[number];

/**
 * Flags that live in APP_FLAG_DEFAULTS but intentionally have NO Statsig gate mapping.
 * These are resolved entirely by the local default — there is no dashboard control.
 *
 * EVERY entry here must have an inline comment explaining why it is exempted.
 * This set is the baseline frozen after PR #8271. Any new flag added to APP_FLAG_DEFAULTS
 * without a corresponding APP_FLAG_TO_STATSIG_GATE entry MUST be added here with a
 * justification, or the flag-registration-guardrail test will fail.
 */
export const LOCAL_DEFAULT_ONLY_FLAGS = new Set<AppFlagName>([
  'PLAYLIST_ENGINE', // early prototype; not ready for remote control
  'ALBUM_ART_GENERATION', // default-true feature; controlled by Statsig experiment separately in usage, not a gate
  'RELEASE_PLAN_DEMO', // YC wedge demo page; on by default in dev/preview, off in production — see registry.ts for env-aware decide()
  'DESIGN_V1', // permanently enabled — new design is the only design
  'SHELL_CHAT_V1', // alias of DESIGN_V1 — permanently enabled
  'DESIGN_V1_RELEASES', // alias of DESIGN_V1 — permanently enabled
  'DESIGN_V1_TASKS', // alias of DESIGN_V1 — permanently enabled
  'DESIGN_V1_CHAT_ENTITIES', // alias of DESIGN_V1 — permanently enabled
  'DESIGN_V1_LYRICS', // alias of DESIGN_V1 — permanently enabled
  'DESIGN_V1_LIBRARY', // alias of DESIGN_V1 — permanently enabled
  'DESIGN_V1_AUTH', // alias of DESIGN_V1 — permanently enabled
  'DESIGN_V1_ONBOARDING', // alias of DESIGN_V1 — permanently enabled
]);
