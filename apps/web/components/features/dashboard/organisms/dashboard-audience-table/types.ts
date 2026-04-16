import type { AudienceMode } from '@/features/dashboard/audience/table/types';
import type { TourDateForMatching } from '@/lib/utils/touring-city-match';
import type { AudienceMember } from '@/types';
import type { DashboardAnalyticsResponse } from '@/types/analytics';

export type { AudienceMode };

export type AudienceView = 'all' | 'identified' | 'anonymous';

export type AudienceRow = AudienceMember;

/** Valid segment filter IDs */
export type AudienceSegment =
  | 'highIntent'
  | 'returning'
  | 'frequent'
  | 'recent24h'
  | 'touringCity';

/** Filter state for audience table -- mirrors ReleaseFilters pattern */
export interface AudienceFilters {
  readonly segments: AudienceSegment[];
}

/** Default filter state */
export const DEFAULT_AUDIENCE_FILTERS: AudienceFilters = {
  segments: [],
};

export interface DashboardAudienceTableProps {
  readonly mode: AudienceMode;
  readonly view: AudienceView;
  readonly rows: AudienceRow[];
  /** Null when the per-page COUNT query was skipped for performance (JOV-1262, JOV-1264). */
  readonly total: number | null;
  readonly sort: string;
  readonly direction: 'asc' | 'desc';
  readonly onSortChange: (sort: string) => void;
  readonly onViewChange: (view: AudienceView) => void;
  readonly onFiltersChange: (filters: AudienceFilters) => void;
  readonly profileUrl?: string;
  readonly profileId?: string;
  /** Null when the identified COUNT query was skipped for performance (JOV-1262). */
  readonly subscriberCount: number | null;
  /** Null when the audience COUNT query was skipped for performance (JOV-1262). */
  readonly totalAudienceCount?: number | null;
  readonly filters: AudienceFilters;
  readonly hasNextPage?: boolean;
  readonly isFetchingNextPage?: boolean;
  readonly onLoadMore?: () => void;
  /** Upcoming tour dates for touring city flagging */
  readonly tourDates?: TourDateForMatching[];
  /** Overrides side effects for non-live mirrors like /demo. */
  readonly actionAdapter?: AudienceActionAdapter;
  /** Chooses which analytics drawer implementation to register. */
  readonly analyticsMode?: 'live' | 'static';
  /** Static analytics data for demo / mirrored surfaces. */
  readonly analyticsData?: DashboardAnalyticsResponse;
  /** Allows mirror routes to keep stable test ids without forking UI. */
  readonly analyticsSidebarTestId?: string;
  readonly analyticsTabbedCardTestId?: string;
  readonly testId?: string;
}

export interface BulkAction {
  label: string;
  onClick: () => void;
  disabled: boolean;
}

export interface AudienceActionAdapter {
  readonly onExportMember?: (member: AudienceMember) => void;
  readonly onBlockMember?: (member: AudienceMember) => void;
  readonly onViewProfile?: (member: AudienceMember) => void;
  readonly onSendNotification?: (member: AudienceMember) => void;
  readonly onSourceLinkAction?: (
    action: 'copy' | 'open' | 'download'
  ) => Promise<void> | void;
}
