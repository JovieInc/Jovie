export const LEGACY_STATSIG_GATE_KEYS = {
  BILLING_UPGRADE_DIRECT: 'billing.upgradeDirect',
  SMARTLINK_PRE_SAVE: 'smartlink_pre_save_campaigns',
  IOS_APPLE_MUSIC_PRIORITY: 'feature_ios_apple_music_priority',
  SUBSCRIBE_CTA_EXPERIMENT: 'experiment_subscribe_cta_variant',
  PROFILE_ALERT_OPTIN_EXPERIMENT: 'profile_alert_optin_cta_variant',
  PROFILE_PAC_VARIANT_SLOTS_EXPERIMENT: 'profile_pac_variant_slots',
  SPOTIFY_OAUTH: 'feature_spotify_oauth',
  STRIPE_CONNECT_ENABLED: 'stripe-connect-enabled',
  SHOW_EXAMPLE_PROFILES_CAROUSEL: 'show_example_profiles_carousel',
  SHOW_SEE_IT_IN_ACTION: 'show_see_it_in_action',
  CHAT_JANK_MONITOR: 'chat_jank_monitor',
  AI_CONNECTORS_BETA: 'ai_connectors_beta',
  MERCH_MVP: 'merch_mvp',
  BULK_PRESS_PHOTO_IMPORT: 'bulk_press_photo_import',
  APPLE_WALLET_PROFILE_PASS: 'apple_wallet_profile_pass',
  TELEPROMPTER_RECORDING: 'teleprompter_recording',
  TELEPROMPTER_SHOWCASE_EXPERIMENT: 'experiment_teleprompter_showcase',
} as const;

export type StatsigGateKey =
  (typeof LEGACY_STATSIG_GATE_KEYS)[keyof typeof LEGACY_STATSIG_GATE_KEYS];

export type SubscribeCTAVariant = 'two_step' | 'inline';
export type ProfileAlertOptInVariant = 'button' | 'toggle';
export type TeleprompterShowcaseVariant = 'interstitial' | 'direct';
export interface StatsigFeatureFlagsBootstrap {
  gates: Record<string, boolean>;
}

export const APP_FLAG_DEFAULTS = {
  BILLING_UPGRADE_DIRECT: true,
  SMARTLINK_PRE_SAVE: true,
  IOS_APPLE_MUSIC_PRIORITY: true,
  SPOTIFY_OAUTH: true,
  STRIPE_CONNECT_ENABLED: true,
  PLAYLIST_ENGINE: true,
  ALBUM_ART_GENERATION: true,
  CHAT_JANK_MONITOR: true,
  /**
   * Mock EP planner at /app/dashboard/release-plan. Off in production.
   * Dev and preview stay on unless an env override publishes a value
   * (`getAppFlagValue`).
   */
  RELEASE_PLAN_DEMO: false,
  RELEASE_TO_REVENUE_AUTOPILOT: true,
  AI_CONNECTORS_BETA: true,
  MERCH_MVP: true,
  BULK_PRESS_PHOTO_IMPORT: true,
  APPLE_WALLET_PROFILE_PASS: true,
  TELEPROMPTER_RECORDING: true,
  /**
   * Opportunity Inbox as named /app home (GH #13171 / JOV-3931).
   * Default off in prod; enable via env override, admin dogfood, or FEATURE gate.
   */
  INBOX_HOME: false,
  PROFILES_WORKSPACE: false,
  PROFILE_SEARCH_MONITORING: false,
  /**
   * Post-signup wow-moment: seed real presence-build tasks into workflow_runs
   * and stream tool artifacts in the welcome chat (JOV-3988). Kill-switchable.
   */
  ONBOARDING_WOW_TASK_QUEUE: true,
  /**
   * Paid-subscription fulfillment confirmation email (JOV-6445).
   * Default OFF. Approvals-policy-v1: Tim must publish this flag on
   * and approve the first live send before any customer receives it.
   */
  PAID_WELCOME_EMAIL: false,
  /**
   * Merch pre-publish QA gate (JOV-4739). Default OFF until a real visual
   * reviewer lands — the stub reviewer routes every new candidate to
   * quarantine when enabled.
   */
  MERCH_QA_GATE: false,
  /**
   * Anonymous agent profile creation (POST /api/agents/profiles). Kill switch
   * for the public CLI/MCP write path; default on.
   */
  AGENT_PROFILE_CREATE: true,
  /**
   * Creator Financial Health surfaces (JOV-4621). Default OFF and excluded
   * from the admin default-true set — this gate is release-blocking and must
   * stay dark until the privacy/correctness matrix is certified. An
   * additional env kill switch (`FINANCE_DISABLE`) forces off immediately,
   * independent of flag-resolution latency.
   */
  CREATOR_FINANCE: false,
} as const;

export type AppFlagName = keyof typeof APP_FLAG_DEFAULTS;
export type AppFlagSnapshot = Record<AppFlagName, boolean>;
/** Trimmed server-to-client payload — only flags resolved for the active route. */
export type PartialAppFlagSnapshot = Partial<Record<AppFlagName, boolean>>;

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
  RELEASE_TO_REVENUE_AUTOPILOT: 'release_to_revenue_autopilot',
  AI_CONNECTORS_BETA: 'ai_connectors_beta',
  MERCH_MVP: LEGACY_STATSIG_GATE_KEYS.MERCH_MVP,
  BULK_PRESS_PHOTO_IMPORT: LEGACY_STATSIG_GATE_KEYS.BULK_PRESS_PHOTO_IMPORT,
  APPLE_WALLET_PROFILE_PASS: LEGACY_STATSIG_GATE_KEYS.APPLE_WALLET_PROFILE_PASS,
  TELEPROMPTER_RECORDING: LEGACY_STATSIG_GATE_KEYS.TELEPROMPTER_RECORDING,
  INBOX_HOME: 'inbox_home',
  PROFILES_WORKSPACE: 'profiles_workspace',
  PROFILE_SEARCH_MONITORING: 'profile_search_monitoring',
  ONBOARDING_WOW_TASK_QUEUE: 'onboarding_wow_task_queue',
  PAID_WELCOME_EMAIL: 'paid_welcome_email',
  MERCH_QA_GATE: 'merch_qa_gate',
  AGENT_PROFILE_CREATE: 'agent_profile_create',
  CREATOR_FINANCE: 'creator_finance',
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
  RELEASE_TO_REVENUE_AUTOPILOT: 'code:RELEASE_TO_REVENUE_AUTOPILOT',
  AI_CONNECTORS_BETA: 'code:AI_CONNECTORS_BETA',
  MERCH_MVP: 'code:MERCH_MVP',
  BULK_PRESS_PHOTO_IMPORT: 'code:BULK_PRESS_PHOTO_IMPORT',
  APPLE_WALLET_PROFILE_PASS: 'code:APPLE_WALLET_PROFILE_PASS',
  TELEPROMPTER_RECORDING: 'code:TELEPROMPTER_RECORDING',
  INBOX_HOME: 'code:INBOX_HOME',
  PROFILES_WORKSPACE: 'code:PROFILES_WORKSPACE',
  PROFILE_SEARCH_MONITORING: 'code:PROFILE_SEARCH_MONITORING',
  ONBOARDING_WOW_TASK_QUEUE: 'code:ONBOARDING_WOW_TASK_QUEUE',
  PAID_WELCOME_EMAIL: 'code:PAID_WELCOME_EMAIL',
  MERCH_QA_GATE: 'code:MERCH_QA_GATE',
  AGENT_PROFILE_CREATE: 'code:AGENT_PROFILE_CREATE',
  CREATOR_FINANCE: 'code:CREATOR_FINANCE',
} as const satisfies Record<AppFlagName, string>;

export const APP_FLAG_TO_STATSIG_GATE = {
  BILLING_UPGRADE_DIRECT: LEGACY_STATSIG_GATE_KEYS.BILLING_UPGRADE_DIRECT,
  SMARTLINK_PRE_SAVE: LEGACY_STATSIG_GATE_KEYS.SMARTLINK_PRE_SAVE,
  IOS_APPLE_MUSIC_PRIORITY: LEGACY_STATSIG_GATE_KEYS.IOS_APPLE_MUSIC_PRIORITY,
  SPOTIFY_OAUTH: LEGACY_STATSIG_GATE_KEYS.SPOTIFY_OAUTH,
  STRIPE_CONNECT_ENABLED: LEGACY_STATSIG_GATE_KEYS.STRIPE_CONNECT_ENABLED,
  CHAT_JANK_MONITOR: LEGACY_STATSIG_GATE_KEYS.CHAT_JANK_MONITOR,
  AI_CONNECTORS_BETA: LEGACY_STATSIG_GATE_KEYS.AI_CONNECTORS_BETA,
  MERCH_MVP: LEGACY_STATSIG_GATE_KEYS.MERCH_MVP,
  BULK_PRESS_PHOTO_IMPORT: LEGACY_STATSIG_GATE_KEYS.BULK_PRESS_PHOTO_IMPORT,
  APPLE_WALLET_PROFILE_PASS: LEGACY_STATSIG_GATE_KEYS.APPLE_WALLET_PROFILE_PASS,
  TELEPROMPTER_RECORDING: LEGACY_STATSIG_GATE_KEYS.TELEPROMPTER_RECORDING,
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
  RELEASE_TO_REVENUE_AUTOPILOT:
    'Release-to-Revenue autopilot trigger for the single design-partner artist',
  AI_CONNECTORS_BETA:
    'AI Connectors v1 beta (Gmail booking extraction → calendar)',
  MERCH_MVP: 'Jovie-owned merch creation, checkout, and Printful fulfillment',
  BULK_PRESS_PHOTO_IMPORT:
    'DSP bulk press-photo import after platform activation evidence passes',
  APPLE_WALLET_PROFILE_PASS:
    'First-party Apple Wallet profile pass for in-person sharing',
  TELEPROMPTER_RECORDING:
    'In-app teleprompter recording proposals and showcase interstitial',
  INBOX_HOME:
    'Opportunity Inbox as the named /app home surface (nav item + title agreement)',
  PROFILES_WORKSPACE:
    'Unified public Profiles and Connections workspace navigation',
  PROFILE_SEARCH_MONITORING:
    'Google-first artist search-presence monitoring runner',
  ONBOARDING_WOW_TASK_QUEUE:
    'Seed real onboarding presence-build tasks with live chat artifacts (JOV-3988)',
  PAID_WELCOME_EMAIL:
    'Send one idempotent paid-welcome email after verified subscription entitlement. Default off — Tim publishes prod override and approves the first live send (JOV-6445).',
  MERCH_QA_GATE:
    'Merch pre-publish visual QA gate: persisted receipts, quarantine queue, fail-closed publish evidence (JOV-4739). Default off until a real visual reviewer replaces the stub.',
  AGENT_PROFILE_CREATE:
    'Anonymous agent profile creation via POST /api/agents/profiles (public CLI/MCP write path).',
  CREATOR_FINANCE:
    'Creator Financial Health owner-only surfaces (JOV-4621). Release-blocking gate — stays off until the privacy/correctness matrix is certified.',
} as const satisfies Record<AppFlagName, string>;

/**
 * Removal criteria are deliberately separate from product descriptions: a
 * flag without an exit condition is an indefinite second product state.
 */
export const APP_FLAG_REMOVAL_CONDITIONS = {
  BILLING_UPGRADE_DIRECT:
    'Remove after direct checkout is the only supported upgrade path.',
  SMARTLINK_PRE_SAVE:
    'Remove after the pre-save fallback has no supported callers.',
  IOS_APPLE_MUSIC_PRIORITY:
    'Remove after Apple Music priority is the permanent iOS behavior.',
  SPOTIFY_OAUTH:
    'Remove after Spotify sign-in is either permanently supported or retired.',
  STRIPE_CONNECT_ENABLED:
    'Remove after payout operations have an independent incident stop control.',
  PLAYLIST_ENGINE:
    'Remove after the playlist engine fallback has no supported callers.',
  ALBUM_ART_GENERATION:
    'Remove after album-art generation has an independent provider kill switch.',
  CHAT_JANK_MONITOR:
    'Remove after the instrumentation is permanent or superseded.',
  RELEASE_PLAN_DEMO: 'Remove when the demo route is promoted or deleted.',
  RELEASE_TO_REVENUE_AUTOPILOT:
    'Remove when the design-partner pilot is promoted or ended.',
  AI_CONNECTORS_BETA:
    'Remove when connector access is governed only by connector lifecycle state.',
  MERCH_MVP:
    'Remove after merch is generally available with an independent incident stop control.',
  BULK_PRESS_PHOTO_IMPORT:
    'Remove after activation evidence is the sole ingestion gate.',
  APPLE_WALLET_PROFILE_PASS:
    'Remove after Wallet passes are permanent or retired.',
  TELEPROMPTER_RECORDING:
    'Remove after recording is permanent and its experiment is concluded.',
  INBOX_HOME:
    'Remove when Inbox is either the canonical app home or no longer a candidate.',
  PROFILES_WORKSPACE:
    'Remove when Profiles is either the canonical workspace or retired.',
  PROFILE_SEARCH_MONITORING:
    'Remove when monitoring is permanently available or retired.',
  ONBOARDING_WOW_TASK_QUEUE:
    'Retain until task seeding has an independent queue incident stop control.',
  PAID_WELCOME_EMAIL:
    'Retain while external-recipient delivery requires a founder-controlled stop.',
  MERCH_QA_GATE:
    'Remove when the real visual reviewer is mandatory and the stub path is deleted.',
  AGENT_PROFILE_CREATE:
    'Retain while the anonymous public write path needs an abuse stop control.',
  CREATOR_FINANCE:
    'Remove when the JOV-4621 release gate is certified and financial access no longer needs a fleet-wide stop control.',
} as const satisfies Record<AppFlagName, string>;

export const APP_FLAG_AUDIT_OWNER = '@itstimwhite' as const;

export interface AppFlagAuditRecord {
  readonly owner: typeof APP_FLAG_AUDIT_OWNER;
  readonly purpose: string;
  readonly safeDefault: boolean;
  readonly targeting: 'dev_staging_prod_override';
  readonly removalCondition: string;
  readonly schemaAssumption: 'feature_flag_overrides_optional';
  readonly killSwitch: {
    readonly disabledValue: false;
    readonly activationBoundary: 'next_flag_resolution_after_audited_write';
  };
  readonly certificationStates: readonly ['off', 'on'];
}

/**
 * Audit projection for the existing app-flag family. This is metadata for the
 * canonical registry above, not another evaluator or flag platform.
 *
 * Every active runtime flag is treated as critical because it can select a
 * distinct product state. The `satisfies` boundary and guardrail test make a
 * new, renamed, stale, or ownerless flag fail closed in source certification.
 */
export const APP_FLAG_AUDIT_REGISTRY = Object.fromEntries(
  (Object.keys(APP_FLAG_DEFAULTS) as AppFlagName[]).map(flagName => [
    flagName,
    {
      owner: APP_FLAG_AUDIT_OWNER,
      purpose: APP_FLAG_DESCRIPTIONS[flagName],
      safeDefault: APP_FLAG_DEFAULTS[flagName],
      targeting: 'dev_staging_prod_override',
      removalCondition: APP_FLAG_REMOVAL_CONDITIONS[flagName],
      schemaAssumption: 'feature_flag_overrides_optional',
      killSwitch: {
        disabledValue: false,
        activationBoundary: 'next_flag_resolution_after_audited_write',
      },
      certificationStates: ['off', 'on'],
    },
  ])
) as unknown as Record<AppFlagName, AppFlagAuditRecord>;

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
  'PLAYLIST_ENGINE', // internal v1 default-on feature; no remote gate
  'ALBUM_ART_GENERATION', // default-true feature; controlled by Statsig experiment separately in usage, not a gate
  'RELEASE_PLAN_DEMO', // mock EP planner; default off in production, on in dev/preview, no remote gate
  'RELEASE_TO_REVENUE_AUTOPILOT', // internal v1 default-on pilot surface; no remote gate
  'INBOX_HOME', // rollout gate for Inbox-as-home IA; default off in prod (JOV-3931)
  'PROFILES_WORKSPACE', // JOV-2659 Tim-first unified Profiles rollout
  'PROFILE_SEARCH_MONITORING', // JOV-2659 server runner remains separately health-gated
  'ONBOARDING_WOW_TASK_QUEUE', // JOV-3988 kill-switch; local default + env/admin override, no Statsig gate
  'PAID_WELCOME_EMAIL', // JOV-6445 external-recipient send; founder-gated default off, no Statsig gate
  'MERCH_QA_GATE', // JOV-4739 publish gate; default off until a real visual reviewer replaces the stub — no Statsig gate
  'AGENT_PROFILE_CREATE', // public agent write-path kill switch; env/admin override, no Statsig gate
  'CREATOR_FINANCE', // JOV-4621 release gate; env/admin override + FINANCE_DISABLE kill switch, no Statsig gate
]);
