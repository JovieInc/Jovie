export const LEGACY_STATSIG_GATE_KEYS = {
  BILLING_UPGRADE_DIRECT: 'billing.upgradeDirect',
  SMARTLINK_PRE_SAVE: 'smartlink_pre_save_campaigns',
  IOS_APPLE_MUSIC_PRIORITY: 'feature_ios_apple_music_priority',
  SUBSCRIBE_CTA_EXPERIMENT: 'experiment_subscribe_cta_variant',
  SPOTIFY_OAUTH: 'feature_spotify_oauth',
  STRIPE_CONNECT_ENABLED: 'stripe-connect-enabled',
  SHOW_EXAMPLE_PROFILES_CAROUSEL: 'show_example_profiles_carousel',
  ENABLE_LIGHT_MODE: 'enable_light_mode',
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
} as const;

export type StatsigGateKey =
  (typeof LEGACY_STATSIG_GATE_KEYS)[keyof typeof LEGACY_STATSIG_GATE_KEYS];

export type SubscribeCTAVariant = 'two_step' | 'inline';
export interface StatsigFeatureFlagsBootstrap {
  gates: Record<string, boolean>;
}

export const APP_FLAG_DEFAULTS = {
  BILLING_UPGRADE_DIRECT: false,
  SMARTLINK_PRE_SAVE: false,
  IOS_APPLE_MUSIC_PRIORITY: false,
  SPOTIFY_OAUTH: false,
  STRIPE_CONNECT_ENABLED: false,
  ENABLE_LIGHT_MODE: false,
  THREADS_ENABLED: false,
  PWA_INSTALL_BANNER: false,
  SHOW_RELEASE_TOOLBAR_EXTRAS: false,
  PLAYLIST_ENGINE: false,
  ALBUM_ART_GENERATION: true,
  CHAT_JANK_MONITOR: false,
  RELEASE_PLAN_DEMO: false,
  DESIGN_V1: false,
  SHELL_CHAT_V1: false,
  DESIGN_V1_RELEASES: false,
  DESIGN_V1_TASKS: false,
  DESIGN_V1_CHAT_ENTITIES: false,
  DESIGN_V1_LYRICS: false,
  DESIGN_V1_LIBRARY: false,
  DESIGN_V1_AUTH: false,
  DESIGN_V1_ONBOARDING: false,
} as const;

export type AppFlagName = keyof typeof APP_FLAG_DEFAULTS;
export type AppFlagSnapshot = Record<AppFlagName, boolean>;

export const APP_FLAG_KEYS = {
  BILLING_UPGRADE_DIRECT: LEGACY_STATSIG_GATE_KEYS.BILLING_UPGRADE_DIRECT,
  SMARTLINK_PRE_SAVE: LEGACY_STATSIG_GATE_KEYS.SMARTLINK_PRE_SAVE,
  IOS_APPLE_MUSIC_PRIORITY: LEGACY_STATSIG_GATE_KEYS.IOS_APPLE_MUSIC_PRIORITY,
  SPOTIFY_OAUTH: LEGACY_STATSIG_GATE_KEYS.SPOTIFY_OAUTH,
  STRIPE_CONNECT_ENABLED: LEGACY_STATSIG_GATE_KEYS.STRIPE_CONNECT_ENABLED,
  ENABLE_LIGHT_MODE: LEGACY_STATSIG_GATE_KEYS.ENABLE_LIGHT_MODE,
  THREADS_ENABLED: 'threads_enabled',
  PWA_INSTALL_BANNER: 'pwa_install_banner',
  SHOW_RELEASE_TOOLBAR_EXTRAS: 'show_release_toolbar_extras',
  PLAYLIST_ENGINE: 'playlist_engine',
  ALBUM_ART_GENERATION: 'album_art_generation',
  CHAT_JANK_MONITOR: 'chat_jank_monitor',
  RELEASE_PLAN_DEMO: 'release_plan_demo',
  DESIGN_V1: 'design_v1',
  SHELL_CHAT_V1: LEGACY_STATSIG_GATE_KEYS.SHELL_CHAT_V1,
  DESIGN_V1_RELEASES: 'design_v1_releases',
  DESIGN_V1_TASKS: 'design_v1_tasks',
  DESIGN_V1_CHAT_ENTITIES: 'design_v1_chat_entities',
  DESIGN_V1_LYRICS: 'design_v1_lyrics',
  DESIGN_V1_LIBRARY: 'design_v1_library',
  DESIGN_V1_AUTH: 'design_v1_auth',
  DESIGN_V1_ONBOARDING: 'design_v1_onboarding',
} as const satisfies Record<AppFlagName, string>;

export const APP_FLAG_OVERRIDE_KEYS = {
  BILLING_UPGRADE_DIRECT: 'code:BILLING_UPGRADE_DIRECT',
  SMARTLINK_PRE_SAVE: 'code:SMARTLINK_PRE_SAVE',
  IOS_APPLE_MUSIC_PRIORITY: 'code:IOS_APPLE_MUSIC_PRIORITY',
  SPOTIFY_OAUTH: 'code:SPOTIFY_OAUTH',
  STRIPE_CONNECT_ENABLED: 'code:STRIPE_CONNECT_ENABLED',
  ENABLE_LIGHT_MODE: 'code:ENABLE_LIGHT_MODE',
  THREADS_ENABLED: 'code:THREADS_ENABLED',
  PWA_INSTALL_BANNER: 'code:PWA_INSTALL_BANNER',
  SHOW_RELEASE_TOOLBAR_EXTRAS: 'code:SHOW_RELEASE_TOOLBAR_EXTRAS',
  PLAYLIST_ENGINE: 'code:PLAYLIST_ENGINE',
  ALBUM_ART_GENERATION: 'code:ALBUM_ART_GENERATION',
  CHAT_JANK_MONITOR: 'code:CHAT_JANK_MONITOR',
  RELEASE_PLAN_DEMO: 'code:RELEASE_PLAN_DEMO',
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
  ENABLE_LIGHT_MODE: LEGACY_STATSIG_GATE_KEYS.ENABLE_LIGHT_MODE,
  DESIGN_V1: LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
  SHELL_CHAT_V1: LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
  DESIGN_V1_RELEASES: LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
  DESIGN_V1_TASKS: LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
  DESIGN_V1_CHAT_ENTITIES: LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
  DESIGN_V1_LYRICS: LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
  DESIGN_V1_LIBRARY: LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
  DESIGN_V1_AUTH: LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
  DESIGN_V1_ONBOARDING: LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
} as const satisfies Partial<Record<AppFlagName, StatsigGateKey>>;

export type StatsigBackedAppFlagName = keyof typeof APP_FLAG_TO_STATSIG_GATE;

export const APP_FLAG_DESCRIPTIONS = {
  BILLING_UPGRADE_DIRECT: 'Direct billing upgrade (skip pricing page)',
  SMARTLINK_PRE_SAVE: 'Spotify pre-save campaigns',
  IOS_APPLE_MUSIC_PRIORITY: 'Prefer Apple Music on iOS',
  SPOTIFY_OAUTH: 'Spotify OAuth login',
  STRIPE_CONNECT_ENABLED: 'Stripe Connect payouts',
  ENABLE_LIGHT_MODE: 'Light mode theme option',
  THREADS_ENABLED: 'Threads in sidebar chat history',
  PWA_INSTALL_BANNER: 'PWA install banner in the sidebar',
  SHOW_RELEASE_TOOLBAR_EXTRAS: 'Extra releases toolbar controls',
  PLAYLIST_ENGINE: 'Playlist engine surfaces',
  ALBUM_ART_GENERATION: 'AI-generated release artwork via chat',
  CHAT_JANK_MONITOR:
    'Chat jank instrumentation (message continuity + streaming)',
  RELEASE_PLAN_DEMO: 'Release plan demo page (YC wedge)',
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
