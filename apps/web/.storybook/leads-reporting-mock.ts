// Mock for @/lib/leads/reporting. The real module is server-only (DB and the
// GitHub App signer via node:crypto), so importing it broke the whole story
// file for GtmFunnel/LeadGtmInsights. Stories get one deterministic report.
import type { LeadFunnelReport } from '@/lib/leads/reporting-types';

function row(cohort: string, scale: number) {
  return {
    cohort,
    scraped: 400 * scale,
    qualified: 220 * scale,
    approved: 140 * scale,
    contacted: 120 * scale,
    emailQueued: 90 * scale,
    dmSent: 30 * scale,
    claimClicks: 18 * scale,
    signups: 9 * scale,
    onboardingCompleted: 6 * scale,
    paidConversions: 2 * scale,
  };
}

const { cohort: _cohort, ...summary } = row('all', 2);

export const STORYBOOK_LEAD_FUNNEL_REPORT: LeadFunnelReport = {
  filters: {
    start: '2026-09-01T00:00:00.000Z',
    end: '2026-09-30T00:00:00.000Z',
  },
  summary,
  sourceBreakdown: [row('linktree', 1), row('beacons', 1)],
  musicToolBreakdown: [row('distrokid', 1), row('unknown', 1)],
  pixelBreakdown: [row('with pixels', 1), row('without pixels', 1)],
  verifiedBreakdown: [],
  paidTierBreakdown: [],
  keywordBreakdown: [],
  rampRecommendation: {
    recommendedAction: 'hold',
    recommendedNextDailyCap: 20,
    reasons: ['Claim-click rate is inside the target band.'],
    sampleSize: 240,
    claimClickRate: 0.15,
    providerFailureRate: 0.01,
  },
};

export async function getLeadFunnelReport(): Promise<LeadFunnelReport> {
  return STORYBOOK_LEAD_FUNNEL_REPORT;
}
