'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { ClipboardList } from 'lucide-react';
import { useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  type ContextMenuItemType,
  UnifiedTable,
  useRowSelection,
} from '@/components/organisms/table';
import { copyToClipboard } from '@/hooks/useClipboard';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import { TABLE_MIN_WIDTHS, TABLE_ROW_HEIGHTS } from '@/lib/constants/layout';
import type { WaitlistTableProps } from './types';
import { useApproveEntry } from './useApproveEntry';
import {
  createActionsCellRenderer,
  createSelectCellRenderer,
  createSelectHeaderRenderer,
  renderDateCellWrapper,
  renderEmailCell,
  renderHeardAboutCell,
  renderNameCell,
  renderPrimaryGoalCell,
  renderPrimarySocialCell,
  renderSpotifyCell,
  renderStatusCell,
} from './utils/column-renderers';
import { buildContextMenuItems } from './utils/context-menu-builders';

const columnHelper = createColumnHelper<WaitlistEntryRow>();

// Status display labels for grouping
const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  invited: 'Invited',
  claimed: 'Claimed',
};

export function AdminWaitlistTableUnified({
  entries,
  pageSize,
  total,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  groupingEnabled = false,
  externalSelection,
}: WaitlistTableProps) {
  const { approveEntry } = useApproveEntry({
    onRowUpdate: () => {
      // No-op for now since we're using server-side refresh
    },
  });

  // Row selection - use external selection if provided, otherwise use internal
  const rowIds = useMemo(() => entries.map(entry => entry.id), [entries]);
  const internalSelection = useRowSelection(rowIds);

  // Use external selection if provided, otherwise use internal
  const { selectedIds, headerCheckboxState, toggleSelect, toggleSelectAll } =
    externalSelection
      ? {
          selectedIds: externalSelection.selectedIds,
          headerCheckboxState: externalSelection.headerCheckboxState,
          toggleSelect: externalSelection.toggleSelect,
          toggleSelectAll: externalSelection.toggleSelectAll,
        }
      : internalSelection;

  // Row selection state for TanStack Table
  const rowSelection = useMemo(() => {
    return Object.fromEntries(Array.from(selectedIds).map(id => [id, true]));
  }, [selectedIds]);

  // Refs for selection state to avoid column recreation on every selection change
  const selectedIdsRef = useRef(selectedIds);
  // eslint-disable-next-line react-hooks/refs -- stable ref read for TanStack Table column def
  selectedIdsRef.current = selectedIds;
  const headerCheckboxStateRef = useRef(headerCheckboxState);
  // eslint-disable-next-line react-hooks/refs -- stable ref read for TanStack Table column def
  headerCheckboxStateRef.current = headerCheckboxState;

  // Helper to copy to clipboard with toast feedback
  const safeCopyToClipboard = useCallback((text: string, label: string) => {
    void copyToClipboard(text).then(ok => {
      if (ok) {
        toast.success(`${label} copied`, { duration: 2000 });
      } else {
        toast.error(`Failed to copy ${label}`);
      }
    });
  }, []);

  // Create context menu items for a waitlist entry
  const createContextMenuItems = useCallback(
    (entry: WaitlistEntryRow): ContextMenuItemType[] => {
      return buildContextMenuItems(entry, safeCopyToClipboard, approveEntry);
    },
    [approveEntry, safeCopyToClipboard]
  );

  // Define columns using TanStack Table
  // Note: selectedIds and headerCheckboxState use refs to prevent column recreation on selection change
  const columns = useMemo<ColumnDef<WaitlistEntryRow, any>[]>(
    () => [
      // Checkbox column
      columnHelper.display({
        id: 'select',
        /* eslint-disable react-hooks/refs -- stable ref read for TanStack Table column def */
        header: createSelectHeaderRenderer(
          headerCheckboxStateRef,
          toggleSelectAll
        ),
        cell: createSelectCellRenderer(selectedIdsRef, toggleSelect),
        /* eslint-enable react-hooks/refs */
        size: 56, // 14 * 4 = 56px (w-14)
      }),

      // Name column
      columnHelper.accessor('fullName', {
        id: 'name',
        header: 'Name',
        cell: ({ getValue }) => renderNameCell(getValue()),
        size: 180,
      }),

      // Email column
      columnHelper.accessor('email', {
        id: 'email',
        header: 'Email',
        cell: ({ getValue }) => renderEmailCell(getValue()),
        size: 220,
      }),

      // Primary Goal column
      columnHelper.accessor('primaryGoal', {
        id: 'primaryGoal',
        header: 'Primary goal',
        cell: ({ getValue }) => renderPrimaryGoalCell(getValue()),
        size: 140,
      }),

      // Primary Social column
      columnHelper.display({
        id: 'primarySocial',
        header: 'Primary Social',
        cell: ({ row }) => renderPrimarySocialCell(row.original),
        size: 280,
      }),

      // Spotify column
      columnHelper.display({
        id: 'spotify',
        header: 'Spotify',
        cell: ({ row }) => renderSpotifyCell(row.original),
        size: 200,
      }),

      // Heard About column
      columnHelper.accessor('heardAbout', {
        id: 'heardAbout',
        header: 'Heard About',
        cell: ({ getValue }) => renderHeardAboutCell(getValue()),
        size: 160,
      }),

      // Status column
      columnHelper.accessor('status', {
        id: 'status',
        header: 'Status',
        cell: ({ getValue }) => renderStatusCell(getValue()),
        size: 110,
      }),

      // Created Date column
      columnHelper.accessor('createdAt', {
        id: 'created',
        header: 'Created',
        cell: ({ getValue }) => renderDateCellWrapper(getValue()),
        size: 160,
      }),

      // Actions column - shows ellipsis menu with SAME items as right-click context menu
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: createActionsCellRenderer(createContextMenuItems),
        size: 48,
      }),
    ],
    [
      createContextMenuItems,
      // Note: headerCheckboxState and selectedIds are intentionally excluded
      // - they use refs to prevent column recreation on selection change
      toggleSelectAll,
      toggleSelect,
    ]
  );

  // Get row className - uses unified hover token
  const getRowClassName = useCallback(() => {
    return 'group bg-transparent hover:bg-(--linear-row-hover)';
  }, []);

  // Render unified table with optional grouping
  return (
    <UnifiedTable
      data={entries}
      columns={columns}
      isLoading={false}
      getContextMenuItems={createContextMenuItems}
      emptyState={
        <div className='px-4 py-10 text-center text-sm text-secondary-token flex flex-col items-center gap-3'>
          <ClipboardList className='h-6 w-6' />
          <div>
            <div className='font-medium'>No waitlist entries</div>
            <div className='text-xs'>
              New waitlist signups will appear here.
            </div>
          </div>
        </div>
      }
      getRowId={row => row.id}
      getRowClassName={getRowClassName}
      enableVirtualization={true}
      rowHeight={TABLE_ROW_HEIGHTS.STANDARD}
      overscan={5}
      minWidth={`${TABLE_MIN_WIDTHS.LARGE}px`}
      className='text-[12.5px] [&_thead_th]:py-1 [&_thead_th]:text-3xs [&_thead_th]:tracking-[0.07em]'
      rowSelection={rowSelection}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onLoadMore={onLoadMore}
      groupingConfig={
        groupingEnabled
          ? {
              getGroupKey: entry => entry.status,
              getGroupLabel: key => STATUS_LABELS[key] || key,
            }
          : undefined
      }
    />
  );
}
