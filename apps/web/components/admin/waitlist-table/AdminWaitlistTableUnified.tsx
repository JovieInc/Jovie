'use client';

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from '@jovie/ui';
import {
  type ColumnDef,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  ClipboardList,
  ExternalLink,
  Mail,
  ShoppingBag,
  Ticket,
  TrendingUp,
  User,
} from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { DateCell } from '@/components/admin/table/atoms/DateCell';
import { TableCheckboxCell } from '@/components/admin/table/atoms/TableCheckboxCell';
import { GroupedTableBody } from '@/components/admin/table/molecules/GroupedTableBody';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
} from '@/components/admin/table/molecules/TableContextMenu';
import { UnifiedTable } from '@/components/admin/table/organisms/UnifiedTable';
import { useRowSelection } from '@/components/admin/table/useRowSelection';
import { useTableGrouping } from '@/components/admin/table/utils/useTableGrouping';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import { PlatformPill } from '@/components/dashboard/atoms/PlatformPill';
import type { WaitlistEntryRow } from '@/lib/admin/waitlist';
import {
  PLATFORM_LABELS,
  PRIMARY_GOAL_LABELS,
  STATUS_VARIANTS,
} from './constants';
import type { WaitlistTableProps } from './types';
import { useApproveEntry } from './useApproveEntry';

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
}: WaitlistTableProps) {
  const { approveEntry } = useApproveEntry({
    onRowUpdate: () => {
      // No-op for now since we're using server-side refresh
    },
  });

  // Row selection
  const rowIds = useMemo(() => entries.map(entry => entry.id), [entries]);
  const {
    selectedIds,
    headerCheckboxState,
    toggleSelect,
    toggleSelectAll,
    setSelection,
  } = useRowSelection(rowIds);

  // Row selection state for TanStack Table
  const rowSelection = useMemo(() => {
    return Object.fromEntries(Array.from(selectedIds).map(id => [id, true]));
  }, [selectedIds]);

  const handleRowSelectionChange = useCallback(
    (updaterOrValue: any) => {
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
    navigator.clipboard
      .writeText(text)
      .then(() => {
        // Could show a toast notification here
        console.log(`Copied ${label} to clipboard`);
      })
      .catch(err => {
        console.error('Failed to copy:', err);
      });
  }, []);

  // Create context menu items for a waitlist entry
  const createContextMenuItems = useCallback(
    (entry: WaitlistEntryRow): ContextMenuItemType[] => {
      const isApproved =
        entry.status === 'invited' || entry.status === 'claimed';

      return [
        {
          id: 'copy-email',
          label: 'Copy Email',
          icon: <Mail className='h-3.5 w-3.5' />,
          onClick: () => copyToClipboard(entry.email, 'email'),
        },
        {
          id: 'copy-name',
          label: 'Copy Name',
          icon: <User className='h-3.5 w-3.5' />,
          onClick: () => copyToClipboard(entry.fullName, 'name'),
        },
        {
          type: 'separator' as const,
        },
        {
          id: 'open-social',
          label: 'Open Primary Social',
          icon: <ExternalLink className='h-3.5 w-3.5' />,
          onClick: () => {
            window.open(entry.primarySocialUrlNormalized, '_blank');
          },
        },
        ...(entry.spotifyUrlNormalized
          ? [
              {
                id: 'open-spotify' as const,
                label: 'Open Spotify',
                icon: <ExternalLink className='h-3.5 w-3.5' />,
                onClick: () => {
                  window.open(entry.spotifyUrlNormalized!, '_blank');
                },
              },
            ]
          : []),
        {
          type: 'separator' as const,
        },
        {
          id: 'approve',
          label: isApproved ? 'Approved' : 'Approve',
          icon: <ClipboardList className='h-3.5 w-3.5' />,
          onClick: () => {
            if (!isApproved) {
              void approveEntry(entry.id);
            }
          },
          disabled: isApproved,
        },
      ];
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
        cell: ({ getValue }) => {
          const value = getValue();
          const primaryGoalLabel = value
            ? (PRIMARY_GOAL_LABELS[value] ?? value)
            : null;

          // Icon mapping for primary goals
          const GoalIcon =
            value === 'streams'
              ? TrendingUp
              : value === 'merch'
                ? ShoppingBag
                : value === 'tickets'
                  ? Ticket
                  : null;

          return primaryGoalLabel ? (
            <Badge size='sm' variant='secondary' className='gap-1'>
              {GoalIcon && <GoalIcon className='h-3 w-3' />}
              {primaryGoalLabel}
            </Badge>
          ) : (
            <span className='text-tertiary-token'>—</span>
          );
        },
        size: 140,
      }),

      // Primary Social column
      columnHelper.display({
        id: 'primarySocial',
        header: 'Primary Social',
        cell: ({ row }) => {
          const entry = row.original;
          const platformLabel =
            PLATFORM_LABELS[entry.primarySocialPlatform] ??
            entry.primarySocialPlatform;

          // Extract username from URL for display
          const urlWithoutProtocol = entry.primarySocialUrlNormalized.replace(
            /^https?:\/\//,
            ''
          );
          const username =
            urlWithoutProtocol.split('/').pop() || urlWithoutProtocol;

          return (
            <PlatformPill
              platformIcon={entry.primarySocialPlatform.toLowerCase()}
              platformName={platformLabel}
              primaryText={`@${username}`}
              onClick={() =>
                window.open(entry.primarySocialUrlNormalized, '_blank')
              }
            />
          );
        },
        size: 280,
      }),

      // Spotify column
      columnHelper.accessor('spotifyUrlNormalized', {
        id: 'spotify',
        header: 'Spotify',
        cell: ({ getValue }) => {
          const value = getValue();
          if (!value) {
            return <span className='text-tertiary-token'>—</span>;
          }

          // Extract artist name from Spotify URL
          const urlWithoutProtocol = value.replace(/^https?:\/\//, '');
          const artistName = urlWithoutProtocol.split('/').pop() || 'Spotify';

          return (
            <PlatformPill
              platformIcon='spotify'
              platformName='Spotify'
              primaryText={`@${artistName}`}
              onClick={() => window.open(value, '_blank')}
            />
          );
        },
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
        cell: ({ getValue }) => {
          const status = getValue();
          const statusVariant = STATUS_VARIANTS[status] ?? 'secondary';
          return (
            <Badge size='sm' variant={statusVariant}>
              {status}
            </Badge>
          );
        },
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

  // Initialize TanStack Table for grouping view
  const table = useReactTable({
    data: entries,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: row => row.id,
  });

  // Get row className
  const getRowClassName = useCallback(() => {
    return 'group hover:bg-base dark:hover:bg-surface-2';
  }, []);

  // Grouping logic
  const { groupedData, observeGroupHeader } = useTableGrouping({
    data: entries,
    getGroupKey: entry => entry.status,
    getGroupLabel: key => STATUS_LABELS[key] || key,
    enabled: groupingEnabled,
  });

  // If grouping is enabled, render grouped table directly
  // Note: Row selection is intentionally disabled in grouped view for UX simplicity
  if (groupingEnabled) {
    return (
      <div className='overflow-auto'>
        <table
          className='w-full border-separate border-spacing-0 text-[13px]'
          style={{ minWidth: '1100px' }}
        >
          <caption className='sr-only'>
            Waitlist entries grouped by status
          </caption>

          {/* Header */}
          <thead>
            <tr>
              {table.getHeaderGroups()[0]?.headers.map(header => (
                <th
                  key={header.id}
                  className='sticky top-0 z-20 border-b border-subtle bg-base/95 backdrop-blur-sm px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-tertiary-token'
                  style={{
                    width:
                      header.getSize() !== 150 ? header.getSize() : undefined,
                  }}
                >
                  {header.isPlaceholder
                    ? null
                    : // Skip rendering checkbox header in grouped view
                      header.id === 'select'
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                </th>
              ))}
            </tr>
          </thead>

          {/* Grouped Body */}
          <GroupedTableBody
            groupedData={groupedData}
            observeGroupHeader={observeGroupHeader}
            columns={columns.length}
            renderRow={(entry, index) => {
              const row = table
                .getRowModel()
                .rows.find(r => r.original.id === entry.id);
              if (!row) return null;

              return (
                <tr key={entry.id} className={getRowClassName()}>
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      className='border-b border-subtle px-4 py-3 text-secondary-token'
                    >
                      {/* Skip rendering checkbox cells in grouped view */}
                      {cell.column.id === 'select'
                        ? null
                        : flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                    </td>
                  ))}
                </tr>
              );
            }}
          />
        </table>
      </div>
    );
  }

  // Default ungrouped table view
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
    />
  );
}
