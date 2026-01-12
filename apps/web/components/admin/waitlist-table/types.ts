import type { WaitlistEntryRow } from '@/lib/admin/waitlist';

export interface Column<T> {
  id: string;
  header: string | React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  width?: string;
  hideOnMobile?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface WaitlistTableProps {
  entries: WaitlistEntryRow[];
  page: number;
  pageSize: number;
  total: number;
  groupingEnabled?: boolean;
}

export type ApproveStatus = 'idle' | 'loading' | 'success' | 'error';
