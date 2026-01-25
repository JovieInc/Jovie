'use client';

/**
 * useSortingManager Hook
 *
 * Manages TanStack Table sorting state with nuqs URL persistence and debouncing.
 * Provides optimized sorting for large datasets with visual feedback during updates.
 *
 * Features:
 * - URL-persisted sort state via nuqs for shareable/bookmarkable URLs
 * - Debounced sorting for datasets > 500 rows to prevent UI jank
 * - React transition for smooth loading states
 * - Ref-based state tracking to avoid stale closures
 */

import { useDebouncer } from '@tanstack/react-pacer';
import type { SortingState } from '@tanstack/react-table';
import { useCallback, useMemo, useRef, useTransition } from 'react';
import { type ReleaseSortField, useReleaseSortParams } from '@/lib/nuqs/hooks';

/** Threshold above which sorting is debounced to prevent UI jank */
const LARGE_DATASET_THRESHOLD = 500;

/** Debounce wait time in milliseconds */
const DEBOUNCE_WAIT_MS = 150;

export interface UseSortingManagerOptions {
  /** Number of rows in the dataset (used to determine if debouncing is needed) */
  rowCount: number;
}

export interface UseSortingManagerResult {
  /** Current sorting state in TanStack Table format */
  sorting: SortingState;
  /** Handler for TanStack Table's onSortingChange */
  onSortingChange: (
    updater: SortingState | ((old: SortingState) => SortingState)
  ) => void;
  /** Whether a sort operation is in progress (for loading indicators) */
  isSorting: boolean;
  /** Whether this is a large dataset that uses debounced sorting */
  isLargeDataset: boolean;
}

/**
 * Hook for managing table sorting with URL persistence and debouncing.
 *
 * @example
 * const { sorting, onSortingChange, isSorting, isLargeDataset } = useSortingManager({
 *   rowCount: releases.length,
 * });
 *
 * <UnifiedTable
 *   sorting={sorting}
 *   onSortingChange={onSortingChange}
 *   isLoading={isSorting && isLargeDataset}
 * />
 */
export function useSortingManager({
  rowCount,
}: UseSortingManagerOptions): UseSortingManagerResult {
  // URL-persisted sort state via nuqs - enables shareable URLs
  const [urlSortState, { setSorting: nuqsSetSorting }] = useReleaseSortParams();

  // Convert nuqs state to TanStack SortingState format
  const sorting = useMemo<SortingState>(
    () => [{ id: urlSortState.sort, desc: urlSortState.direction === 'desc' }],
    [urlSortState.sort, urlSortState.direction]
  );

  const [isSorting, startTransition] = useTransition();

  // Ref to track current sorting for debouncer (avoids stale closure)
  const sortingRef = useRef(sorting);
  sortingRef.current = sorting;

  // Ref to store debouncer execute function - prevents callback recreation
  const sortingDebouncerRef = useRef<
    ((field: ReleaseSortField, direction: 'asc' | 'desc') => void) | null
  >(null);

  // Memoized callback for the debouncer to prevent recreation on every render
  const debouncedSortingCallback = useCallback(
    (field: ReleaseSortField, direction: 'asc' | 'desc') => {
      startTransition(() => {
        nuqsSetSorting(field, direction);
      });
    },
    [nuqsSetSorting]
  );

  // Debounced sorting for large datasets - prevents UI jank during rapid sort changes
  const sortingDebouncer = useDebouncer(debouncedSortingCallback, {
    wait: DEBOUNCE_WAIT_MS,
  });

  // Keep ref updated with latest debouncer function
  sortingDebouncerRef.current = sortingDebouncer.maybeExecute;

  const isLargeDataset = rowCount > LARGE_DATASET_THRESHOLD;

  // Handle sorting changes from TanStack Table, routing to nuqs
  // Use immediate sorting for small datasets, debounced for large
  const onSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const newSorting =
        typeof updater === 'function' ? updater(sortingRef.current) : updater;

      // Extract field and direction from TanStack sorting state
      const sortItem = newSorting[0];
      if (!sortItem) return;

      const field = sortItem.id as ReleaseSortField;
      const direction = sortItem.desc ? 'desc' : 'asc';

      // Update ref immediately to prevent stale state during rapid debounced updates
      sortingRef.current = newSorting;

      if (isLargeDataset) {
        sortingDebouncerRef.current?.(field, direction);
      } else {
        nuqsSetSorting(field, direction);
      }
    },
    [isLargeDataset, nuqsSetSorting]
  );

  return {
    sorting,
    onSortingChange,
    isSorting,
    isLargeDataset,
  };
}
