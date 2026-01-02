import type { AudienceMode } from '@/components/dashboard/audience/table/types';
import type { AudienceMember } from '@/types';

export type { AudienceMode };

export type AudienceRow = AudienceMember;

export interface DashboardAudienceTableProps {
  mode: AudienceMode;
  rows: AudienceRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  direction: 'asc' | 'desc';
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortChange: (sort: string) => void;
  profileUrl?: string;
}

export interface BulkAction {
  label: string;
  onClick: () => void;
  disabled: boolean;
}
