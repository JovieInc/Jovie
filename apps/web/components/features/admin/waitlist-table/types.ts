import type {
  WaitlistEntryRow,
  WaitlistIntegritySummary,
} from '@/lib/admin/types';

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
  readonly hasNextPage?: boolean;
  readonly isFetchingNextPage?: boolean;
  readonly onLoadMore?: () => void;
  readonly integrity?: WaitlistIntegritySummary;
  /** Reports the exact failure message alongside the error toast, so
   * storybook lanes can assert bulk-action failures (the harness's mock
   * pathname is a profile route, where FeedbackProvider mounts no
   * Toaster). */
  readonly onActionError?: (message: string) => void;
  // Optional external selection state (for bulk actions in parent)
  readonly externalSelection?: {
    readonly selectedIds: Set<string>;
    readonly headerCheckboxState: boolean | 'indeterminate';
    readonly toggleSelect: (id: string) => void;
    readonly toggleSelectAll: () => void;
  };
}

export type ApproveStatus =
  | 'idle'
  | 'approving'
  | 'disapproving'
  | 'success'
  | 'error';
