import type {
  DashboardActivity,
  DashboardActivityIcon,
  DashboardActivityType,
} from '@/lib/activity/dashboard-feed';

export type ActivityRange = '7d' | '30d' | '90d';

/**
 * Activity types for the dashboard feed.
 * Currently supported: click, visit, subscribe
 * Future planned types: suggested_link, release (not yet implemented)
 */
export type ActivityType = DashboardActivityType;
export type ActivityIcon = DashboardActivityIcon;
export type Activity = DashboardActivity;

export interface DashboardActivityFeedProps {
  readonly profileId: string;
  readonly range?: ActivityRange;
}
