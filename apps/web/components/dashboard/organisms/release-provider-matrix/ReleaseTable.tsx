'use client';

import {
  type ColumnDef,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import {
  AvailabilityCell,
  ReleaseCell,
  SmartLinkCell,
} from '@/components/dashboard/organisms/releases/cells';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  DateCell,
  TableCheckboxCell,
  UnifiedTable,
  useRowSelection,
} from '@/components/organisms/table';
import {
  RELEASE_TABLE_WIDTHS,
  TABLE_ROW_HEIGHTS,
} from '@/lib/constants/layout';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';

interface ProviderConfig {
  label: string;
  accent: string;
}

interface ReleaseTableProps {
  releases: ReleaseViewModel[];
  primaryProviders: ProviderKey[];
  providerConfig: Record<ProviderKey, ProviderConfig>;
  artistName?: string | null;
  onCopy: (path: string, label: string, testId: string) => Promise<string>;
  onEdit: (release: ReleaseViewModel) => void;
  onAddUrl?: (
    releaseId: string,
    provider: ProviderKey,
    url: string
  ) => Promise<void>;
  onSync: () => void;
  isAddingUrl?: boolean;
  isSyncing?: boolean;
  /** Selected release IDs (controlled from parent) */
  selectedIds?: Set<string>;
  /** Callback when selection changes */
  onSelectionChange?: (selectedIds: Set<string>) => void;
}

const columnHelper = createColumnHelper<ReleaseViewModel>();

/**
 * ReleaseTable - Releases table using UnifiedTable
 *
 * Features:
 * - Consolidated availability column showing all providers in a popover
 * - Sortable title and release date columns
 * - Context menu for edit, copy, sync, delete actions
 * - Actions column with ellipsis menu
 * - Uses extracted cell components (ReleaseCell, SmartLinkCell, AvailabilityCell)
 */
export function ReleaseTable({
  releases,
  primaryProviders: _primaryProviders,
  providerConfig,
  artistName,
  onCopy,
  onEdit,
  onAddUrl,
  onSync,
  isAddingUrl,
  isSyncing,
  selectedIds: externalSelectedIds,
  onSelectionChange,
}: ReleaseTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'releaseDate', desc: true },
  ]);

  // Row selection - use external selection if provided, otherwise use internal
  const rowIds = useMemo(() => releases.map(r => r.id), [releases]);
  const internalSelection = useRowSelection(rowIds);

  const selectedIds = externalSelectedIds ?? internalSelection.selectedIds;
  const headerCheckboxState =
    externalSelectedIds !== undefined
      ? selectedIds.size === 0
        ? false
        : selectedIds.size === releases.length
          ? true
          : 'indeterminate'
      : internalSelection.headerCheckboxState;

  const toggleSelect = (id: string) => {
    if (onSelectionChange) {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      onSelectionChange(newSet);
    } else {
      internalSelection.toggleSelect(id);
    }
  };

  const toggleSelectAll = () => {
    if (onSelectionChange) {
      if (selectedIds.size === releases.length) {
        onSelectionChange(new Set());
      } else {
        onSelectionChange(new Set(releases.map(r => r.id)));
      }
    } else {
      internalSelection.toggleSelectAll();
    }
  };

  // Build dynamic column definitions
  const columns = useMemo(() => {
    const checkboxColumn = columnHelper.display({
      id: 'select',
      header: ({ table }) => (
        <TableCheckboxCell
          table={table}
          headerCheckboxState={headerCheckboxState}
          onToggleSelectAll={toggleSelectAll}
        />
      ),
      cell: ({ row }) => {
        const release = row.original;
        const isChecked = selectedIds.has(release.id);
        const rowNumber = row.index + 1;

        return (
          <TableCheckboxCell
            row={row}
            rowNumber={rowNumber}
            isChecked={isChecked}
            onToggleSelect={() => toggleSelect(release.id)}
          />
        );
      },
      size: 56,
    });

    const baseColumns = [
      // Release column (artwork + title + artist)
      columnHelper.accessor('title', {
        id: 'release',
        header: 'Release',
        cell: ({ row }) => (
          <ReleaseCell release={row.original} artistName={artistName} />
        ),
        size: 220,
        enableSorting: true,
      }),

      // Release date column (sortable)
      columnHelper.accessor('releaseDate', {
        id: 'releaseDate',
        header: 'Released',
        cell: ({ getValue }) => {
          const date = getValue();
          return date ? (
            <DateCell
              date={new Date(date)}
              formatOptions={{ year: 'numeric' }}
              tooltipFormatOptions={{
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }}
            />
          ) : (
            <span className='text-xs text-tertiary-token'>TBD</span>
          );
        },
        size: 70,
        enableSorting: true,
      }),

      // Smart link column
      columnHelper.display({
        id: 'smartLink',
        header: 'Smart link',
        cell: ({ row }) => (
          <SmartLinkCell release={row.original} onCopy={onCopy} />
        ),
        size: 180,
      }),
    ];

    // All provider keys for the availability cell
    const allProviders = Object.keys(providerConfig) as ProviderKey[];

    // Single availability column showing all providers
    const availabilityColumn = columnHelper.display({
      id: 'availability',
      header: 'Availability',
      cell: ({ row }) => (
        <AvailabilityCell
          release={row.original}
          allProviders={allProviders}
          providerConfig={providerConfig}
          onCopy={onCopy}
          onAddUrl={onAddUrl}
          isAddingUrl={isAddingUrl}
        />
      ),
      size: 120,
    });

    // Actions column with ellipsis menu
    const actionsColumn = columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const contextMenuItems = getContextMenuItems(row.original);
        const actionMenuItems = convertContextMenuItems(contextMenuItems);

        return (
          <div className='flex items-center justify-end'>
            <TableActionMenu items={actionMenuItems} align='end' />
          </div>
        );
      },
      size: 60,
    });

    return [checkboxColumn, ...baseColumns, availabilityColumn, actionsColumn];
  }, [
    providerConfig,
    artistName,
    onCopy,
    onAddUrl,
    isAddingUrl,
    headerCheckboxState,
    selectedIds,
  ]);

  // Context menu items for right-click
  const getContextMenuItems = (
    release: ReleaseViewModel
  ): ContextMenuItemType[] => {
    return [
      {
        id: 'edit',
        label: 'Edit links',
        icon: <Icon name='PencilLine' className='h-3.5 w-3.5' />,
        onClick: () => onEdit(release),
      },
      {
        id: 'copy-smart-link',
        label: 'Copy smart link',
        icon: <Icon name='Link2' className='h-3.5 w-3.5' />,
        onClick: () => {
          void onCopy(
            release.smartLinkPath,
            `${release.title} smart link`,
            `smart-link-copy-${release.id}`
          );
        },
      },
      { type: 'separator' as const },
      {
        id: 'sync-release',
        label: 'Sync from Spotify',
        icon: (
          <Icon
            name={isSyncing ? 'Loader2' : 'RefreshCw'}
            className='h-3.5 w-3.5'
          />
        ),
        onClick: () => onSync(),
        disabled: isSyncing,
      },
      { type: 'separator' as const },
      {
        id: 'delete',
        label: 'Delete release',
        icon: <Icon name='Trash2' className='h-3.5 w-3.5' />,
        destructive: true,
        onClick: () => {
          // TODO: Implement delete functionality
        },
        disabled: true, // Placeholder for future deletion feature
      },
    ];
  };

  // Fixed min width - availability column consolidates all providers
  const minWidth = `${RELEASE_TABLE_WIDTHS.BASE + RELEASE_TABLE_WIDTHS.PROVIDER_COLUMN}px`;

  return (
    <UnifiedTable
      data={releases}
      columns={columns as ColumnDef<ReleaseViewModel, unknown>[]}
      sorting={sorting}
      onSortingChange={setSorting}
      getContextMenuItems={getContextMenuItems}
      onRowClick={onEdit}
      getRowId={row => row.id}
      getRowClassName={() => 'group hover:bg-surface-2/50'}
      enableVirtualization={false} // Low row count, no need for virtualization
      rowHeight={TABLE_ROW_HEIGHTS.STANDARD}
      minWidth={minWidth}
      className='text-[13px]'
    />
  );
}
