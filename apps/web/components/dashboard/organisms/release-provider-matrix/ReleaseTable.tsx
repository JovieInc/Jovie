'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { useCallback, useMemo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import type { TrackSidebarData } from '@/components/organisms/release-sidebar';
import { UnifiedTable } from '@/components/organisms/table';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { TABLE_ROW_HEIGHTS } from '@/lib/constants/layout';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { TrackRowsContainer } from './components';
import { useExpandedTracks } from './hooks/useExpandedTracks';
import { useSortingManager } from './hooks/useSortingManager';
import { MobileReleaseList } from './MobileReleaseList';
import {
  createExpandableReleaseCellRenderer,
  createReleaseCellRenderer,
  createRightMetaCellRenderer,
} from './utils/column-renderers';
import { getReleaseContextMenuItems } from './utils/release-context-actions';

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
  /** Release currently being refreshed for loading shimmer feedback */
  readonly refreshingReleaseId?: string | null;
  /** Release that should briefly flash after refresh success */
  readonly flashedReleaseId?: string | null;
  /** Currently selected release ID for active row highlighting */
  readonly selectedReleaseId?: string | null;
  readonly selectedTrackId?: string | null;
  /** Check if a release's smart link is locked behind the pro gate */
  readonly isSmartLinkLocked?: (releaseId: string) => boolean;
  /** Get the reason a smartlink is locked ('scheduled' | 'cap' | null) */
  readonly getSmartLinkLockReason?: (
    releaseId: string
  ) => 'scheduled' | 'cap' | null;
  readonly onTrackClick?: (trackData: TrackSidebarData) => void;
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
  selectedReleaseId,
  selectedTrackId,
  refreshingReleaseId,
  flashedReleaseId,
  isSmartLinkLocked,
  getSmartLinkLockReason,
  onTrackClick,
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

  // Context menu items for right-click (shared with mobile swipe actions)
  const getContextMenuItems = useCallback(
    (release: ReleaseViewModel) =>
      getReleaseContextMenuItems({
        release,
        onEdit,
        onCopy,
        artistName,
        isSmartLinkLocked,
        getSmartLinkLockReason,
      }),
    [onEdit, onCopy, artistName, isSmartLinkLocked, getSmartLinkLockReason]
  );

  // Stable callbacks for UnifiedTable props
  const getRowId = useCallback((row: ReleaseViewModel) => row.id, []);
  const getRowClassName = useCallback(
    (row: ReleaseViewModel) => {
      const isRowExpanded = showTracks && isExpanded(row.id);
      const isSelected = selectedReleaseId === row.id;
      const isRefreshing = refreshingReleaseId === row.id;
      const isFlashed = flashedReleaseId === row.id;

      let baseClassName: string;
      if (isSelected) {
        baseClassName =
          'bg-(--linear-bg-surface-1) shadow-[inset_2px_0_0_0_var(--linear-border-focus),inset_0_0_0_1px_rgba(91,140,255,0.24)] hover:bg-(--linear-bg-surface-1)';
      } else if (isRowExpanded) {
        baseClassName =
          'bg-(--linear-bg-surface-1) hover:bg-(--linear-bg-surface-1)';
      } else {
        baseClassName =
          'bg-transparent hover:bg-(--linear-bg-surface-1) transition-colors duration-150 ease-out';
      }

      const refreshClassName = isRefreshing
        ? 'relative overflow-hidden skeleton'
        : '';
      const flashClassName = isFlashed
        ? 'bg-emerald-500/5 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.18)] transition-colors duration-700'
        : '';

      return ['rounded-md', baseClassName, refreshClassName, flashClassName]
        .filter(Boolean)
        .join(' ');
    },
    [
      showTracks,
      isExpanded,
      selectedReleaseId,
      refreshingReleaseId,
      flashedReleaseId,
    ]
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
      enableSorting: false,
    });

    const rightMetaColumn = columnHelper.display({
      id: 'meta',
      // NOSONAR S6478: TanStack Table header renderer prop, component already extracted
      header: MetaHeaderCell,
      cell: createRightMetaCellRenderer(
        isSmartLinkLocked,
        getSmartLinkLockReason
      ),
      size: 280,
      minSize: 240,
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
    getSmartLinkLockReason,
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
        const year = new Date(release.releaseDate).getFullYear();
        return Number.isNaN(year) ? 'Unknown' : year.toString();
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
          release={release}
          providerConfig={providerConfig}
          allProviders={allProviders}
          columnCount={columnCount}
          columnVisibility={tanstackColumnVisibility}
          onTrackClick={onTrackClick}
          selectedTrackId={selectedTrackId}
        />
      );
    },
    [
      showTracks,
      getTracksForRelease,
      providerConfig,
      allProviders,
      tanstackColumnVisibility,
      onTrackClick,
      selectedTrackId,
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
        <div className='px-4 py-10 text-center text-[13px] text-secondary-token flex flex-col items-center gap-3'>
          <Icon name='Disc3' className='h-6 w-6' />
          <div>
            <div className='font-[510]'>No releases</div>
            <div className='text-[11px]'>
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
        onCopy={onCopy}
        isSmartLinkLocked={isSmartLinkLocked}
        getSmartLinkLockReason={getSmartLinkLockReason}
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
      hideHeader
      className='text-[13px] text-(--linear-text-primary)'
      containerClassName='h-full'
      columnVisibility={tanstackColumnVisibility}
      onFocusedRowChange={handleFocusedRowChange}
      groupingConfig={groupingConfig}
      expandedRowIds={expandedRowIds}
      renderExpandedContent={showTracks ? renderExpandedContent : undefined}
      getExpandableRowId={getExpandableRowId}
      emptyState={
        <div className='px-4 py-10 text-center text-[13px] text-secondary-token flex flex-col items-center gap-3'>
          <Icon name='Disc3' className='h-6 w-6' />
          <div>
            <div className='font-[510]'>No releases</div>
            <div className='text-[11px]'>
              Your releases will appear here once synced.
            </div>
          </div>
        </div>
      }
    />
  );
}
