import type { ActivityRange } from '@/features/dashboard/organisms/dashboard-activity-feed/types';
import type { JovieWorkItem } from '@/lib/activity/jovie-work-feed';

export type { ActivityRange, JovieWorkItem };

export interface JovieWorkFeedProps {
  readonly profileId: string;
  readonly range?: ActivityRange;
}
