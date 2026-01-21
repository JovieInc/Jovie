export type ActivityRange = '7d' | '30d' | '90d';

/**
 * Activity types for the dashboard feed.
 * Currently supported: click, visit, subscribe
 * Future planned types: suggested_link, release (not yet implemented)
 */
export type ActivityType =
  | 'click'
  | 'visit'
  | 'subscribe'
  // Future types (planned, not yet implemented):
  // | 'suggested_link'
  // | 'release'
  | 'unknown';

export interface Activity {
  id: string;
  type: ActivityType;
  description: string;
  icon: string;
  timestamp: string;
  /** Navigation URL for when the activity item is clicked */
  href?: string;
}

export interface DashboardActivityFeedProps {
  profileId: string;
  range?: ActivityRange;
}
