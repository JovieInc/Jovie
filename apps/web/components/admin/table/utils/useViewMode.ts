'use client';

import { useEffect, useState } from 'react';

type ViewMode = 'list' | 'board' | 'timeline';

interface UseViewModeOptions {
  /**
   * Storage key for localStorage
   * Should be unique per table (e.g., 'waitlist-view-mode')
   */
  storageKey: string;

  /**
   * Default view mode
   * @default 'list'
   */
  defaultMode?: ViewMode;

  /**
   * Available view modes for this table
   * @default ['list']
   */
  availableModes?: ViewMode[];
}

/**
 * useViewMode - Hook for managing table view mode with localStorage persistence
 *
 * Features:
 * - Persists view mode preference in localStorage
 * - Supports multiple view modes (list, board, timeline)
 * - Validates mode against available modes
 * - SSR-safe (hydrates from localStorage after mount)
 *
 * Example:
 * ```tsx
 * const { viewMode, setViewMode, availableModes } = useViewMode({
 *   storageKey: 'waitlist-view-mode',
 *   defaultMode: 'list',
 *   availableModes: ['list', 'board'],
 * });
 *
 * return viewMode === 'list' ? (
 *   <UnifiedTable {...props} />
 * ) : (
 *   <KanbanBoard {...props} />
 * );
 * ```
 */
export function useViewMode({
  storageKey,
  defaultMode = 'list',
  availableModes = ['list'],
}: UseViewModeOptions) {
  const [viewMode, setViewModeState] = useState<ViewMode>(defaultMode);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(storageKey) as ViewMode | null;

    if (stored && availableModes.includes(stored)) {
      setViewModeState(stored);
    }

    setIsHydrated(true);
  }, [storageKey, availableModes]);

  // Update localStorage when view mode changes
  const setViewMode = (mode: ViewMode) => {
    if (!availableModes.includes(mode)) {
      console.warn(
        `View mode "${mode}" is not available. Available modes:`,
        availableModes
      );
      return;
    }

    setViewModeState(mode);
    localStorage.setItem(storageKey, mode);
  };

  return {
    viewMode,
    setViewMode,
    availableModes,
    isHydrated,
  };
}
