'use client';

import { useDebouncer } from '@tanstack/react-pacer';
import {
  type ColumnDef,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { Icon } from '@/components/atoms/Icon';
// Cell components are now used via factory functions in ./utils/column-renderers
import {
  type ContextMenuItemType,
  type HeaderBulkAction,
  UnifiedTable,
  useRowSelection,
} from '@/components/organisms/table';
import {
  RELEASE_TABLE_WIDTHS,
  TABLE_ROW_HEIGHTS,
} from '@/lib/constants/layout';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
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
  onSync: () => void;
  isAddingUrl?: boolean;
  isSyncing?: boolean;
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
}

const columnHelper = createColumnHelper<ReleaseViewModel>();

/** Threshold above which sorting is debounced to prevent UI jank */
const LARGE_DATASET_THRESHOLD = 500;

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
  bulkActions = [],
  onClearSelection,
  columnVisibility,
  rowHeight = TABLE_ROW_HEIGHTS.STANDARD,
}: ReleaseTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'releaseDate', desc: true },
  ]);
  const [isSorting, startTransition] = useTransition();

  // Debounced sorting for large datasets - prevents UI jank during rapid sort changes
  const sortingDebouncer = useDebouncer(
    (newSorting: SortingState) => {
      startTransition(() => {
        setSorting(newSorting);
      });
    },
    { wait: 150 }
  );

  // Use immediate sorting for small datasets, debounced for large
  const handleSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const newSorting =
        typeof updater === 'function' ? updater(sorting) : updater;
      if (releases.length > LARGE_DATASET_THRESHOLD) {
        sortingDebouncer.maybeExecute(newSorting);
      } else {
        setSorting(newSorting);
      }
    },
    [sorting, releases.length, sortingDebouncer]
  );

  // Row selection - use external selection if provided, otherwise use internal
  const rowIds = useMemo(() => releases.map(r => r.id), [releases]);
  const rowIdSet = useMemo(() => new Set(rowIds), [rowIds]);
  const internalSelection = useRowSelection(rowIds);

  const selectedIds = externalSelectedIds ?? internalSelection.selectedIds;

  // Compute visible selected (intersection of selectedIds and current rowIds)
  const visibleSelectedCount = useMemo(() => {
    let count = 0;
    for (const id of selectedIds) {
      if (rowIdSet.has(id)) count++;
    }
    return count;
  }, [selectedIds, rowIdSet]);

  // Compute header checkbox state based on visible selection
  const headerCheckboxState = useMemo(() => {
    // Use internal state if no external selection provided
    if (externalSelectedIds === undefined) {
      return internalSelection.headerCheckboxState;
    }
    // Compute from visible selection
    if (visibleSelectedCount === 0) return false;
    if (visibleSelectedCount === rowIds.length) return true;
    return 'indeterminate';
  }, [
    externalSelectedIds,
    internalSelection.headerCheckboxState,
    visibleSelectedCount,
    rowIds.length,
  ]);

  const toggleSelect = useCallback(
    (id: string) => {
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
    },
    [onSelectionChange, selectedIds, internalSelection.toggleSelect]
  );

  const toggleSelectAll = useCallback(() => {
    if (onSelectionChange) {
      // Check if all visible rows are selected
      if (visibleSelectedCount === rowIds.length) {
        // Deselect all visible rows (preserve non-visible selections)
        const newSet = new Set(selectedIds);
        for (const id of rowIds) {
          newSet.delete(id);
        }
        onSelectionChange(newSet);
      } else {
        // Select all visible rows (preserve existing selections)
        const newSet = new Set(selectedIds);
        for (const id of rowIds) {
          newSet.add(id);
        }
        onSelectionChange(newSet);
      }
    } else {
      internalSelection.toggleSelectAll();
    }
  }, [
    onSelectionChange,
    visibleSelectedCount,
    rowIds,
    selectedIds,
    internalSelection.toggleSelectAll,
  ]);

  // Context menu items for right-click - memoized to prevent recreation
  const getContextMenuItems = useCallback(
    (release: ReleaseViewModel): ContextMenuItemType[] => {
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
        {
          id: 'copy-release-id',
          label: 'Copy release ID',
          icon: <Icon name='Hash' className='h-3.5 w-3.5' />,
          onClick: () => {
            navigator.clipboard.writeText(release.id);
          },
        },
      ];
    },
    [onEdit, onCopy]
  );

  // Build dynamic column definitions
  const columns = useMemo(() => {
    const checkboxColumn = columnHelper.display({
      id: 'select',
      header: createSelectHeaderRenderer(headerCheckboxState, toggleSelectAll),
      cell: createSelectCellRenderer(selectedIds, toggleSelect),
      size: 56,
    });

    // All provider keys for the availability cell
    const allProviders = Object.keys(providerConfig) as ProviderKey[];

    // Column definitions in logical order
    const columns = [
      // Release column (artwork + title + artist) with inline bulk actions
      columnHelper.accessor('title', {
        id: 'release',
        header: createReleaseHeaderRenderer(
          selectedIds.size,
          bulkActions,
          onClearSelection
        ),
        cell: createReleaseCellRenderer(artistName),
        size: 280,
        enableSorting: true,
      }),

      // Release type column (badge)
      columnHelper.accessor('releaseType', {
        id: 'releaseType',
        header: 'Type',
        cell: renderReleaseTypeCell,
        size: 80,
        enableSorting: true,
      }),

      // Availability column showing all providers
      columnHelper.display({
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
      }),

      // Smart link column
      columnHelper.display({
        id: 'smartLink',
        header: 'Smart link',
        cell: createSmartLinkCellRenderer(onCopy),
        size: 180,
      }),

      // Release date column (sortable)
      columnHelper.accessor('releaseDate', {
        id: 'releaseDate',
        header: 'Released',
        cell: renderReleaseDateCell,
        size: 70,
        enableSorting: true,
      }),

      // Spotify popularity column
      columnHelper.accessor('spotifyPopularity', {
        id: 'popularity',
        header: 'Popularity',
        cell: renderPopularityCell,
        size: 80,
        enableSorting: true,
      }),

      // ISRC column (copyable)
      columnHelper.accessor('primaryIsrc', {
        id: 'primaryIsrc',
        header: 'ISRC',
        cell: renderIsrcCell,
        size: 120,
        enableSorting: true,
      }),

      // UPC column (copyable)
      columnHelper.accessor('upc', {
        id: 'upc',
        header: 'UPC',
        cell: renderUpcCell,
        size: 130,
        enableSorting: true,
      }),

      // Label column
      columnHelper.accessor('label', {
        id: 'label',
        header: 'Label',
        cell: renderLabelCell,
        size: 150,
        enableSorting: true,
      }),

      // Total tracks column
      columnHelper.accessor('totalTracks', {
        id: 'totalTracks',
        header: 'Tracks',
        cell: renderTotalTracksCell,
        size: 60,
        enableSorting: true,
      }),

      // Duration column
      columnHelper.accessor('totalDurationMs', {
        id: 'totalDurationMs',
        header: 'Duration',
        cell: renderDurationCell,
        size: 80,
        enableSorting: true,
      }),

      // Genres column
      columnHelper.accessor('genres', {
        id: 'genres',
        header: 'Genre',
        cell: renderGenresCell,
        size: 120,
      }),

      // Actions column - header shows toolbar buttons, cells show row menu
      columnHelper.display({
        id: 'actions',
        header: createActionsHeaderRenderer(
          selectedIds.size,
          onClearSelection,
          onSync,
          isSyncing
        ),
        cell: createActionsCellRenderer(getContextMenuItems),
        size: 80,
      }),
    ];

    const allColumns = [checkboxColumn, ...columns];

    // Filter columns based on visibility (always show select, release, actions)
    if (!columnVisibility) return allColumns;

    return allColumns.filter(col => {
      const id = col.id;
      if (!id) return true;
      // Always show select, release, actions
      if (id === 'select' || id === 'release' || id === 'actions') return true;
      // Check visibility state (default to visible if not specified)
      return columnVisibility[id] !== false;
    });
  }, [
    providerConfig,
    artistName,
    onCopy,
    onAddUrl,
    isAddingUrl,
    headerCheckboxState,
    selectedIds.size,
    releases.length,
    bulkActions,
    onClearSelection,
    isSyncing,
    onSync,
    toggleSelect,
    toggleSelectAll,
    getContextMenuItems,
    columnVisibility,
  ]);

  // Fixed min width - availability column consolidates all providers
  const minWidth = `${RELEASE_TABLE_WIDTHS.BASE + RELEASE_TABLE_WIDTHS.PROVIDER_COLUMN}px`;

  return (
    <UnifiedTable
      data={releases}
      columns={columns as ColumnDef<ReleaseViewModel, unknown>[]}
      sorting={sorting}
      onSortingChange={handleSortingChange}
      isLoading={isSorting && releases.length > LARGE_DATASET_THRESHOLD}
      getContextMenuItems={getContextMenuItems}
      onRowClick={onEdit}
      getRowId={row => row.id}
      getRowClassName={row =>
        selectedIds.has(row.id)
          ? 'group bg-blue-50 dark:bg-blue-950/30 border-l-2 border-l-blue-600'
          : 'group hover:bg-surface-2/50'
      }
      enableVirtualization // Auto-enabled at 20+ rows, explicit for large datasets
      rowHeight={rowHeight}
      minWidth={minWidth}
      className='text-[13px]'
    />
  );
}
