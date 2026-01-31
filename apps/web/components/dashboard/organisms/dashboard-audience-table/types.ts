import type { AudienceMode } from '@/components/dashboard/audience/table/types';
import type { AudienceMember } from '@/types';

export type { AudienceMode };

export type AudienceRow = AudienceMember;

export interface DashboardAudienceTableProps {
  readonly mode: AudienceMode;
  readonly rows: AudienceRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: string;
  readonly direction: 'asc' | 'desc';
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (pageSize: number) => void;
  readonly onSortChange: (sort: string) => void;
  readonly profileUrl?: string;
}

export interface BulkAction {
  label: string;
  onClick: () => void;
  disabled: boolean;
}
