'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Icon } from '@/components/atoms/Icon';
import {
  type ContextMenuItemType,
  type HeaderBulkAction,
  UnifiedTable,
  useRowSelection,
  useStableSelectionRefs,
} from '@/components/organisms/table';
import {
  RELEASE_TABLE_WIDTHS,
  TABLE_ROW_HEIGHTS,
} from '@/lib/constants/layout';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { TrackRowsContainer } from './components';
import { useExpandedTracks } from './hooks/useExpandedTracks';
import { useSortingManager } from './hooks/useSortingManager';
import {
  createExpandableReleaseCellRenderer,
  createReleaseCellRenderer,
  createReleaseHeaderRenderer,
  createRightMetaCellRenderer,
  createSelectCellRenderer,
  createSelectHeaderRenderer,
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
  readonly onAddUrl?: (
    releaseId: string,
    provider: ProviderKey,
    url: string
  ) => Promise<void>;
  readonly isAddingUrl?: boolean;
  /** Selected release IDs (controlled from parent) */
  readonly selectedIds?: Set<string>;
  /** Callback when selection changes */
  readonly onSelectionChange?: (selectedIds: Set<string>) => void;
  /** Bulk actions shown in header when items selected */
  readonly bulkActions?: HeaderBulkAction[];
  /** Callback to clear selection */
  readonly onClearSelection?: () => void;
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
  onAddUrl,
  isAddingUrl,
  selectedIds: externalSelectedIds,
  onSelectionChange,
  bulkActions = [],
  onClearSelection,
  columnVisibility,
  rowHeight = TABLE_ROW_HEIGHTS.STANDARD,
  onFocusedRowChange,
  showTracks = false,
  groupByYear = false,
}: ReleaseTableProps) {
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

  // Row selection - use external selection if provided, otherwise internal
  const rowIds = useMemo(() => releases.map(r => r.id), [releases]);
  const rowIdSet = useMemo(() => new Set(rowIds), [rowIds]);
  const internalSelection = useRowSelection(rowIds);

  const selectedIds = externalSelectedIds ?? internalSelection.selectedIds;

  // Compute header checkbox state
  const headerCheckboxState = useMemo(() => {
    if (externalSelectedIds === undefined) {
      return internalSelection.headerCheckboxState;
    }

    let visibleCount = 0;
    for (const id of selectedIds) {
      if (rowIdSet.has(id)) visibleCount++;
    }

    if (visibleCount === 0) return false;
    if (visibleCount === rowIds.length) return true;
    return 'indeterminate';
  }, [
    externalSelectedIds,
    internalSelection.headerCheckboxState,
    selectedIds,
    rowIdSet,
    rowIds.length,
  ]);

  // Use stable selection refs to prevent column recreation loops
  const {
    selectedIdsRef,
    headerCheckboxStateRef,
    toggleSelect,
    toggleSelectAll,
  } = useStableSelectionRefs({
    selectedIds,
    rowIds,
    headerCheckboxState,
    onSelectionChange,
    internalToggleSelect: internalSelection.toggleSelect,
    internalToggleSelectAll: internalSelection.toggleSelectAll,
  });

  // Refs for bulk actions header
  const selectedCountRef = useRef(selectedIds.size);
  const bulkActionsRef = useRef(bulkActions);

  // Update refs in effect rather than during render
  useEffect(() => {
    selectedCountRef.current = selectedIds.size;
    bulkActionsRef.current = bulkActions;
  }, [selectedIds.size, bulkActions]);

  // Context menu items for right-click
  const getContextMenuItems = useCallback(
    (release: ReleaseViewModel): ContextMenuItemType[] => {
      const menuIcon = (
        name: 'PencilLine' | 'Link2' | 'Hash' | 'ExternalLink'
      ) => <Icon name={name} className='h-3.5 w-3.5' />;

      const items: ContextMenuItemType[] = [
        {
          id: 'edit',
          label: 'Edit links',
          icon: menuIcon('PencilLine'),
          onClick: () => onEdit(release),
        },
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
        },
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
    [onEdit, onCopy]
  );

  // Stable callbacks for UnifiedTable props
  const getRowId = useCallback((row: ReleaseViewModel) => row.id, []);
  const getRowClassName = useCallback(
    (row: ReleaseViewModel) => {
      const isSelected = selectedIdsRef.current?.has(row.id);
      const isRowExpanded = showTracks && isExpanded(row.id);

      if (isSelected) {
        return 'bg-primary/5 dark:bg-primary/10 border-l-2 border-l-primary hover:bg-primary/8 dark:hover:bg-primary/15';
      }
      if (isRowExpanded) {
        return 'bg-surface-2/30 hover:bg-surface-2/50';
      }
      return 'hover:bg-surface-2/50';
    },
    [selectedIdsRef, showTracks, isExpanded]
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

  // Build column definitions (dynamic columns only)
  /* eslint-disable react-hooks/refs -- refs are passed to render functions but only accessed via callbacks, not during render */
  const columns = useMemo(() => {
    const checkboxColumn = columnHelper.display({
      id: 'select',
      header: createSelectHeaderRenderer(
        headerCheckboxStateRef,
        toggleSelectAll
      ),
      cell: createSelectCellRenderer(selectedIdsRef, toggleSelect),
      size: 56,
    });

    const releaseColumn = columnHelper.accessor('title', {
      id: 'release',
      header: createReleaseHeaderRenderer(
        selectedCountRef,
        bulkActionsRef,
        onClearSelection
      ),
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
      cell: createRightMetaCellRenderer(),
      size: 300,
      minSize: 200,
    });

    // Return all columns - TanStack Table handles visibility natively
    // Right meta packs smart link + popularity + year; header is sr-only for a11y.
    // Note: releaseType, availability, and ISRC columns moved to ReleaseSidebar drawer only
    // UPC column removed per design request.
    return [checkboxColumn, releaseColumn, rightMetaColumn];
  }, [
    artistName,
    onClearSelection,
    headerCheckboxStateRef,
    selectedIdsRef,
    toggleSelect,
    toggleSelectAll,
    showTracks,
    isExpanded,
    isLoadingTracks,
    toggleExpansion,
  ]);
  /* eslint-enable react-hooks/refs */

  // Transform columnVisibility to TanStack format (always show select and release)
  const tanstackColumnVisibility = useMemo(() => {
    if (!columnVisibility) return undefined;
    return {
      ...columnVisibility,
      select: true,
      release: true,
    };
  }, [columnVisibility]);

  const minWidth = `${RELEASE_TABLE_WIDTHS.BASE + RELEASE_TABLE_WIDTHS.PROVIDER_COLUMN}px`;

  // Check if any rows are expanded (affects virtualization)
  const hasExpandedRows = useMemo(() => {
    if (!showTracks) return false;
    return releases.some(r => isExpanded(r.id));
  }, [showTracks, releases, isExpanded]);

  // When showTracks is enabled and rows are expanded, disable virtualization
  // This allows dynamic row counts with track rows
  const shouldVirtualize = !showTracks || !hasExpandedRows;

  // Get all providers for track row rendering
  const allProviders = useMemo(
    () => Object.keys(providerConfig) as ProviderKey[],
    [providerConfig]
  );

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
