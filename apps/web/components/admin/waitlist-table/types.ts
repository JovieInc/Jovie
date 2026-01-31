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
  readonly entries: WaitlistEntryRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly groupingEnabled?: boolean;
  // Optional external selection state (for bulk actions in parent)
  readonly externalSelection?: {
    readonly selectedIds: Set<string>;
    readonly headerCheckboxState: boolean | 'indeterminate';
    readonly toggleSelect: (id: string) => void;
    readonly toggleSelectAll: () => void;
  };
}

export type ApproveStatus = 'idle' | 'loading' | 'success' | 'error';
