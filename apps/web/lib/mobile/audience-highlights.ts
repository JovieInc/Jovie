import { readAuthorizedDashboardAnalytics } from '@/lib/analytics/authorized-read';
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
  const [currentWeek, priorWindow] = await Promise.all([
    readAuthorizedDashboardAnalytics({
      userId: clerkUserId,
      range: '7d',
      view: 'traffic',
    }),
    readAuthorizedDashboardAnalytics({
      userId: clerkUserId,
      range: '30d',
      view: 'traffic',
    }),
  ]);

  const currentViews = currentWeek.analytics.profile_views ?? 0;
  const priorViews = priorWindow.analytics.profile_views ?? 0;
  const windowsDiffer = priorWindow.range !== currentWeek.range;
  const trailingViews = windowsDiffer
    ? Math.max(0, priorViews - currentViews)
    : 0;
  const priorWeekViews = Math.round(trailingViews / 3);
  const heroDeltaLabel = windowsDiffer
    ? formatDeltaLabel(currentViews, priorWeekViews)
    : null;

  const uniqueUsers = currentWeek.analytics.unique_users ?? 0;
  const subscribers = currentWeek.analytics.subscribers ?? 0;
  const totalClicks = currentWeek.analytics.total_clicks ?? 0;
  const listenClicks = currentWeek.analytics.listen_clicks ?? 0;

  return {
    rangeLabel: 'Last 7 days',
    heroLabel: 'Profile views',
    heroValue: currentViews,
    heroDeltaLabel,
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
