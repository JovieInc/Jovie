import { tool } from 'ai';
import { z } from 'zod';
import { aggregateMetrics } from '@/lib/services/insights/data-aggregator';
import type { MetricSnapshot } from '@/types/insights';

const TIME_RANGE_DAYS: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * Creates the queryAnalytics tool for querying artist analytics data.
 * Unified tool supporting audience, links, and timing queries.
 */
export function createQueryAnalyticsTool(profileId: string) {
  return tool({
    description:
      "Query the artist's analytics data. Use 'audience' for geographic and demographic data (top cities, countries, devices, visitor trends), 'links' for link performance data (top clicked links, referrers, click-through rates), or 'timing' for engagement timing patterns (best hours, best days, peak activity).",
    inputSchema: z.object({
      type: z
        .enum(['audience', 'links', 'timing'])
        .describe('The type of analytics data to query'),
      timeRange: z
        .enum(['7d', '30d', '90d'])
        .default('30d')
        .describe('Time range for the query. Default: 30d'),
    }),
    execute: async ({ type, timeRange }) => {
      try {
        const periodDays = TIME_RANGE_DAYS[timeRange] ?? 30;
        const metrics = await aggregateMetrics(profileId, periodDays);

        switch (type) {
          case 'audience':
            return formatAudienceResponse(metrics, timeRange);
          case 'links':
            return formatLinksResponse(metrics, timeRange);
          case 'timing':
            return formatTimingResponse(metrics, timeRange);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to query analytics';
        return { success: false, error: message };
      }
    },
  });
}

function deriveTopCountries(
  cities: { city: string; country: string; count: number }[]
) {
  const countryMap = new Map<string, number>();
  for (const c of cities) {
    countryMap.set(c.country, (countryMap.get(c.country) ?? 0) + c.count);
  }
  return Array.from(countryMap.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function formatAudienceResponse(metrics: MetricSnapshot, timeRange: string) {
  const clickGrowthPct =
    metrics.traffic.totalClicksPrevious > 0
      ? Math.round(
          ((metrics.traffic.totalClicksCurrent -
            metrics.traffic.totalClicksPrevious) /
            metrics.traffic.totalClicksPrevious) *
            100
        )
      : null;

  return {
    success: true,
    type: 'audience' as const,
    timeRange,
    data: {
      topCities: metrics.geographic.currentTopCities.slice(0, 10),
      topCountries: deriveTopCountries(metrics.geographic.currentTopCities),
      deviceBreakdown: metrics.engagement.deviceDistribution,
      visitors: {
        current: metrics.traffic.uniqueVisitorsCurrent,
        previous: metrics.traffic.uniqueVisitorsPrevious,
      },
      subscribers: {
        total: metrics.subscribers.totalActive,
        newCurrent: metrics.subscribers.newSubscribersCurrent,
        newPrevious: metrics.subscribers.newSubscribersPrevious,
      },
      growthTrend: {
        totalClicksCurrent: metrics.traffic.totalClicksCurrent,
        totalClicksPrevious: metrics.traffic.totalClicksPrevious,
        growthPct: clickGrowthPct,
      },
      newCities: metrics.geographic.newCities,
      decliningCities: metrics.geographic.decliningCities,
    },
  };
}

function formatLinksResponse(metrics: MetricSnapshot, timeRange: string) {
  return {
    success: true,
    type: 'links' as const,
    timeRange,
    data: {
      clicksByLinkType: metrics.content.clicksByLinkType,
      topReferrers: metrics.referrers.topReferrersCurrent.slice(0, 10),
      referrerGrowth: metrics.referrers.referrerGrowthRates.slice(0, 5),
      totalClicks: {
        current: metrics.traffic.totalClicksCurrent,
        previous: metrics.traffic.totalClicksPrevious,
      },
      recentReleases: metrics.content.recentReleases.slice(0, 5),
    },
  };
}

function formatTimingResponse(metrics: MetricSnapshot, timeRange: string) {
  const clicksByHour = metrics.temporal.clicksByHour;
  const clicksByDay = metrics.temporal.clicksByDayOfWeek;

  const peakHour = clicksByHour.reduce(
    (max, h) => (h.count > max.count ? h : max),
    { hour: 0, count: 0 }
  );
  const peakDay = clicksByDay.reduce(
    (max, d) => (d.count > max.count ? d : max),
    { day: 0, count: 0 }
  );

  return {
    success: true,
    type: 'timing' as const,
    timeRange,
    data: {
      clicksByHour,
      clicksByDayOfWeek: clicksByDay.map(d => ({
        ...d,
        dayName: DAY_NAMES[d.day] ?? `Day ${d.day}`,
      })),
      peakActivity: {
        bestHour: peakHour.hour,
        bestHourLabel: `${String(peakHour.hour).padStart(2, '0')}:00-${String((peakHour.hour + 1) % 24).padStart(2, '0')}:00 UTC`,
        bestDay: peakDay.day,
        bestDayLabel: DAY_NAMES[peakDay.day] ?? `Day ${peakDay.day}`,
      },
      totalEventsAnalyzed: clicksByHour.reduce(
        (sum, h) => sum + h.count,
        0
      ),
    },
  };
}
