import type { AudienceMode } from '@/components/dashboard/audience/table/types';
import type { AudienceMember } from '@/types';

export type { AudienceMode };

export type AudienceView = 'all' | 'subscribers' | 'anonymous';

export type AudienceRow = AudienceMember;

/** Valid segment filter IDs */
export type AudienceSegment =
  | 'highIntent'
  | 'returning'
  | 'frequent'
  | 'recent24h';

/** Filter state for audience table — mirrors ReleaseFilters pattern */
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
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: string;
  readonly direction: 'asc' | 'desc';
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (pageSize: number) => void;
  readonly onSortChange: (sort: string) => void;
  readonly onViewChange: (view: AudienceView) => void;
  readonly onFiltersChange: (filters: AudienceFilters) => void;
  readonly profileUrl?: string;
  readonly profileId?: string;
  readonly subscriberCount: number;
  readonly filters: AudienceFilters;
}

export interface BulkAction {
  label: string;
  onClick: () => void;
  disabled: boolean;
}
