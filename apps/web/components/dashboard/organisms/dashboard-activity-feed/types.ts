export type ActivityRange = '7d' | '30d' | '90d';

export interface Activity {
  id: string;
  description: string;
  icon: string;
  timestamp: string;
}

export interface DashboardActivityFeedProps {
  profileId: string;
  range?: ActivityRange;
}
