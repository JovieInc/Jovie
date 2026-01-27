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
  // UI/UX Features

  // Onboarding Features

  // Profile Features
  CONTACTS: 'feature_contacts',
  DYNAMIC_ENGAGEMENT: 'feature_dynamic_engagement',

  // Backend Features
  AUDIENCE_V2: 'feature_audience_v2',

  // Integration Features
  LINK_INGESTION: 'feature_link_ingestion',
} as const;

export type StatsigFlagName =
  (typeof STATSIG_FLAGS)[keyof typeof STATSIG_FLAGS];
