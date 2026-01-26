'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { useCallback, useMemo, useRef } from 'react';
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
  createActionsCellRenderer,
  createActionsHeaderRenderer,
  createAvailabilityCellRenderer,
  createExpandableReleaseCellRenderer,
  createReleaseCellRenderer,
  createReleaseHeaderRenderer,
  createSelectCellRenderer,
  createSelectHeaderRenderer,
  createSmartLinkCellRenderer,
  renderDurationCell,
  renderGenresCell,
  renderIsrcCell,
  renderLabelCell,
  renderMetricsCell,
  renderPopularityCell,
  renderReleaseDateCell,
  renderReleaseTypeCell,
  renderTotalTracksCell,
  renderUpcCell,
} from './utils/column-renderers';

interface ProviderConfig {
  label: string;
  accent: string;
}

interface ReleaseTableProps {
  releases: ReleaseViewModel[];
  providerConfig: Record<ProviderKey, ProviderConfig>;
  artistName?: string | null;
  onCopy: (path: string, label: string, testId: string) => Promise<string>;
  onEdit: (release: ReleaseViewModel) => void;
  onAddUrl?: (
    releaseId: string,
    provider: ProviderKey,
    url: string
  ) => Promise<void>;
  isAddingUrl?: boolean;
  /** Selected release IDs (controlled from parent) */
  selectedIds?: Set<string>;
  /** Callback when selection changes */
  onSelectionChange?: (selectedIds: Set<string>) => void;
  /** Bulk actions shown in header when items selected */
  bulkActions?: HeaderBulkAction[];
  /** Callback to clear selection */
  onClearSelection?: () => void;
  /** Column visibility state from preferences */
  columnVisibility?: Record<string, boolean>;
  /** Row height from density preference */
  rowHeight?: number;
  /** Callback when focused row changes via keyboard navigation */
  onFocusedRowChange?: (release: ReleaseViewModel) => void;
  /** Whether to show expandable track rows for albums/EPs */
  showTracks?: boolean;
  /** Group releases by year with sticky headers */
  groupByYear?: boolean;
}

const columnHelper = createColumnHelper<ReleaseViewModel>();

// ============================================================================
// Static Column Definitions (Module Level)
// ============================================================================
// These don't depend on props/state and are defined once at module load

const STATIC_COLUMNS = {
  releaseType: columnHelper.accessor('releaseType', {
    id: 'releaseType',
    header: 'Type',
    cell: renderReleaseTypeCell,
    size: 80,
    enableSorting: true,
  }),
  releaseDate: columnHelper.accessor('releaseDate', {
    id: 'releaseDate',
    header: 'Released',
    cell: renderReleaseDateCell,
    size: 80,
    enableSorting: true,
  }),
  popularity: columnHelper.accessor('spotifyPopularity', {
    id: 'popularity',
    header: 'Popularity',
    cell: renderPopularityCell,
    size: 70,
    enableSorting: true,
  }),
  isrc: columnHelper.accessor('primaryIsrc', {
    id: 'primaryIsrc',
    header: 'ISRC',
    cell: renderIsrcCell,
    size: 100,
    enableSorting: true,
  }),
  upc: columnHelper.accessor('upc', {
    id: 'upc',
    header: 'UPC',
    cell: renderUpcCell,
    size: 110,
    enableSorting: true,
  }),
  label: columnHelper.accessor('label', {
    id: 'label',
    header: 'Label',
    cell: renderLabelCell,
    size: 120,
    enableSorting: true,
  }),
  totalTracks: columnHelper.accessor('totalTracks', {
    id: 'totalTracks',
    header: 'Tracks',
    cell: renderTotalTracksCell,
    size: 60,
    enableSorting: true,
  }),
  duration: columnHelper.accessor('totalDurationMs', {
    id: 'totalDurationMs',
    header: 'Duration',
    cell: renderDurationCell,
    size: 70,
    enableSorting: true,
  }),
  genres: columnHelper.accessor('genres', {
    id: 'genres',
    header: 'Genre',
    cell: renderGenresCell,
    size: 100,
  }),
  // Combined metrics column - replaces individual small columns
  metrics: columnHelper.display({
    id: 'metrics',
    // sr-only header for cleaner look
    header: () => <span className='sr-only'>Metrics</span>,
    cell: renderMetricsCell,
    size: 180,
  }),
};

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
  selectedCountRef.current = selectedIds.size;
  const bulkActionsRef = useRef(bulkActions);
  bulkActionsRef.current = bulkActions;

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
      const supportedProviders: ProviderKey[] = [
        'spotify',
        'apple_music',
        'youtube',
        'deezer',
      ];
      const providerLabels: Partial<Record<ProviderKey, string>> = {
        spotify: 'Spotify',
        apple_music: 'Apple Music',
        youtube: 'YouTube Music',
        deezer: 'Deezer',
      };

      const externalProviders = release.providers.filter(
        p => supportedProviders.includes(p.key) && p.url
      );

      if (externalProviders.length > 0) {
        items.push({ type: 'separator' });
        for (const provider of externalProviders) {
          items.push({
            id: `open-${provider.key}`,
            label: `Open in ${providerLabels[provider.key] || provider.key}`,
            icon: menuIcon('ExternalLink'),
            onClick: () => {
              window.open(provider.url!, '_blank', 'noopener,noreferrer');
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
        return 'group bg-primary/5 dark:bg-primary/10 border-l-2 border-l-primary';
      }
      if (isRowExpanded) {
        // Expanded parent row has slightly darker background (like Linear)
        return 'group bg-surface-2/50 dark:bg-surface-2/30';
      }
      return 'group hover:bg-(--color-cell-hover)';
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
  const columns = useMemo(() => {
    const allProviders = Object.keys(providerConfig) as ProviderKey[];

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

    const availabilityColumn = columnHelper.display({
      id: 'availability',
      header: 'Availability',
      cell: createAvailabilityCellRenderer(
        allProviders,
        providerConfig,
        onCopy,
        onAddUrl,
        isAddingUrl
      ),
      size: 120,
    });

    const smartLinkColumn = columnHelper.display({
      id: 'smartLink',
      header: 'Smart link',
      cell: createSmartLinkCellRenderer(onCopy),
      size: 160,
    });

    const actionsColumn = columnHelper.display({
      id: 'actions',
      header: createActionsHeaderRenderer(selectedCountRef, onClearSelection),
      cell: createActionsCellRenderer(getContextMenuItems),
      size: 56,
    });

    // Return all columns - TanStack Table handles visibility natively
    // Uses combined metrics column for cleaner layout with sr-only header
    return [
      checkboxColumn,
      releaseColumn,
      STATIC_COLUMNS.releaseType,
      availabilityColumn,
      smartLinkColumn,
      STATIC_COLUMNS.releaseDate,
      STATIC_COLUMNS.metrics, // Combined: tracks, duration, label
      STATIC_COLUMNS.popularity,
      STATIC_COLUMNS.isrc,
      STATIC_COLUMNS.upc,
      actionsColumn,
    ];
  }, [
    providerConfig,
    artistName,
    onCopy,
    onAddUrl,
    isAddingUrl,
    onClearSelection,
    getContextMenuItems,
    headerCheckboxStateRef,
    selectedIdsRef,
    toggleSelect,
    toggleSelectAll,
    showTracks,
    isExpanded,
    isLoadingTracks,
    toggleExpansion,
  ]);

  // Transform columnVisibility to TanStack format (always show select, release, actions)
  const tanstackColumnVisibility = useMemo(() => {
    if (!columnVisibility) return undefined;
    return {
      ...columnVisibility,
      select: true,
      release: true,
      actions: true,
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
    />
  );
}
