export const STATSIG_FLAGS = {
  TIPPING: 'feature_tipping',
  NOTIFICATIONS: 'feature_notifications',
  ANALYTICS: 'feature_analytics',
} as const;

export type StatsigFlagName =
  (typeof STATSIG_FLAGS)[keyof typeof STATSIG_FLAGS];
