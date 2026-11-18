import type { AdminFunnelMetrics } from '@/lib/admin/funnel-metrics';

/** Shared metrics for FunnelMetricsStrip state stories and certificate tests. */
export const FUNNEL_METRICS_FIXTURE: AdminFunnelMetrics = {
  instagramShareStepViews7d: 20,
  instagramBioCopies7d: 12,
  instagramBioOpenRate7d: 0.4,
  instagramBioActivations7d: 6,
  instagramBioActivationRate7d: 0.3,
  outreachSent7d: 150,
  claimClicks7d: 30,
  claimRate: 0.2,
  signups7d: 10,
  signupRate: 0.333,
  paidConversions7d: 2,
  paidConversionRate: 0.2,
  mrrUsd: 500,
  arrUsd: 6000,
  payingCustomers: 12,
  runwayMonths: null,
  defaultAliveDate: null,
  wowGrowthRate: null,
  momGrowthRate: 0.25,
  churnRate: null,
  retention30d: null,
  retention60d: null,
  retention90d: null,
  engagementActiveProfiles30d: null,
  cacUsd: null,
  ltvUsd: null,
  paybackPeriodMonths: null,
  stripeAvailable: true,
  errors: [],
  outreachToSignupRate: 0.067,
  signupToPaidRate: 0.2,
  dollarPerOutreach: 0.003,
  magicMomentRate: 0.75,
  magicMomentCount: 15,
  enrichmentFailureRate: 0.1,
};

/** No activity yet: every count is zero and nothing has been billed. */
export const FUNNEL_METRICS_EMPTY: AdminFunnelMetrics = {
  ...FUNNEL_METRICS_FIXTURE,
  instagramShareStepViews7d: 0,
  instagramBioCopies7d: 0,
  instagramBioOpenRate7d: 0,
  instagramBioActivations7d: 0,
  instagramBioActivationRate7d: 0,
  mrrUsd: 0,
  arrUsd: 0,
  payingCustomers: 0,
  runwayMonths: 0,
  momGrowthRate: null,
  engagementActiveProfiles30d: 0,
};

/** Stripe is not connected, so revenue cards cannot be read. */
export const FUNNEL_METRICS_NO_STRIPE: AdminFunnelMetrics = {
  ...FUNNEL_METRICS_FIXTURE,
  stripeAvailable: false,
};

/** Large values that stress every card's value line. */
export const FUNNEL_METRICS_LARGE: AdminFunnelMetrics = {
  ...FUNNEL_METRICS_FIXTURE,
  instagramShareStepViews7d: 1_234_567,
  instagramBioCopies7d: 987_654,
  instagramBioActivations7d: 456_789,
  mrrUsd: 12_345_678,
  arrUsd: 148_148_136,
  payingCustomers: 1_048_576,
  runwayMonths: 128.4,
  defaultAliveDate: 'September 14, 2031',
  wowGrowthRate: -0.1234,
  momGrowthRate: 12.3456,
  engagementActiveProfiles30d: 2_500_000,
};
