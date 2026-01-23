'use client';

import {
  type ColumnDef,
  createColumnHelper,
  type RowSelectionState,
} from '@tanstack/react-table';
import { ClipboardList } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import {
  type ContextMenuItemType,
  UnifiedTable,
  useRowSelection,
} from '@/components/organisms/table';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
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
  page,
  pageSize,
  total,
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
  const {
    selectedIds,
    headerCheckboxState,
    toggleSelect,
    toggleSelectAll,
    setSelection,
  } = externalSelection
    ? {
        selectedIds: externalSelection.selectedIds,
        headerCheckboxState: externalSelection.headerCheckboxState,
        toggleSelect: externalSelection.toggleSelect,
        toggleSelectAll: externalSelection.toggleSelectAll,
        setSelection: internalSelection.setSelection, // Keep internal for compatibility
      }
    : internalSelection;

  // Row selection state for TanStack Table
  const rowSelection = useMemo(() => {
    return Object.fromEntries(Array.from(selectedIds).map(id => [id, true]));
  }, [selectedIds]);

  const handleRowSelectionChange = useCallback(
    (
      updaterOrValue:
        | RowSelectionState
        | ((old: RowSelectionState) => RowSelectionState)
    ) => {
      const newSelection =
        typeof updaterOrValue === 'function'
          ? updaterOrValue(rowSelection)
          : updaterOrValue;

      // Convert TanStack RowSelectionState (object) to Set of selected IDs
      const newSelectedIds = new Set(
        Object.entries(newSelection)
          .filter(([, selected]) => selected)
          .map(([id]) => id)
      );

      // Directly update selection state with new Set
      // This handles individual row selections efficiently in a single update
      setSelection(newSelectedIds);
    },
    [rowSelection, setSelection]
  );

  // Helper to copy to clipboard
  const copyToClipboard = useCallback((text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    // Note: Silent copy - toast notifications can be added in future PR
  }, []);

  // Create context menu items for a waitlist entry
  const createContextMenuItems = useCallback(
    (entry: WaitlistEntryRow): ContextMenuItemType[] => {
      return buildContextMenuItems(entry, copyToClipboard, approveEntry);
    },
    [approveEntry, copyToClipboard]
  );

  // Define columns using TanStack Table
  const columns = useMemo<ColumnDef<WaitlistEntryRow, any>[]>(
    () => [
      // Checkbox column
      columnHelper.display({
        id: 'select',
        header: createSelectHeaderRenderer(
          headerCheckboxState,
          toggleSelectAll
        ),
        cell: createSelectCellRenderer(
          selectedIds,
          page,
          pageSize,
          toggleSelect
        ),
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
      columnHelper.accessor('spotifyUrlNormalized', {
        id: 'spotify',
        header: 'Spotify',
        cell: ({ getValue }) => renderSpotifyCell(getValue()),
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
      headerCheckboxState,
      toggleSelectAll,
      selectedIds,
      toggleSelect,
      page,
      pageSize,
    ]
  );

  // Get row className - uses unified hover token
  const getRowClassName = useCallback(() => {
    return 'group hover:bg-surface-2/50';
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
      minWidth={`${TABLE_MIN_WIDTHS.LARGE}px`}
      className='text-[13px]'
      rowSelection={rowSelection}
      onRowSelectionChange={handleRowSelectionChange}
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
