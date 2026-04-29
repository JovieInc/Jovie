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
  SHELL_CHAT_V1: 'feature_shell_chat_v1',
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
  SHELL_CHAT_V1: false,
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
  SHELL_CHAT_V1: LEGACY_STATSIG_GATE_KEYS.SHELL_CHAT_V1,
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
  SHELL_CHAT_V1: 'code:SHELL_CHAT_V1',
} as const satisfies Record<AppFlagName, string>;

export const APP_FLAG_TO_STATSIG_GATE = {
  BILLING_UPGRADE_DIRECT: LEGACY_STATSIG_GATE_KEYS.BILLING_UPGRADE_DIRECT,
  SMARTLINK_PRE_SAVE: LEGACY_STATSIG_GATE_KEYS.SMARTLINK_PRE_SAVE,
  IOS_APPLE_MUSIC_PRIORITY: LEGACY_STATSIG_GATE_KEYS.IOS_APPLE_MUSIC_PRIORITY,
  SPOTIFY_OAUTH: LEGACY_STATSIG_GATE_KEYS.SPOTIFY_OAUTH,
  STRIPE_CONNECT_ENABLED: LEGACY_STATSIG_GATE_KEYS.STRIPE_CONNECT_ENABLED,
  ENABLE_LIGHT_MODE: LEGACY_STATSIG_GATE_KEYS.ENABLE_LIGHT_MODE,
  SHELL_CHAT_V1: LEGACY_STATSIG_GATE_KEYS.SHELL_CHAT_V1,
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
  SHELL_CHAT_V1: 'Shell and chat V1 production design',
} as const satisfies Record<AppFlagName, string>;
