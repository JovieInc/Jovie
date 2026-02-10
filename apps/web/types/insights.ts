/** Insight categories that group related insight types */
export type InsightCategory =
  | 'geographic'
  | 'growth'
  | 'content'
  | 'revenue'
  | 'tour'
  | 'platform'
  | 'engagement'
  | 'timing';

/** Specific insight type identifiers */
export type InsightType =
  | 'city_growth'
  | 'new_market'
  | 'declining_market'
  | 'tour_gap'
  | 'tour_timing'
  | 'subscriber_surge'
  | 'subscriber_churn'
  | 'release_momentum'
  | 'platform_preference'
  | 'referrer_surge'
  | 'tip_hotspot'
  | 'engagement_quality'
  | 'peak_activity'
  | 'capture_rate_change'
  | 'device_shift';

/** Priority levels for insight display ordering */
export type InsightPriority = 'high' | 'medium' | 'low';

/** Lifecycle status of an insight */
export type InsightStatus = 'active' | 'dismissed' | 'acted_on' | 'expired';

/** Status of an insight generation run */
export type InsightRunStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

// ---------------------------------------------------------------------------
// API Response Types
// ---------------------------------------------------------------------------

/** Individual insight returned from the API */
export interface InsightResponse {
  id: string;
  insightType: InsightType;
  category: InsightCategory;
  priority: InsightPriority;
  title: string;
  description: string;
  actionSuggestion: string | null;
  confidence: string; // numeric(3,2) comes as string from DB
  status: InsightStatus;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  expiresAt: string;
}

/** Response from GET /api/insights */
export interface InsightsListResponse {
  insights: InsightResponse[];
  total: number;
  hasMore: boolean;
}

/** Response from GET /api/insights/summary */
export interface InsightsSummaryResponse {
  insights: InsightResponse[];
  totalActive: number;
  lastGeneratedAt: string | null;
}

/** Response from POST /api/insights/generate */
export interface InsightGenerateResponse {
  runId: string;
  status: InsightRunStatus;
  insightsGenerated: number;
  dataPointsAnalyzed: number;
  durationMs: number;
}

/** Request body for PATCH /api/insights/[id] */
export interface InsightUpdateRequest {
  status: 'dismissed' | 'acted_on';
}

// ---------------------------------------------------------------------------
// Data Aggregation Types
// ---------------------------------------------------------------------------

/** A city/country pair with a click count */
export interface GeoCount {
  city: string;
  country: string;
  count: number;
}

/** Growth rate for a geographic location */
export interface GeoGrowthRate {
  city: string;
  country: string;
  currentCount: number;
  previousCount: number;
  growthPct: number;
}

/** Referrer with growth information */
export interface ReferrerGrowth {
  referrer: string;
  currentCount: number;
  previousCount: number;
  growthPct: number;
}

/** Click counts by link type comparing two periods */
export interface LinkTypeComparison {
  linkType: string;
  current: number;
  previous: number;
}

/** Tour date with basic venue info */
export interface UpcomingShow {
  city: string;
  country: string;
  date: string;
  venueName: string;
}

/** City with audience but no upcoming shows */
export interface TourGap {
  city: string;
  country: string;
  audienceCount: number;
}

/** Full metric snapshot computed by the data aggregator */
export interface MetricSnapshot {
  period: { start: Date; end: Date };
  comparisonPeriod: { start: Date; end: Date };

  geographic: {
    currentTopCities: GeoCount[];
    previousTopCities: GeoCount[];
    cityGrowthRates: GeoGrowthRate[];
    newCities: GeoCount[];
    decliningCities: { city: string; country: string; declinePct: number }[];
  };

  traffic: {
    totalClicksCurrent: number;
    totalClicksPrevious: number;
    uniqueVisitorsCurrent: number;
    uniqueVisitorsPrevious: number;
    profileViewsCurrent: number;
    profileViewsPrevious: number;
  };

  subscribers: {
    newSubscribersCurrent: number;
    newSubscribersPrevious: number;
    unsubscribesCurrent: number;
    unsubscribesPrevious: number;
    totalActive: number;
    subscriberCities: { city: string; count: number }[];
  };

  revenue: {
    totalTipsCurrent: number;
    totalTipsPrevious: number;
    tipCountCurrent: number;
    tipCountPrevious: number;
    tipsByCity: { city: string; totalCents: number; count: number }[];
    averageTipCurrent: number;
    averageTipPrevious: number;
  };

  content: {
    clicksByLinkType: LinkTypeComparison[];
    recentReleases: {
      id: string;
      title: string;
      releaseDate: string;
      clickCount: number;
    }[];
  };

  tour: {
    upcomingShows: UpcomingShow[];
    audienceCitiesWithoutShows: TourGap[];
  };

  engagement: {
    intentDistributionCurrent: { level: string; count: number }[];
    intentDistributionPrevious: { level: string; count: number }[];
    deviceDistribution: { deviceType: string; count: number }[];
    captureRateCurrent: number;
    captureRatePrevious: number;
  };

  referrers: {
    topReferrersCurrent: { referrer: string; count: number }[];
    topReferrersPrevious: { referrer: string; count: number }[];
    referrerGrowthRates: ReferrerGrowth[];
  };

  temporal: {
    clicksByHour: { hour: number; count: number }[];
    clicksByDayOfWeek: { day: number; count: number }[];
  };

  profile: {
    displayName: string;
    genres: string[];
    spotifyFollowers: number | null;
    spotifyPopularity: number | null;
    creatorType: string;
    totalAudienceMembers: number;
    totalSubscribers: number;
  };
}

/** Output from the AI generator before persistence */
export interface GeneratedInsight {
  insightType: InsightType;
  category: InsightCategory;
  priority: InsightPriority;
  title: string;
  description: string;
  actionSuggestion: string | null;
  confidence: number;
  dataSnapshot: Record<string, unknown>;
  expiresInDays: number;
}
