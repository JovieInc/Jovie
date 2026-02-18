import type { MetricSnapshot } from '@/types/insights';
import {
  aggregateClicks,
  aggregateAudience,
  aggregateSubscribers,
  aggregateRevenue,
  aggregateTourData,
  fetchProfileContext,
  aggregateReleases,
  aggregateTemporalPatterns,
  computeCityGrowthRates,
  computeReferrerGrowthRates,
} from './domain-aggregators';
import { DEFAULT_PERIOD_DAYS } from './thresholds';

/**
 * Computes the period boundaries for insight generation.
 */
export function computePeriods(periodDays: number = DEFAULT_PERIOD_DAYS) {
  const now = new Date();
  const periodEnd = now;
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - periodDays);

  const comparisonPeriodEnd = new Date(periodStart);
  const comparisonPeriodStart = new Date(comparisonPeriodEnd);
  comparisonPeriodStart.setDate(comparisonPeriodStart.getDate() - periodDays);

  return {
    period: { start: periodStart, end: periodEnd },
    comparisonPeriod: {
      start: comparisonPeriodStart,
      end: comparisonPeriodEnd,
    },
  };
}

/**
 * Aggregates all analytics data for a creator profile into a MetricSnapshot.
 *
 * Uses consolidated SQL queries with CTEs (following the existing pattern in
 * getUserDashboardAnalytics) for efficient data retrieval.
 */
export async function aggregateMetrics(
  creatorProfileId: string,
  periodDays: number = DEFAULT_PERIOD_DAYS
): Promise<MetricSnapshot> {
  const { period, comparisonPeriod } = computePeriods(periodDays);

  // Run all independent queries in parallel
  const [
    clickAggregates,
    audienceAggregates,
    subscriberAggregates,
    revenueAggregates,
    tourData,
    profileData,
    releaseData,
    temporalData,
  ] = await Promise.all([
    aggregateClicks(creatorProfileId, period, comparisonPeriod),
    aggregateAudience(creatorProfileId, period, comparisonPeriod),
    aggregateSubscribers(creatorProfileId, period, comparisonPeriod),
    aggregateRevenue(creatorProfileId, period, comparisonPeriod),
    aggregateTourData(creatorProfileId, period),
    fetchProfileContext(creatorProfileId),
    aggregateReleases(creatorProfileId, period),
    aggregateTemporalPatterns(creatorProfileId, period),
  ]);

  // Compute geographic growth rates from current vs previous top cities
  const cityGrowthRates = computeCityGrowthRates(
    clickAggregates.currentTopCities,
    clickAggregates.previousTopCities
  );

  // Identify new cities (present in current but not in previous)
  const previousCitySet = new Set(
    clickAggregates.previousTopCities.map(c => c.city)
  );
  const newCities = clickAggregates.currentTopCities.filter(
    c => !previousCitySet.has(c.city) && c.count >= 5
  );

  // Identify declining cities
  const decliningCities = cityGrowthRates
    .filter(c => c.growthPct < -20 && c.previousCount >= 10)
    .map(c => ({
      city: c.city,
      country: c.country,
      declinePct: Math.abs(c.growthPct),
    }));

  // Compute referrer growth rates
  const referrerGrowthRates = computeReferrerGrowthRates(
    clickAggregates.topReferrersCurrent,
    clickAggregates.topReferrersPrevious
  );

  // Identify tour gaps: audience cities without upcoming shows
  const showCities = new Set(
    tourData.upcomingShows.map(s => s.city.toLowerCase())
  );
  const audienceCitiesWithoutShows = audienceAggregates.topCities
    .filter(c => !showCities.has(c.city.toLowerCase()) && c.count >= 10)
    .map(c => ({ city: c.city, country: c.country, audienceCount: c.count }));

  // Compute capture rates
  const captureRateCurrent =
    clickAggregates.uniqueVisitorsCurrent > 0
      ? (subscriberAggregates.newSubscribersCurrent /
          clickAggregates.uniqueVisitorsCurrent) *
        100
      : 0;
  const captureRatePrevious =
    clickAggregates.uniqueVisitorsPrevious > 0
      ? (subscriberAggregates.newSubscribersPrevious /
          clickAggregates.uniqueVisitorsPrevious) *
        100
      : 0;

  return {
    period,
    comparisonPeriod,
    geographic: {
      currentTopCities: clickAggregates.currentTopCities,
      previousTopCities: clickAggregates.previousTopCities,
      cityGrowthRates,
      newCities,
      decliningCities,
    },
    traffic: {
      totalClicksCurrent: clickAggregates.totalClicksCurrent,
      totalClicksPrevious: clickAggregates.totalClicksPrevious,
      uniqueVisitorsCurrent: clickAggregates.uniqueVisitorsCurrent,
      uniqueVisitorsPrevious: clickAggregates.uniqueVisitorsPrevious,
      profileViewsCurrent: profileData.profileViews,
      profileViewsPrevious: 0, // Profile views are cumulative, not per-period
    },
    subscribers: {
      newSubscribersCurrent: subscriberAggregates.newSubscribersCurrent,
      newSubscribersPrevious: subscriberAggregates.newSubscribersPrevious,
      unsubscribesCurrent: subscriberAggregates.unsubscribesCurrent,
      unsubscribesPrevious: subscriberAggregates.unsubscribesPrevious,
      totalActive: subscriberAggregates.totalActive,
      subscriberCities: subscriberAggregates.subscriberCities,
    },
    revenue: revenueAggregates,
    content: {
      clicksByLinkType: clickAggregates.clicksByLinkType,
      recentReleases: releaseData,
    },
    tour: {
      upcomingShows: tourData.upcomingShows,
      audienceCitiesWithoutShows,
    },
    engagement: {
      intentDistributionCurrent: audienceAggregates.intentDistributionCurrent,
      intentDistributionPrevious: audienceAggregates.intentDistributionPrevious,
      deviceDistribution: audienceAggregates.deviceDistribution,
      captureRateCurrent: Math.round(captureRateCurrent * 10) / 10,
      captureRatePrevious: Math.round(captureRatePrevious * 10) / 10,
    },
    referrers: {
      topReferrersCurrent: clickAggregates.topReferrersCurrent,
      topReferrersPrevious: clickAggregates.topReferrersPrevious,
      referrerGrowthRates,
    },
    temporal: temporalData,
    profile: {
      displayName: profileData.displayName,
      genres: profileData.genres,
      spotifyFollowers: profileData.spotifyFollowers,
      spotifyPopularity: profileData.spotifyPopularity,
      creatorType: profileData.creatorType,
      totalAudienceMembers: audienceAggregates.totalMembers,
      totalSubscribers: subscriberAggregates.totalActive,
    },
  };
}
