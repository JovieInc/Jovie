import { getUserDashboardAnalytics } from '@/lib/db/queries/analytics';
import { formatAnalyticsStageRate } from '@/lib/utils/analytics-growth';

export type MobileAudienceHighlightsStatTile = {
  readonly label: string;
  readonly value: number;
  readonly hint?: string;
};

export type MobileAudienceHighlightsResponse = {
  readonly rangeLabel: string;
  readonly heroLabel: string;
  readonly heroValue: number;
  readonly heroDeltaLabel: string | null;
  readonly statTiles: readonly MobileAudienceHighlightsStatTile[];
  readonly chatPrompt: string;
};

function formatDeltaLabel(current: number, previous: number): string | null {
  if (previous <= 0) {
    if (current <= 0) return null;
    return 'New this week';
  }

  const deltaPercent = Math.round(((current - previous) / previous) * 100);
  if (deltaPercent === 0) return 'Flat vs last week';
  const sign = deltaPercent > 0 ? '+' : '';
  return `${sign}${deltaPercent}% vs last week`;
}

function buildCaptureRateHint(
  subscribers: number,
  uniqueUsers: number
): string | undefined {
  const rate = formatAnalyticsStageRate(subscribers, uniqueUsers);
  return rate ? `${rate} of fans` : undefined;
}

/**
 * Condensed audience analytics for the iOS read-only highlights surface.
 * Uses 7-day traffic metrics with a simple week-over-week hero delta.
 */
export async function buildMobileAudienceHighlights(
  clerkUserId: string
): Promise<MobileAudienceHighlightsResponse> {
  const [currentWeek, priorWeek] = await Promise.all([
    getUserDashboardAnalytics(clerkUserId, '7d', 'traffic'),
    getUserDashboardAnalytics(clerkUserId, '30d', 'traffic'),
  ]);

  const currentViews = currentWeek.profile_views ?? 0;
  const trailingViews = Math.max(
    0,
    (priorWeek.profile_views ?? 0) - currentViews
  );
  const priorWeekViews = Math.round(trailingViews / 3);

  const uniqueUsers = currentWeek.unique_users ?? 0;
  const subscribers = currentWeek.subscribers ?? 0;
  const totalClicks = currentWeek.total_clicks ?? 0;
  const listenClicks = currentWeek.listen_clicks ?? 0;

  return {
    rangeLabel: 'Last 7 days',
    heroLabel: 'Profile views',
    heroValue: currentViews,
    heroDeltaLabel: formatDeltaLabel(currentViews, priorWeekViews),
    statTiles: [
      {
        label: 'Unique fans',
        value: uniqueUsers,
      },
      {
        label: 'Subscribed fans',
        value: subscribers,
        hint: buildCaptureRateHint(subscribers, uniqueUsers),
      },
      {
        label: 'Link clicks',
        value: totalClicks,
      },
      {
        label: 'Listen clicks',
        value: listenClicks,
      },
    ],
    chatPrompt: 'Ask Jovie about my audience trends and who is engaging most.',
  };
}
