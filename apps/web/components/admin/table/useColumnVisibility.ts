'use client';

import type { VisibilityState } from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ColumnConfig,
  ColumnVisibilityState,
} from './molecules/ColumnToggleGroup';
import { createInitialVisibility } from './molecules/ColumnToggleGroup';

export interface UseColumnVisibilityOptions {
  /**
   * Column configuration array
   */
  columns: ColumnConfig[];
  /**
   * Unique key for localStorage persistence
   * @example 'creators-table-columns'
   */
  storageKey: string;
  /**
   * Whether to persist visibility state to localStorage
   * @default true
   */
  persist?: boolean;
}

export interface UseColumnVisibilityReturn {
  /**
   * Current visibility state (for ColumnToggleGroup)
   */
  visibility: ColumnVisibilityState;
  /**
   * Visibility state formatted for TanStack Table
   */
  tanstackVisibility: VisibilityState;
  /**
   * Toggle a column's visibility
   */
  toggleColumn: (columnId: string, visible: boolean) => void;
  /**
   * Reset all columns to their default visibility
   */
  resetToDefaults: () => void;
  /**
   * Show all toggleable columns
   */
  showAll: () => void;
  /**
   * Hide all toggleable columns
   */
  hideAll: () => void;
  /**
   * Check if a specific column is visible
   */
  isColumnVisible: (columnId: string) => boolean;
  /**
   * Get count of visible columns (excluding always-visible columns)
   */
  visibleCount: number;
  /**
   * Get count of hidden columns
   */
  hiddenCount: number;
}

/**
 * useColumnVisibility - Hook for managing table column visibility
 *
 * Provides state management and localStorage persistence for column visibility.
 * Integrates with both the ColumnToggleGroup component and TanStack Table.
 *
 * Features:
 * - Automatic localStorage persistence
 * - SSR-safe initialization
 * - TanStack Table integration via tanstackVisibility
 * - Bulk operations (show all, hide all, reset)
 * - Respects canToggle configuration (required columns stay visible)
 *
 * @example
 * ```tsx
 * const columnConfig: ColumnConfig[] = [
 *   { id: 'avatar', label: 'Creator', canToggle: false },
 *   { id: 'social', label: 'Social Links', defaultVisible: true },
 *   { id: 'created', label: 'Created', defaultVisible: true },
 * ];
 *
 * const {
 *   visibility,
 *   tanstackVisibility,
 *   toggleColumn,
 * } = useColumnVisibility({
 *   columns: columnConfig,
 *   storageKey: 'creators-table-columns',
 * });
 *
 * // Use with ColumnToggleGroup
 * <ColumnToggleGroup
 *   columns={columnConfig}
 *   visibility={visibility}
 *   onVisibilityChange={toggleColumn}
 * />
 *
 * // Use with UnifiedTable
 * <UnifiedTable
 *   columnVisibility={tanstackVisibility}
 * />
 * ```
 */
export function useColumnVisibility({
  columns,
  storageKey,
  persist = true,
}: UseColumnVisibilityOptions): UseColumnVisibilityReturn {
  // Create initial state from column config
  const defaultVisibility = useMemo(
    () => createInitialVisibility(columns),
    [columns]
  );

  // Initialize state with default values
  const [visibility, setVisibility] =
    useState<ColumnVisibilityState>(defaultVisibility);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage on mount (client-side only)
  useEffect(() => {
    if (!persist || typeof window === 'undefined') {
      setIsHydrated(true);
      return;
    }

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as ColumnVisibilityState;
        // Merge with defaults to handle new columns or removed columns
        setVisibility(_prev => {
          const merged = { ...defaultVisibility };
          // Only use stored values for columns that exist and can be toggled
          for (const col of columns) {
            if (col.canToggle !== false && parsed[col.id] !== undefined) {
              merged[col.id] = parsed[col.id];
            }
          }
          return merged;
        });
      }
    } catch {
      // Invalid stored data, use defaults
    }
    setIsHydrated(true);
  }, [storageKey, persist, defaultVisibility, columns]);

  // Persist to localStorage when visibility changes (after hydration)
  useEffect(() => {
    if (!persist || !isHydrated || typeof window === 'undefined') {
      return;
    }

    try {
      // Only store toggleable columns
      const toStore: ColumnVisibilityState = {};
      for (const col of columns) {
        if (col.canToggle !== false) {
          toStore[col.id] = visibility[col.id] ?? true;
        }
      }
      localStorage.setItem(storageKey, JSON.stringify(toStore));
    } catch {
      // Storage not available
    }
  }, [visibility, storageKey, persist, isHydrated, columns]);

  // Toggle a single column
  const toggleColumn = useCallback(
    (columnId: string, visible: boolean) => {
      // Find the column config
      const column = columns.find(c => c.id === columnId);

      // Don't allow toggling required columns
      if (column?.canToggle === false) {
        return;
      }

      setVisibility(prev => ({
        ...prev,
        [columnId]: visible,
      }));
    },
    [columns]
  );

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    setVisibility(defaultVisibility);
  }, [defaultVisibility]);

  // Show all toggleable columns
  const showAll = useCallback(() => {
    setVisibility(prev => {
      const next = { ...prev };
      for (const col of columns) {
        if (col.canToggle !== false) {
          next[col.id] = true;
        }
      }
      return next;
    });
  }, [columns]);

  // Hide all toggleable columns
  const hideAll = useCallback(() => {
    setVisibility(prev => {
      const next = { ...prev };
      for (const col of columns) {
        if (col.canToggle !== false) {
          next[col.id] = false;
        }
      }
      return next;
    });
  }, [columns]);

  // Check if a column is visible
  const isColumnVisible = useCallback(
    (columnId: string): boolean => {
      const column = columns.find(c => c.id === columnId);
      // Required columns are always visible
      if (column?.canToggle === false) {
        return true;
      }
      return visibility[columnId] ?? column?.defaultVisible ?? true;
    },
    [visibility, columns]
  );

  // Convert to TanStack Table format
  // TanStack Table expects false for hidden columns, missing or true for visible
  const tanstackVisibility = useMemo((): VisibilityState => {
    const result: VisibilityState = {};
    for (const col of columns) {
      const isVisible = visibility[col.id] ?? col.defaultVisible ?? true;
      // TanStack Table: only include false values (hidden columns)
      // True values can be omitted
      if (!isVisible) {
        result[col.id] = false;
      }
    }
    return result;
  }, [visibility, columns]);

  // Count visible/hidden toggleable columns
  const { visibleCount, hiddenCount } = useMemo(() => {
    let visible = 0;
    let hidden = 0;
    for (const col of columns) {
      if (col.canToggle !== false) {
        const isVisible = visibility[col.id] ?? col.defaultVisible ?? true;
        if (isVisible) {
          visible++;
        } else {
          hidden++;
        }
      }
    }
    return { visibleCount: visible, hiddenCount: hidden };
  }, [visibility, columns]);

  return {
    visibility,
    tanstackVisibility,
    toggleColumn,
    resetToDefaults,
    showAll,
    hideAll,
    isColumnVisible,
    visibleCount,
    hiddenCount,
  };
}
