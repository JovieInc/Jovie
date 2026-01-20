'use client';

import {
  type ColumnDef,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import { DspProviderIcon } from '@/components/dashboard/atoms/DspProviderIcon';
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
import type { DspProviderId } from '@/lib/dsp-enrichment/types';

/**
 * Maps ProviderKey (discography) to DspProviderId (for icons).
 * Returns null for providers without DSP icons (bandcamp, beatport).
 */
const PROVIDER_TO_DSP: Record<ProviderKey, DspProviderId | null> = {
  spotify: 'spotify',
  apple_music: 'apple_music',
  youtube: 'youtube_music',
  soundcloud: 'soundcloud',
  deezer: 'deezer',
  tidal: 'tidal',
  amazon_music: 'amazon_music',
  bandcamp: null,
  beatport: null,
};

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
  const columns = useMemo(() => {
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

    // Dynamically add provider columns
    const providerColumns = primaryProviders.map(provider => {
      const dspId = PROVIDER_TO_DSP[provider];

      return columnHelper.display({
        id: provider,
        header: () => (
          <div className='flex items-center gap-2'>
            {dspId ? (
              <DspProviderIcon provider={dspId} size='sm' />
            ) : (
              <span
                className='h-4 w-4 shrink-0 rounded-full'
                style={{ backgroundColor: providerConfig[provider].accent }}
                aria-hidden='true'
              />
            )}
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
        size: 100,
      });
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
        },
        disabled: true, // Placeholder for future deletion feature
      },
    ];
  };

  // Calculate dynamic min width based on column count
  // Base: Release(220) + Released(70) + SmartLink(180) + Actions(60) = 530
  // + Provider columns (100 each)
  const minWidth = `${530 + primaryProviders.length * 100}px`;

  return (
    <UnifiedTable
      data={releases}
      columns={columns as ColumnDef<ReleaseViewModel, unknown>[]}
      sorting={sorting}
      onSortingChange={setSorting}
      getContextMenuItems={getContextMenuItems}
      onRowClick={onEdit}
      getRowId={row => row.id}
      enableVirtualization={false} // Low row count, no need for virtualization
      rowHeight={TABLE_ROW_HEIGHTS.STANDARD}
      minWidth={minWidth}
      className='text-[13px]'
    />
  );
}
