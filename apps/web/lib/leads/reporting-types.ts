export interface LeadFunnelReportFilters {
  start?: Date;
  end?: Date;
  sourcePlatform?: 'linktree' | 'beacons' | 'laylo';
  discoveryQuery?: string;
  musicTool?: string;
  verified?: boolean;
  hasPaidTier?: boolean;
  hasTrackingPixels?: boolean;
  channel?: string;
  campaignKey?: string;
}

export interface LeadFunnelBreakdownRow {
  cohort: string;
  scraped: number;
  qualified: number;
  approved: number;
  contacted: number;
  emailQueued: number;
  dmSent: number;
  claimClicks: number;
  signups: number;
  onboardingCompleted: number;
  paidConversions: number;
}

export interface RampRecommendation {
  recommendedAction: 'increase' | 'hold' | 'pause';
  recommendedNextDailyCap: number;
  reasons: string[];
  sampleSize: number;
  claimClickRate: number | null;
  providerFailureRate: number | null;
}

export interface LeadFunnelReport {
  filters: {
    start: string;
    end: string;
  };
  summary: Omit<LeadFunnelBreakdownRow, 'cohort'>;
  sourceBreakdown: LeadFunnelBreakdownRow[];
  musicToolBreakdown: LeadFunnelBreakdownRow[];
  pixelBreakdown: LeadFunnelBreakdownRow[];
  verifiedBreakdown: LeadFunnelBreakdownRow[];
  paidTierBreakdown: LeadFunnelBreakdownRow[];
  keywordBreakdown: LeadFunnelBreakdownRow[];
  rampRecommendation: RampRecommendation;
}

export interface LeadRow {
  id: string;
  sourcePlatform: 'linktree' | 'beacons' | 'laylo';
  discoveryQuery: string | null;
  isLinktreeVerified: boolean | null;
  hasPaidTier: boolean | null;
  hasTrackingPixels: boolean;
  musicToolsDetected: string[];
}

export interface LeadReportEvent {
  leadId: string;
  eventType: string;
  channel: string | null;
  campaignKey: string | null;
}
