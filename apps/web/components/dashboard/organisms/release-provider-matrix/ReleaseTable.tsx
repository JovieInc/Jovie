'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { useCallback, useMemo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import {
  type ContextMenuItemType,
  UnifiedTable,
} from '@/components/organisms/table';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { TABLE_ROW_HEIGHTS } from '@/lib/constants/layout';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { buildUTMContext, getUTMShareContextMenuItems } from '@/lib/utm';
import { TrackRowsContainer } from './components';
import { useExpandedTracks } from './hooks/useExpandedTracks';
import { useSortingManager } from './hooks/useSortingManager';
import { MobileReleaseList } from './MobileReleaseList';
import {
  createExpandableReleaseCellRenderer,
  createReleaseCellRenderer,
  createRightMetaCellRenderer,
} from './utils/column-renderers';

interface ProviderConfig {
  label: string;
  readonly accent: string;
}

interface ReleaseTableProps {
  readonly releases: ReleaseViewModel[];
  readonly providerConfig: Record<ProviderKey, ProviderConfig>;
  readonly artistName?: string | null;
  readonly onCopy: (
    path: string,
    label: string,
    testId: string
  ) => Promise<string>;
  readonly onEdit: (release: ReleaseViewModel) => void;
  /** Column visibility state from preferences */
  readonly columnVisibility?: Record<string, boolean>;
  /** Row height from density preference */
  readonly rowHeight?: number;
  /** Callback when focused row changes via keyboard navigation */
  readonly onFocusedRowChange?: (release: ReleaseViewModel) => void;
  /** Whether to show expandable track rows for albums/EPs */
  readonly showTracks?: boolean;
  /** Group releases by year with sticky headers */
  readonly groupByYear?: boolean;
  /** Check if a release's smart link is locked behind the pro gate */
  readonly isSmartLinkLocked?: (releaseId: string) => boolean;
}

const columnHelper = createColumnHelper<ReleaseViewModel>();

const MetaHeaderCell = () => (
  <span className='sr-only'>Smart link, popularity, year</span>
);

/**
 * ReleaseTable - Releases table using UnifiedTable
 *
 * Features:
 * - Consolidated availability column showing all providers
 * - URL-persisted sorting via nuqs (shareable/bookmarkable)
 * - Debounced sorting for large datasets (>500 rows)
 * - Bulk actions and row selection
 * - Context menu for edit, copy actions
 */
export function ReleaseTable({
  releases,
  providerConfig,
  artistName,
  onCopy,
  onEdit,
  columnVisibility,
  rowHeight = TABLE_ROW_HEIGHTS.STANDARD,
  onFocusedRowChange,
  showTracks = false,
  groupByYear = false,
  isSmartLinkLocked,
}: ReleaseTableProps) {
  // Mobile detection - render list view on small screens
  const isMobile = useBreakpointDown('md');

  // Track expansion state (only used when showTracks is enabled)
  const {
    expandedReleaseIds,
    isExpanded,
    isLoading: isLoadingTracks,
    toggleExpansion,
    getTracksForRelease,
  } = useExpandedTracks();
  // Sorting with URL persistence and debouncing
  const { sorting, onSortingChange, isSorting, isLargeDataset } =
    useSortingManager({ rowCount: releases.length });

  // Context menu items for right-click
  const getContextMenuItems = useCallback(
    (release: ReleaseViewModel): ContextMenuItemType[] => {
      const menuIcon = (
        name: 'PencilLine' | 'Link2' | 'Hash' | 'ExternalLink' | 'Lock'
      ) => <Icon name={name} className='h-3.5 w-3.5' />;

      const locked = isSmartLinkLocked?.(release.id) ?? false;

      const items: ContextMenuItemType[] = [
        {
          id: 'edit',
          label: 'Edit links',
          icon: menuIcon('PencilLine'),
          onClick: () => onEdit(release),
        },
        ...(locked
          ? [
              {
                id: 'copy-smart-link',
                label: 'Smart link (Pro)',
                icon: menuIcon('Lock'),
                disabled: true,
                onClick: () => {},
              } as ContextMenuItemType,
            ]
          : [
              {
                id: 'copy-smart-link',
                label: 'Copy smart link',
                icon: menuIcon('Link2'),
                onClick: () => {
                  void onCopy(
                    release.smartLinkPath,
                    `${release.title} smart link`,
                    `smart-link-copy-${release.id}`
                  );
                },
              } as ContextMenuItemType,
              // UTM share presets
              ...getUTMShareContextMenuItems({
                smartLinkUrl: `${getBaseUrl()}${release.smartLinkPath}`,
                context: buildUTMContext({
                  smartLinkUrl: `${getBaseUrl()}${release.smartLinkPath}`,
                  releaseSlug: release.slug,
                  releaseTitle: release.title,
                  artistName,
                  releaseDate: release.releaseDate,
                }),
              }),
            ]),
        { type: 'separator' },
        {
          id: 'copy-release-id',
          label: 'Copy release ID',
          icon: menuIcon('Hash'),
          onClick: () => {
            navigator.clipboard.writeText(release.id);
          },
        },
      ];

      // Add UPC copy if available
      if (release.upc) {
        items.push({
          id: 'copy-upc',
          label: 'Copy UPC',
          icon: menuIcon('Hash'),
          onClick: () => {
            navigator.clipboard.writeText(release.upc!);
          },
        });
      }

      // Add ISRC copy if available
      if (release.primaryIsrc) {
        items.push({
          id: 'copy-isrc',
          label: 'Copy ISRC',
          icon: menuIcon('Hash'),
          onClick: () => {
            navigator.clipboard.writeText(release.primaryIsrc!);
          },
        });
      }

      // Add external link options for available providers
      const supportedProviders = new Set<ProviderKey>([
        'spotify',
        'apple_music',
        'youtube',
        'deezer',
      ]);
      const providerLabels: Partial<Record<ProviderKey, string>> = {
        spotify: 'Spotify',
        apple_music: 'Apple Music',
        youtube: 'YouTube Music',
        deezer: 'Deezer',
      };

      const externalProviders = release.providers.filter(
        p => supportedProviders.has(p.key) && p.url
      );

      if (externalProviders.length > 0) {
        items.push({ type: 'separator' });
        for (const provider of externalProviders) {
          items.push({
            id: `open-${provider.key}`,
            label: `Open in ${providerLabels[provider.key] || provider.key}`,
            icon: menuIcon('ExternalLink'),
            onClick: () => {
              globalThis.open(provider.url, '_blank', 'noopener,noreferrer');
            },
          });
        }
      }

      return items;
    },
    [onEdit, onCopy, artistName, isSmartLinkLocked]
  );

  // Stable callbacks for UnifiedTable props
  const getRowId = useCallback((row: ReleaseViewModel) => row.id, []);
  const getRowClassName = useCallback(
    (row: ReleaseViewModel) => {
      const isRowExpanded = showTracks && isExpanded(row.id);

      if (isRowExpanded) {
        return 'bg-surface-2/30 hover:bg-surface-2/50';
      }
      return 'hover:bg-surface-2/50';
    },
    [showTracks, isExpanded]
  );

  // Keyboard navigation callback - open sidebar for focused row
  const handleFocusedRowChange = useCallback(
    (index: number) => {
      // Guard against stale index when releases array changes
      if (index < 0 || index >= releases.length) return;
      const release = releases[index];
      if (release && onFocusedRowChange) {
        onFocusedRowChange(release);
      }
    },
    [releases, onFocusedRowChange]
  );

  // Get all providers for availability column and track row rendering
  const allProviders = useMemo(
    () => Object.keys(providerConfig) as ProviderKey[],
    [providerConfig]
  );

  // Build column definitions (catalog view)
  const columns = useMemo(() => {
    const releaseColumn = columnHelper.accessor('title', {
      id: 'release',
      header: 'Release',
      cell: showTracks
        ? createExpandableReleaseCellRenderer(
            artistName,
            isExpanded,
            isLoadingTracks,
            toggleExpansion
          )
        : createReleaseCellRenderer(artistName),
      minSize: 200,
      size: 9999, // Large value to make it flex and fill available space
      enableSorting: true,
    });

    const rightMetaColumn = columnHelper.display({
      id: 'meta',
      // NOSONAR S6478: TanStack Table header renderer prop, component already extracted
      header: MetaHeaderCell,
      cell: createRightMetaCellRenderer(isSmartLinkLocked),
      size: 300,
      minSize: 200,
      meta: { className: 'hidden sm:table-cell' },
    });

    return [releaseColumn, rightMetaColumn];
  }, [
    artistName,
    showTracks,
    isExpanded,
    isLoadingTracks,
    toggleExpansion,
    isSmartLinkLocked,
  ]);

  // Transform columnVisibility to TanStack format (always show release)
  const tanstackColumnVisibility = useMemo(() => {
    if (!columnVisibility) return undefined;
    return {
      ...columnVisibility,
      release: true,
    };
  }, [columnVisibility]);

  // No fixed minWidth - on mobile, hidden columns allow the table to fit naturally
  const minWidth = '0';

  // Check if any rows are expanded (affects virtualization)
  const hasExpandedRows = useMemo(() => {
    if (!showTracks) return false;
    return releases.some(r => isExpanded(r.id));
  }, [showTracks, releases, isExpanded]);

  // When showTracks is enabled and rows are expanded, disable virtualization
  // This allows dynamic row counts with track rows
  const shouldVirtualize = !showTracks || !hasExpandedRows;

  // Year grouping configuration
  const groupingConfig = useMemo(() => {
    if (!groupByYear) return undefined;
    return {
      getGroupKey: (release: ReleaseViewModel) => {
        if (!release.releaseDate) return 'Unknown';
        return new Date(release.releaseDate).getFullYear().toString();
      },
      getGroupLabel: (year: string) => year,
    };
  }, [groupByYear]);

  // Render expanded content for track rows
  const renderExpandedContent = useCallback(
    (release: ReleaseViewModel, columnCount: number) => {
      if (!showTracks) return null;

      const tracks = getTracksForRelease(release.id);
      if (!tracks) return null;

      return (
        <TrackRowsContainer
          tracks={tracks}
          providerConfig={providerConfig}
          allProviders={allProviders}
          columnCount={columnCount}
          columnVisibility={tanstackColumnVisibility}
        />
      );
    },
    [
      showTracks,
      getTracksForRelease,
      providerConfig,
      allProviders,
      tanstackColumnVisibility,
    ]
  );

  // Get expandable row ID (same as row ID for releases)
  const getExpandableRowId = useCallback(
    (release: ReleaseViewModel) => release.id,
    []
  );

  // Only pass expanded IDs when showTracks is enabled
  const expandedRowIds = showTracks ? expandedReleaseIds : undefined;

  // Mobile: render card-based list view instead of table
  if (isMobile) {
    if (releases.length === 0) {
      return (
        <div className='px-4 py-10 text-center text-sm text-secondary-token flex flex-col items-center gap-3'>
          <Icon name='Disc3' className='h-6 w-6' />
          <div>
            <div className='font-medium'>No releases</div>
            <div className='text-xs'>
              Your releases will appear here once synced.
            </div>
          </div>
        </div>
      );
    }

    return (
      <MobileReleaseList
        releases={releases}
        artistName={artistName}
        onEdit={onEdit}
        groupByYear={groupByYear}
      />
    );
  }

  return (
    <UnifiedTable
      data={releases}
      columns={columns as ColumnDef<ReleaseViewModel, unknown>[]}
      sorting={sorting}
      onSortingChange={onSortingChange}
      isLoading={isSorting && isLargeDataset}
      getContextMenuItems={getContextMenuItems}
      onRowClick={onEdit}
      getRowId={getRowId}
      getRowClassName={getRowClassName}
      enableVirtualization={shouldVirtualize && !groupByYear}
      rowHeight={rowHeight}
      minWidth={minWidth}
      className='text-[13px]'
      containerClassName='h-full'
      columnVisibility={tanstackColumnVisibility}
      onFocusedRowChange={handleFocusedRowChange}
      groupingConfig={groupingConfig}
      expandedRowIds={expandedRowIds}
      renderExpandedContent={showTracks ? renderExpandedContent : undefined}
      getExpandableRowId={getExpandableRowId}
      emptyState={
        <div className='px-4 py-10 text-center text-sm text-secondary-token flex flex-col items-center gap-3'>
          <Icon name='Disc3' className='h-6 w-6' />
          <div>
            <div className='font-medium'>No releases</div>
            <div className='text-xs'>
              Your releases will appear here once synced.
            </div>
          </div>
        </div>
      }
    />
  );
}
