/**
 * Statsig Feature Gates
 *
 * All feature gates used in the Jovie application.
 * When adding a new flag:
 * 1. Add the constant here with `feature_` prefix
 * 2. Use the Statsig MCP to create the gate in the Statsig console:
 *    - Run: Use Statsig MCP tools to create the gate
 *    - Or manually create at https://console.statsig.com
 * 3. Document the flag purpose and default state
 * 4. Set expiry date (max 14 days for experimental flags)
 */
export const STATSIG_FLAGS = {
  // Core Features
  TIPPING: 'feature_tipping',
  NOTIFICATIONS: 'feature_notifications',
  ANALYTICS: 'feature_analytics',

  // UI/UX Features
  ARTIST_SEARCH: 'feature_artist_search',
  TIP_PROMO: 'feature_tip_promo',

  // Onboarding Features
  PROGRESSIVE_ONBOARDING: 'feature_progressive_onboarding',
  MINIMALIST_ONBOARDING: 'feature_minimalist_onboarding',
  APPLE_STYLE_ONBOARDING: 'feature_apple_style_onboarding',

  // Profile Features
  PROFILE_SETTINGS: 'feature_profile_settings',
  AVATAR_UPLOAD: 'feature_avatar_upload',
  AVATAR_UPLOADER: 'feature_avatar_uploader',
  CONTACTS: 'feature_contacts',
  DYNAMIC_ENGAGEMENT: 'feature_dynamic_engagement',

  // Backend Features
  UNIVERSAL_NOTIFICATIONS: 'feature_universal_notifications',
  AUDIENCE_V2: 'feature_audience_v2',
  CLICK_ANALYTICS_RPC: 'feature_click_analytics_rpc',

  // Integration Features
  PRICING_USE_CLERK: 'feature_pricing_use_clerk',
  LINK_INGESTION: 'feature_link_ingestion',
} as const;

export type StatsigFlagName =
  (typeof STATSIG_FLAGS)[keyof typeof STATSIG_FLAGS];
