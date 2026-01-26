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
import { useSortingManager } from './hooks/useSortingManager';
import {
  createActionsCellRenderer,
  createActionsHeaderRenderer,
  createAvailabilityCellRenderer,
  createReleaseCellRenderer,
  createReleaseHeaderRenderer,
  createSelectCellRenderer,
  createSelectHeaderRenderer,
  createSmartLinkCellRenderer,
  renderDurationCell,
  renderGenresCell,
  renderIsrcCell,
  renderLabelCell,
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
    size: 70,
    enableSorting: true,
  }),
  popularity: columnHelper.accessor('spotifyPopularity', {
    id: 'popularity',
    header: 'Popularity',
    cell: renderPopularityCell,
    size: 80,
    enableSorting: true,
  }),
  isrc: columnHelper.accessor('primaryIsrc', {
    id: 'primaryIsrc',
    header: 'ISRC',
    cell: renderIsrcCell,
    size: 120,
    enableSorting: true,
  }),
  upc: columnHelper.accessor('upc', {
    id: 'upc',
    header: 'UPC',
    cell: renderUpcCell,
    size: 130,
    enableSorting: true,
  }),
  label: columnHelper.accessor('label', {
    id: 'label',
    header: 'Label',
    cell: renderLabelCell,
    size: 150,
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
    size: 80,
    enableSorting: true,
  }),
  genres: columnHelper.accessor('genres', {
    id: 'genres',
    header: 'Genre',
    cell: renderGenresCell,
    size: 120,
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
}: ReleaseTableProps) {
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
    (release: ReleaseViewModel): ContextMenuItemType[] => [
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
      {
        id: 'copy-release-id',
        label: 'Copy release ID',
        icon: <Icon name='Hash' className='h-3.5 w-3.5' />,
        onClick: () => {
          navigator.clipboard.writeText(release.id);
        },
      },
    ],
    [onEdit, onCopy]
  );

  // Stable callbacks for UnifiedTable props
  const getRowId = useCallback((row: ReleaseViewModel) => row.id, []);
  const getRowClassName = useCallback(
    (row: ReleaseViewModel) =>
      selectedIdsRef.current?.has(row.id)
        ? 'group bg-primary/5 dark:bg-primary/10 border-l-2 border-l-primary'
        : 'group hover:bg-surface-2/50',
    [selectedIdsRef]
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
      cell: createReleaseCellRenderer(artistName),
      size: 280,
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
      size: 180,
    });

    const actionsColumn = columnHelper.display({
      id: 'actions',
      header: createActionsHeaderRenderer(selectedCountRef, onClearSelection),
      cell: createActionsCellRenderer(getContextMenuItems),
      size: 80,
    });

    // Return all columns - TanStack Table handles visibility natively
    return [
      checkboxColumn,
      releaseColumn,
      STATIC_COLUMNS.releaseType,
      availabilityColumn,
      smartLinkColumn,
      STATIC_COLUMNS.releaseDate,
      STATIC_COLUMNS.popularity,
      STATIC_COLUMNS.isrc,
      STATIC_COLUMNS.upc,
      STATIC_COLUMNS.label,
      STATIC_COLUMNS.totalTracks,
      STATIC_COLUMNS.duration,
      STATIC_COLUMNS.genres,
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
      enableVirtualization
      rowHeight={rowHeight}
      minWidth={minWidth}
      className='text-[13px]'
      containerClassName='h-full'
      columnVisibility={tanstackColumnVisibility}
      onFocusedRowChange={handleFocusedRowChange}
    />
  );
}
