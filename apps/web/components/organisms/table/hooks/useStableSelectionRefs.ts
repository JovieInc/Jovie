'use client';

/**
 * useStableSelectionRefs Hook
 *
 * Provides stable refs and callbacks for table row selection that prevent
 * column recreation when selection changes. This is critical for preventing
 * infinite render loops in tables using TanStack Table.
 *
 * The Problem:
 * When selection state changes, if callbacks reference that state directly,
 * they get recreated. When those callbacks are used in column definitions,
 * the columns get recreated, triggering re-renders, which can cause loops.
 *
 * The Solution:
 * Use refs to read current values at render time, and useCallback with stable
 * dependencies. This hook encapsulates this pattern for reuse across tables.
 *
 * @example
 * const { selectedIdsRef, headerCheckboxStateRef, toggleSelect, toggleSelectAll } =
 *   useStableSelectionRefs({
 *     selectedIds,
 *     rowIds,
 *     headerCheckboxState,
 *     onSelectionChange, // For controlled mode
 *   });
 *
 * // Use with createSelectionColumnFactory
 * const { createHeaderRenderer, createCellRenderer } = createSelectionColumnFactory({
 *   selectedIdsRef,
 *   headerCheckboxStateRef,
 *   getRowId: (row) => row.id,
 *   onToggleSelect: toggleSelect,
 *   onToggleSelectAll: toggleSelectAll,
 * });
 */

import { useCallback, useRef } from 'react';
import type { HeaderCheckboxState } from './useRowSelection';

/**
 * Options for the useStableSelectionRefs hook.
 */
export interface UseStableSelectionRefsOptions {
  /** Current set of selected row IDs */
  selectedIds: Set<string>;
  /** All row IDs in the current view (used for "select all" logic) */
  rowIds: string[];
  /** Current header checkbox state (false, true, or 'indeterminate') */
  headerCheckboxState: HeaderCheckboxState;
  /**
   * External selection change handler (controlled mode).
   * If provided, toggleSelect and toggleSelectAll will call this.
   */
  onSelectionChange?: (ids: Set<string>) => void;
  /**
   * Internal toggle function (uncontrolled mode).
   * Used when onSelectionChange is not provided.
   */
  internalToggleSelect?: (id: string) => void;
  /**
   * Internal toggle all function (uncontrolled mode).
   * Used when onSelectionChange is not provided.
   */
  internalToggleSelectAll?: () => void;
}

/**
 * Return type for useStableSelectionRefs hook.
 */
export interface UseStableSelectionRefsResult {
  /** Ref to current selected IDs - read at render time to prevent column recreation */
  selectedIdsRef: React.RefObject<Set<string>>;
  /** Ref to all row IDs - read at render time for select all calculations */
  rowIdsRef: React.RefObject<string[]>;
  /** Ref to header checkbox state - read at render time to prevent column recreation */
  headerCheckboxStateRef: React.RefObject<HeaderCheckboxState>;
  /**
   * Stable callback to toggle a single row's selection.
   * Works in both controlled (onSelectionChange) and uncontrolled (internalToggleSelect) modes.
   */
  toggleSelect: (id: string) => void;
  /**
   * Stable callback to toggle all visible rows.
   * Works in both controlled and uncontrolled modes.
   */
  toggleSelectAll: () => void;
}

/**
 * Hook that provides stable refs and callbacks for table row selection.
 *
 * This hook is designed to work with both controlled and uncontrolled selection:
 * - Controlled: Pass onSelectionChange, the hook will update via that callback
 * - Uncontrolled: Pass internalToggleSelect/internalToggleSelectAll from useRowSelection
 *
 * @param options Configuration for selection refs
 * @returns Refs and stable callbacks for use with column factories
 */
export function useStableSelectionRefs({
  selectedIds,
  rowIds,
  headerCheckboxState,
  onSelectionChange,
  internalToggleSelect,
  internalToggleSelectAll,
}: UseStableSelectionRefsOptions): UseStableSelectionRefsResult {
  // Refs to prevent callback recreation on selection change
  // These refs are updated immediately so they always have current values
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  const rowIdsRef = useRef(rowIds);
  rowIdsRef.current = rowIds;

  const headerCheckboxStateRef = useRef(headerCheckboxState);
  headerCheckboxStateRef.current = headerCheckboxState;

  // Stable callback that reads from refs - never changes reference
  const toggleSelect = useCallback(
    (id: string) => {
      if (onSelectionChange) {
        // Controlled mode: compute new set and call external handler
        const newSet = new Set(selectedIdsRef.current);
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
        onSelectionChange(newSet);
      } else if (internalToggleSelect) {
        // Uncontrolled mode: delegate to internal hook
        internalToggleSelect(id);
      }
    },
    [onSelectionChange, internalToggleSelect]
  );

  // Stable callback for toggling all visible rows
  const toggleSelectAll = useCallback(() => {
    if (onSelectionChange) {
      // Controlled mode: compute based on current visible rows
      const currentRowIds = rowIdsRef.current;
      const currentSelected = selectedIdsRef.current;

      // Check if all visible rows are currently selected
      const allVisibleSelected = currentRowIds.every(id =>
        currentSelected.has(id)
      );

      const newSet = new Set(currentSelected);
      for (const id of currentRowIds) {
        if (allVisibleSelected) {
          // Deselect all visible (but preserve non-visible selections)
          newSet.delete(id);
        } else {
          // Select all visible
          newSet.add(id);
        }
      }
      onSelectionChange(newSet);
    } else if (internalToggleSelectAll) {
      // Uncontrolled mode: delegate to internal hook
      internalToggleSelectAll();
    }
  }, [onSelectionChange, internalToggleSelectAll]);

  return {
    selectedIdsRef,
    rowIdsRef,
    headerCheckboxStateRef,
    toggleSelect,
    toggleSelectAll,
  };
}
