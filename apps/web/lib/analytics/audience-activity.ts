/**
 * Whether an analytics window has anything worth charting, and the honest
 * sentence to show when it does not. Used by the audience analytics rail so a
 * new artist sees one designed empty state instead of a funnel of zeros.
 */

import type {
  AnalyticsRange,
  DashboardAnalyticsResponse,
} from '@/types/analytics';
import { getTimeRangeLabel } from './time-range';

type ActivityCounts = Pick<
  DashboardAnalyticsResponse,
  | 'profile_views'
  | 'unique_users'
  | 'subscribers'
  | 'total_clicks'
  | 'listen_clicks'
  | 'tip_link_visits'
>;

/** True when any audience count in the window is above zero. */
export function hasAudienceActivity(
  data: Partial<ActivityCounts> | null | undefined
): boolean {
  if (!data) return false;
  return [
    data.profile_views,
    data.unique_users,
    data.subscribers,
    data.total_clicks,
    data.listen_clicks,
    data.tip_link_visits,
  ].some(value => typeof value === 'number' && value > 0);
}

/** One sentence naming the window that had no visits. */
export function describeNoAudienceActivity(range: AnalyticsRange): string {
  const window =
    range === 'all'
      ? 'yet'
      : `in the ${getTimeRangeLabel(range, 'description').toLowerCase()}`;
  return `No one has opened your profile ${window}. Share your link and views, clicks and top sources show up here.`;
}
