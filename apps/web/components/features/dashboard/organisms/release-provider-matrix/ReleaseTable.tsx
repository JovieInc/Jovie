'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { lazy, Suspense, useCallback, useMemo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TableEmptyState, UnifiedTable } from '@/components/organisms/table';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { TABLE_ROW_HEIGHTS } from '@/lib/constants/layout';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { useSortingManager } from './hooks/useSortingManager';
import { MobileReleaseListLazy } from './MobileReleaseListLazy';
import type { ReleaseTableProps } from './ReleaseTable.types';
import { getReleaseContextMenuItems } from './utils/release-context-actions';
import {
  createReleaseCellRenderer,
  createRightMetaCellRenderer,
} from './utils/release-table-renderers';

const ReleaseTableWithTracks = lazy(() =>
  import('./ReleaseTableWithTracks').then(m => ({
    default: m.ReleaseTableWithTracks,
  }))
);

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
  onDelete,
  canGenerateAlbumArt,
  onGenerateAlbumArt,
  columnVisibility,
  rowHeight = TABLE_ROW_HEIGHTS.STANDARD + 4,
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
        onDelete,
        canGenerateAlbumArt,
        onGenerateAlbumArt,
        artistName,
        isSmartLinkLocked,
        getSmartLinkLockReason,
      }),
    [
      onEdit,
      onCopy,
      onDelete,
      canGenerateAlbumArt,
      onGenerateAlbumArt,
      artistName,
      isSmartLinkLocked,
      getSmartLinkLockReason,
    ]
  );

  // Stable callbacks for UnifiedTable props
  const getRowId = useCallback((row: ReleaseViewModel) => row.id, []);
  const getRowTestId = useCallback(
    (_row: ReleaseViewModel, index: number) =>
      index === 0 ? 'release-row' : undefined,
    []
  );
  const getRowClassName = useCallback(
    (row: ReleaseViewModel) => {
      const isSelected = selectedReleaseId === row.id;
      const isRefreshing = refreshingReleaseId === row.id;
      const isFlashed = flashedReleaseId === row.id;

      let baseClassName: string;
      if (isSelected) {
        baseClassName =
          'bg-[color-mix(in_oklab,var(--linear-row-selected)_55%,transparent)] shadow-[inset_3px_0_0_0_var(--linear-accent)] hover:bg-[color-mix(in_oklab,var(--linear-row-selected)_65%,transparent)] focus-within:bg-[color-mix(in_oklab,var(--linear-row-selected)_72%,transparent)] focus-within:shadow-[inset_3px_0_0_0_var(--linear-accent),inset_0_0_0_1px_var(--linear-border-focus)]';
      } else {
        baseClassName =
          'bg-transparent hover:bg-[color-mix(in_oklab,var(--linear-row-hover)_78%,transparent)] focus-within:bg-[color-mix(in_oklab,var(--linear-row-hover)_84%,transparent)] transition-[background-color,box-shadow,color] duration-150 ease-out [&:hover_span]:text-primary-token [&:hover_p]:text-primary-token';
      }

      const refreshClassName = isRefreshing
        ? 'relative overflow-hidden skeleton'
        : '';
      const flashClassName = isFlashed
        ? 'bg-emerald-500/5 transition-colors duration-700'
        : '';

      return [
        'rounded-none transition-[background-color,box-shadow] duration-150 ease-out',
        baseClassName,
        refreshClassName,
        flashClassName,
      ]
        .filter(Boolean)
        .join(' ');
    },
    [selectedReleaseId, refreshingReleaseId, flashedReleaseId]
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

  // Build column definitions (catalog view)
  const columns = useMemo(() => {
    const releaseColumn = columnHelper.accessor('title', {
      id: 'release',
      header: 'Release',
      cell: createReleaseCellRenderer(artistName, onEdit),
      minSize: 200,
      size: 9999, // Large value to make it flex and fill available space
      enableSorting: false,
      meta: { className: 'pl-4 pr-2.5' },
    });

    const rightMetaColumn = columnHelper.display({
      id: 'meta',
      // NOSONAR S6478: TanStack Table header renderer prop, component already extracted
      header: MetaHeaderCell,
      cell: createRightMetaCellRenderer(
        isSmartLinkLocked,
        getSmartLinkLockReason
      ),
      size: 260,
      minSize: 100,
      meta: { className: 'max-sm:hidden pl-2 pr-4 sm:table-cell' },
    });

    return [releaseColumn, rightMetaColumn];
  }, [artistName, onEdit, isSmartLinkLocked, getSmartLinkLockReason]);

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

  // Year grouping configuration
  const groupingConfig = useMemo(() => {
    if (!groupByYear) return undefined;
    return {
      getGroupKey: (release: ReleaseViewModel) => {
        if (!release.releaseDate) return 'Unknown';
        const year = new Date(release.releaseDate).getUTCFullYear();
        return Number.isNaN(year) ? 'Unknown' : year.toString();
      },
      getGroupLabel: (year: string) => year,
    };
  }, [groupByYear]);

  if (showTracks) {
    return (
      <Suspense
        fallback={
          <div className='px-4 py-3 text-[12px] text-secondary-token'>
            Loading releases...
          </div>
        }
      >
        <ReleaseTableWithTracks
          releases={releases}
          providerConfig={providerConfig}
          artistName={artistName}
          onCopy={onCopy}
          onEdit={onEdit}
          canGenerateAlbumArt={canGenerateAlbumArt}
          onGenerateAlbumArt={onGenerateAlbumArt}
          columnVisibility={columnVisibility}
          rowHeight={rowHeight}
          onFocusedRowChange={onFocusedRowChange}
          showTracks={showTracks}
          groupByYear={groupByYear}
          refreshingReleaseId={refreshingReleaseId}
          flashedReleaseId={flashedReleaseId}
          selectedReleaseId={selectedReleaseId}
          selectedTrackId={selectedTrackId}
          isSmartLinkLocked={isSmartLinkLocked}
          getSmartLinkLockReason={getSmartLinkLockReason}
          onTrackClick={onTrackClick}
        />
      </Suspense>
    );
  }

  // Mobile: render card-based list view instead of table
  if (isMobile) {
    if (releases.length === 0) {
      return (
        <TableEmptyState
          icon={<Icon name='Disc3' className='h-6 w-6' />}
          title='No releases'
          description='Your releases will appear here once synced.'
          className='mx-4 my-3 min-h-[160px]'
        />
      );
    }

    return (
      <MobileReleaseListLazy
        releases={releases}
        artistName={artistName}
        onEdit={onEdit}
        onCopy={onCopy}
        canGenerateAlbumArt={canGenerateAlbumArt}
        onGenerateAlbumArt={onGenerateAlbumArt}
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
      getRowTestId={getRowTestId}
      getRowClassName={getRowClassName}
      enableVirtualization={!groupByYear}
      rowHeight={rowHeight}
      minWidth={minWidth}
      hideHeader
      className='text-[13px] text-primary-token'
      containerClassName='h-full px-2.5 pb-2.5 pt-0.5 md:px-3 md:pb-3 md:pt-1'
      columnVisibility={tanstackColumnVisibility}
      onFocusedRowChange={handleFocusedRowChange}
      skeletonRows={14}
      skeletonColumnConfig={[
        { variant: 'release', width: '100%' },
        { variant: 'meta', width: '204px' },
      ]}
      groupingConfig={groupingConfig}
      emptyState={
        <TableEmptyState
          icon={<Icon name='Disc3' className='h-6 w-6' />}
          title='No releases'
          description='Your releases will appear here once synced.'
          className='m-3 min-h-[160px]'
        />
      }
    />
  );
}
