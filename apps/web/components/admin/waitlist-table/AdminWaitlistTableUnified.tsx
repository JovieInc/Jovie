'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import {
  type ColumnDef,
  createColumnHelper,
  type RowSelectionState,
} from '@tanstack/react-table';
import { ClipboardList } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { TableCheckboxCell } from '@/components/admin/table/atoms/TableCheckboxCell';
import { useRowSelection } from '@/components/admin/table/useRowSelection';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  DateCell,
  UnifiedTable,
} from '@/components/organisms/table';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';
import type { WaitlistTableProps } from './types';
import { useApproveEntry } from './useApproveEntry';
import {
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
        header: ({ table }) => (
          <TableCheckboxCell
            table={table}
            headerCheckboxState={headerCheckboxState}
            onToggleSelectAll={toggleSelectAll}
          />
        ),
        cell: ({ row }) => {
          const entry = row.original;
          const isChecked = selectedIds.has(entry.id);
          const rowNumber = (page - 1) * pageSize + row.index + 1;

          return (
            <TableCheckboxCell
              row={row}
              rowNumber={rowNumber}
              isChecked={isChecked}
              onToggleSelect={() => toggleSelect(entry.id)}
            />
          );
        },
        size: 56, // 14 * 4 = 56px (w-14)
      }),

      // Name column
      columnHelper.accessor('fullName', {
        id: 'name',
        header: 'Name',
        cell: ({ getValue }) => (
          <span className='font-medium text-primary-token'>{getValue()}</span>
        ),
        size: 180,
      }),

      // Email column
      columnHelper.accessor('email', {
        id: 'email',
        header: 'Email',
        cell: ({ getValue }) => (
          <a
            href={`mailto:${getValue()}`}
            className='text-secondary-token hover:underline'
          >
            {getValue()}
          </a>
        ),
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
        cell: ({ getValue }) => {
          const value = getValue();
          const heardAboutTruncated =
            value && value.length > 30 ? value.slice(0, 30) + '…' : value;
          return value ? (
            value.length > 30 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className='cursor-help text-secondary-token'>
                    {heardAboutTruncated}
                  </span>
                </TooltipTrigger>
                <TooltipContent side='top' className='max-w-xs'>
                  {value}
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className='text-secondary-token'>{value}</span>
            )
          ) : (
            <span className='text-tertiary-token'>—</span>
          );
        },
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
        cell: ({ getValue }) => {
          return <DateCell date={getValue()} />;
        },
        size: 160,
      }),

      // Actions column - shows ellipsis menu with SAME items as right-click context menu
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const entry = row.original;
          const contextMenuItems = createContextMenuItems(entry);
          const actionMenuItems = convertContextMenuItems(contextMenuItems);

          return (
            <div className='flex items-center justify-end'>
              <TableActionMenu items={actionMenuItems} align='end' />
            </div>
          );
        },
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

  // Get row className
  const getRowClassName = useCallback(() => {
    return 'group hover:bg-base dark:hover:bg-surface-2';
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
      rowHeight={52}
      minWidth='1100px'
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
