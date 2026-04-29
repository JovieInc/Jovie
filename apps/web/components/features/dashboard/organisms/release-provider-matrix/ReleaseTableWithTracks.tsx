'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { lazy, Suspense, useCallback, useMemo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TableEmptyState, UnifiedTable } from '@/components/organisms/table';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { TABLE_ROW_HEIGHTS } from '@/lib/constants/layout';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { useExpandedTracks } from './hooks/useExpandedTracks';
import { useSortingManager } from './hooks/useSortingManager';
import { MobileReleaseListLazy } from './MobileReleaseListLazy';
import type { ReleaseTableProps } from './ReleaseTable.types';
import { getReleaseContextMenuItems } from './utils/release-context-actions';
import {
  createExpandableReleaseCellRenderer,
  createRightMetaCellRenderer,
} from './utils/release-table-renderers';

const TrackRowsContainer = lazy(() =>
  import(
    '@/features/dashboard/organisms/release-provider-matrix/components'
  ).then(m => ({
    default: m.TrackRowsContainer,
  }))
);

const columnHelper = createColumnHelper<ReleaseViewModel>();

const MetaHeaderCell = () => (
  <span className='sr-only'>Smart link, popularity, year</span>
);

function TrackRowsLoadingRow() {
  return (
    <div className='rounded-xl border border-[color:color-mix(in_oklab,var(--linear-app-frame-seam)_66%,transparent)] bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_76%,var(--linear-bg-surface-0))] px-3 py-2.5 text-2xs text-tertiary-token'>
      Loading tracks...
    </div>
  );
}

export function ReleaseTableWithTracks({
  releases,
  providerConfig,
  artistName,
  onCopy,
  onEdit,
  canGenerateAlbumArt,
  onGenerateAlbumArt,
  columnVisibility,
  rowHeight = TABLE_ROW_HEIGHTS.STANDARD + 4,
  onFocusedRowChange,
  groupByYear = false,
  selectedReleaseId,
  selectedTrackId,
  designV1 = false,
  refreshingReleaseId,
  flashedReleaseId,
  isSmartLinkLocked,
  getSmartLinkLockReason,
  onTrackClick,
}: ReleaseTableProps) {
  const isMobile = useBreakpointDown('md');
  const {
    expandedReleaseIds,
    isExpanded,
    isLoading: isLoadingTracks,
    toggleExpansion,
    getTracksForRelease,
  } = useExpandedTracks();
  const { sorting, onSortingChange, isSorting, isLargeDataset } =
    useSortingManager({ rowCount: releases.length });

  const getContextMenuItems = useCallback(
    (release: ReleaseViewModel) =>
      getReleaseContextMenuItems({
        release,
        onEdit,
        onCopy,
        canGenerateAlbumArt,
        onGenerateAlbumArt,
        artistName,
        isSmartLinkLocked,
        getSmartLinkLockReason,
      }),
    [
      onEdit,
      onCopy,
      canGenerateAlbumArt,
      onGenerateAlbumArt,
      artistName,
      isSmartLinkLocked,
      getSmartLinkLockReason,
    ]
  );

  const getRowId = useCallback((row: ReleaseViewModel) => row.id, []);
  const getRowTestId = useCallback(
    (_row: ReleaseViewModel, index: number) =>
      index === 0 ? 'release-row' : undefined,
    []
  );

  const getRowClassName = useCallback(
    (row: ReleaseViewModel) => {
      const isRowExpanded = isExpanded(row.id);
      const isSelected = selectedReleaseId === row.id;
      const isRefreshing = refreshingReleaseId === row.id;
      const isFlashed = flashedReleaseId === row.id;

      let baseClassName: string;
      if (designV1 && isSelected) {
        baseClassName =
          'border-transparent bg-(--linear-bg-surface-1)/80 shadow-[inset_3px_0_0_0_var(--linear-accent),inset_0_0_0_1px_color-mix(in_oklab,var(--linear-border-focus)_24%,transparent)] hover:bg-(--linear-bg-surface-1)/90 focus-within:bg-(--linear-bg-surface-1)';
      } else if (designV1 && isRowExpanded) {
        baseClassName =
          'border-transparent bg-(--linear-bg-surface-1)/58 hover:bg-(--linear-bg-surface-1)/64 focus-within:bg-(--linear-bg-surface-1)/70';
      } else if (designV1) {
        baseClassName =
          'border-transparent bg-transparent hover:bg-(--linear-bg-surface-1)/55 focus-within:bg-(--linear-bg-surface-1)/65 transition-[background-color,box-shadow,color] duration-150 ease-out [&:hover_span]:text-primary-token [&:hover_p]:text-primary-token';
      } else if (isSelected) {
        baseClassName =
          'bg-[color-mix(in_oklab,var(--linear-row-selected)_55%,transparent)] shadow-[inset_3px_0_0_0_var(--linear-accent)] hover:bg-[color-mix(in_oklab,var(--linear-row-selected)_65%,transparent)] focus-within:bg-[color-mix(in_oklab,var(--linear-row-selected)_72%,transparent)] focus-within:shadow-[inset_3px_0_0_0_var(--linear-accent),inset_0_0_0_1px_var(--linear-border-focus)]';
      } else if (isRowExpanded) {
        baseClassName =
          'bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_52%,transparent)] hover:bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_58%,transparent)] focus-within:bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_62%,transparent)]';
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
        designV1 ? 'rounded-md' : 'rounded-none',
        'transition-[background-color,box-shadow] duration-150 ease-out',
        baseClassName,
        refreshClassName,
        flashClassName,
      ]
        .filter(Boolean)
        .join(' ');
    },
    [
      isExpanded,
      designV1,
      selectedReleaseId,
      refreshingReleaseId,
      flashedReleaseId,
    ]
  );

  const handleFocusedReleaseChange = useCallback(
    (index: number) => {
      if (index < 0 || index >= releases.length) return;
      const release = releases[index];
      if (release && onFocusedRowChange) {
        onFocusedRowChange(release);
      }
    },
    [releases, onFocusedRowChange]
  );

  const allProviders = useMemo(
    () => Object.keys(providerConfig) as ProviderKey[],
    [providerConfig]
  );

  const columns = useMemo(() => {
    const releaseColumn = columnHelper.accessor('title', {
      id: 'release',
      header: 'Release',
      cell: createExpandableReleaseCellRenderer(
        artistName,
        isExpanded,
        isLoadingTracks,
        toggleExpansion,
        onEdit,
        designV1
      ),
      minSize: 200,
      size: 9999,
      enableSorting: false,
      meta: { className: designV1 ? 'pl-3 pr-2' : 'pl-4 pr-2.5' },
    });

    const rightMetaColumn = columnHelper.display({
      id: 'meta',
      header: MetaHeaderCell,
      cell: createRightMetaCellRenderer(
        isSmartLinkLocked,
        getSmartLinkLockReason,
        designV1
      ),
      size: designV1 ? 390 : 260,
      minSize: 100,
      meta: {
        className: designV1
          ? 'max-sm:hidden pl-2 pr-3 sm:table-cell'
          : 'max-sm:hidden pl-2 pr-4 sm:table-cell',
      },
    });

    return [releaseColumn, rightMetaColumn];
  }, [
    artistName,
    isExpanded,
    isLoadingTracks,
    toggleExpansion,
    onEdit,
    designV1,
    isSmartLinkLocked,
    getSmartLinkLockReason,
  ]);

  const tanstackColumnVisibility = useMemo(() => {
    if (!columnVisibility) return undefined;
    return {
      ...columnVisibility,
      release: true,
    };
  }, [columnVisibility]);

  const hasExpandedRows = expandedReleaseIds.size > 0;

  const groupingConfig = useMemo(() => {
    if (!groupByYear) return undefined;
    return {
      getGroupKey: (release: ReleaseViewModel) => {
        if (!release.releaseDate) return 'Unknown';
        const directYear = /^(\d{4})/.exec(String(release.releaseDate))?.[1];
        if (directYear) {
          return directYear;
        }
        const year = new Date(release.releaseDate).getUTCFullYear();
        return Number.isNaN(year) ? 'Unknown' : year.toString();
      },
      getGroupLabel: (year: string) => year,
    };
  }, [groupByYear]);

  const renderExpandedContent = useCallback(
    (release: ReleaseViewModel, columnCount: number) => {
      const tracks = getTracksForRelease(release.id);
      if (!tracks) return null;

      return (
        <div
          data-testid={`release-track-stack-${release.id}`}
          className={designV1 ? 'px-3 pb-2.5 pt-1' : 'px-4 pb-3 pt-1.5'}
        >
          <div className='rounded-[14px] border border-[color:color-mix(in_oklab,var(--linear-app-frame-seam)_74%,transparent)] bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_70%,var(--linear-bg-surface-0))] p-2.5 shadow-[inset_0_1px_0_color-mix(in_oklab,white_4%,transparent)]'>
            <Suspense fallback={<TrackRowsLoadingRow />}>
              <TrackRowsContainer
                tracks={tracks}
                release={release}
                providerConfig={providerConfig}
                allProviders={allProviders}
                columnCount={columnCount}
                columnVisibility={tanstackColumnVisibility}
                onTrackClick={onTrackClick}
                selectedTrackId={selectedTrackId}
                renderMode='stack'
              />
            </Suspense>
          </div>
        </div>
      );
    },
    [
      getTracksForRelease,
      providerConfig,
      allProviders,
      tanstackColumnVisibility,
      onTrackClick,
      selectedTrackId,
      designV1,
    ]
  );

  const getExpandableRowId = useCallback(
    (release: ReleaseViewModel) => release.id,
    []
  );

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
      enableVirtualization={!hasExpandedRows && !groupByYear}
      rowHeight={rowHeight}
      minWidth='0'
      hideHeader
      className='text-[12.5px] text-primary-token'
      containerClassName={
        designV1
          ? 'h-full px-2 pb-2 pt-1 md:px-2.5 md:pb-2.5 md:pt-1.5'
          : 'h-full px-2.5 pb-2.5 pt-0.5 md:px-3 md:pb-3 md:pt-1'
      }
      columnVisibility={tanstackColumnVisibility}
      onFocusedRowChange={handleFocusedReleaseChange}
      skeletonRows={14}
      skeletonColumnConfig={[
        { variant: 'release', width: '100%' },
        { variant: 'meta', width: designV1 ? '320px' : '204px' },
      ]}
      groupingConfig={groupingConfig}
      expandedRowIds={expandedReleaseIds}
      renderExpandedContent={renderExpandedContent}
      getExpandableRowId={getExpandableRowId}
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
