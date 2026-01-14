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
  ProviderCell,
  ReleaseCell,
  SmartLinkCell,
} from '@/components/dashboard/organisms/releases/cells';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  DateCell,
  UnifiedTable,
} from '@/components/organisms/table';
import { TABLE_ROW_HEIGHTS } from '@/lib/constants/layout';
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
}

const columnHelper = createColumnHelper<ReleaseViewModel>();

/**
 * ReleaseTable - Releases table using UnifiedTable with dynamic columns
 *
 * Features:
 * - Dynamic provider columns based on primaryProviders prop
 * - Sortable title and release date columns
 * - Context menu for edit, copy, sync, delete actions
 * - Actions column with ellipsis menu
 * - Uses extracted cell components (ReleaseCell, SmartLinkCell, ProviderCell)
 */
export function ReleaseTable({
  releases,
  primaryProviders,
  providerConfig,
  artistName,
  onCopy,
  onEdit,
  onAddUrl,
  onSync,
  isAddingUrl,
  isSyncing,
}: ReleaseTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'releaseDate', desc: true },
  ]);

  // Build dynamic column definitions
  const columns = useMemo<ColumnDef<ReleaseViewModel, unknown>[]>(() => {
    const baseColumns: ColumnDef<ReleaseViewModel, unknown>[] = [
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
            <DateCell date={new Date(date)} />
          ) : (
            <span className='text-xs text-tertiary-token'>TBD</span>
          );
        },
        size: 120,
        enableSorting: true,
      }),

      // Smart link column
      columnHelper.display({
        id: 'smartLink',
        header: 'Smart link',
        cell: ({ row }) => (
          <SmartLinkCell release={row.original} onCopy={onCopy} />
        ),
        size: 140,
      }),
    ];

    // Dynamically add provider columns
    const providerColumns = primaryProviders.map(provider =>
      columnHelper.display({
        id: provider,
        header: () => (
          <div className='flex items-center gap-2'>
            <span
              className='h-2 w-2 shrink-0 rounded-full'
              style={{ backgroundColor: providerConfig[provider].accent }}
              aria-hidden='true'
            />
            <span className='line-clamp-1'>
              {providerConfig[provider].label}
            </span>
          </div>
        ),
        cell: ({ row }) => (
          <ProviderCell
            release={row.original}
            provider={provider}
            config={providerConfig[provider]}
            onCopy={onCopy}
            onAddUrl={onAddUrl}
            isAddingUrl={isAddingUrl}
          />
        ),
        size: 140,
      })
    );

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
      size: 100,
    });

    return [...baseColumns, ...providerColumns, actionsColumn];
  }, [
    primaryProviders,
    providerConfig,
    artistName,
    onCopy,
    onAddUrl,
    isAddingUrl,
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
          console.log('Delete release:', release.id);
        },
        disabled: true, // Placeholder for future deletion feature
      },
    ];
  };

  // Calculate dynamic min width based on column count
  const minWidth = `${800 + primaryProviders.length * 140}px`;

  return (
    <UnifiedTable
      data={releases}
      columns={columns}
      sorting={sorting}
      onSortingChange={setSorting}
      getContextMenuItems={getContextMenuItems}
      onRowClick={onEdit}
      getRowId={row => row.id}
      getRowClassName={(_, index) =>
        index !== releases.length - 1 ? 'border-b border-subtle' : ''
      }
      enableVirtualization={false} // Low row count, no need for virtualization
      rowHeight={TABLE_ROW_HEIGHTS.STANDARD}
      minWidth={minWidth}
      className='text-[13px]'
    />
  );
}
