'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ColumnVisibility,
  Density,
} from '@/components/organisms/table/molecules/DisplayMenuDropdown';

const STORAGE_KEY = 'jovie:releases-table-preferences';

/** Row heights for each density level */
export const DENSITY_ROW_HEIGHTS: Record<Density, number> = {
  compact: 36,
  normal: 44,
  comfortable: 56,
} as const;

/** Column IDs that can be toggled */
export const TOGGLEABLE_COLUMNS = [
  { id: 'releaseType', label: 'Type' },
  { id: 'availability', label: 'Availability' },
  { id: 'smartLink', label: 'Smart Link' },
  { id: 'genres', label: 'Genres' },
  { id: 'stats', label: 'Stats' },
  { id: 'upc', label: 'UPC' },
  { id: 'primaryIsrc', label: 'ISRC' },
] as const;

/** Columns always visible (cannot be toggled off) */
const ALWAYS_VISIBLE_COLUMNS = ['select', 'release', 'actions'];

/** Default column visibility for desktop - cleaner view with essential columns */
const DEFAULT_DESKTOP_VISIBILITY: ColumnVisibility = {
  releaseType: false, // Moved into release cell
  availability: false, // Hidden for now - accessible via context menu
  smartLink: true,
  genres: true,
  upc: true,
  stats: true,
};

/** Default column visibility for tablet (768-1024px) */
const DEFAULT_TABLET_VISIBILITY: ColumnVisibility = {
  releaseType: false,
  availability: false,
  smartLink: true,
  genres: true,
  upc: true,
  stats: true,
};

/** Default column visibility for mobile (<768px) */
const DEFAULT_MOBILE_VISIBILITY: ColumnVisibility = {
  releaseType: false,
  availability: false,
  smartLink: true,
  genres: true,
  upc: true,
  stats: true,
};

export interface ReleaseTablePreset {
  name: string;
  columnVisibility: ColumnVisibility;
  density: Density;
}

interface StoredPreferences {
  columnVisibility: ColumnVisibility;
  density: Density;
  presets: ReleaseTablePreset[];
  showTracks?: boolean;
  groupByYear?: boolean;
}

function getDefaultVisibilityForBreakpoint(): ColumnVisibility {
  if (typeof window === 'undefined') return DEFAULT_DESKTOP_VISIBILITY;
  const width = globalThis.innerWidth;
  if (width < 768) return DEFAULT_MOBILE_VISIBILITY;
  if (width < 1024) return DEFAULT_TABLET_VISIBILITY;
  return DEFAULT_DESKTOP_VISIBILITY;
}

function loadPreferences(): StoredPreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as StoredPreferences;
    }
  } catch {
    // Invalid JSON, return null
  }
  return null;
}

function savePreferences(prefs: StoredPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage full or unavailable
  }
}

/**
 * Hook for managing release table display preferences with localStorage persistence.
 *
 * Features:
 * - Column visibility toggles
 * - Density settings (compact/normal/comfortable)
 * - Saved presets
 * - Responsive defaults based on screen size
 */
export function useReleaseTablePreferences() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>(
    getDefaultVisibilityForBreakpoint
  );
  const [density, setDensity] = useState<Density>('normal');
  const [presets, setPresets] = useState<ReleaseTablePreset[]>([]);
  const [showTracks, setShowTracks] = useState(false);
  const [groupByYear, setGroupByYear] = useState(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const stored = loadPreferences();
    if (stored) {
      // Merge stored visibility with defaults to pick up new columns
      const defaults = getDefaultVisibilityForBreakpoint();
      setColumnVisibility({ ...defaults, ...stored.columnVisibility });
      setDensity(stored.density);
      setPresets(stored.presets || []);
      setShowTracks(stored.showTracks ?? false);
      setGroupByYear(stored.groupByYear ?? false);
    }
    setIsLoaded(true);
  }, []);

  // Persist preferences when they change
  useEffect(() => {
    if (!isLoaded) return;
    savePreferences({
      columnVisibility,
      density,
      presets,
      showTracks,
      groupByYear,
    });
  }, [columnVisibility, density, presets, showTracks, groupByYear, isLoaded]);

  const handleColumnVisibilityChange = useCallback(
    (columnId: string, visible: boolean) => {
      setColumnVisibility(prev => ({
        ...prev,
        [columnId]: visible,
      }));
    },
    []
  );

  const handleDensityChange = useCallback((newDensity: Density) => {
    setDensity(newDensity);
  }, []);

  const handleShowTracksChange = useCallback((show: boolean) => {
    setShowTracks(show);
  }, []);

  const handleGroupByYearChange = useCallback((group: boolean) => {
    setGroupByYear(group);
  }, []);

  const resetToDefaults = useCallback(() => {
    setColumnVisibility(getDefaultVisibilityForBreakpoint());
    setDensity('normal');
    setShowTracks(false);
    setGroupByYear(false);
  }, []);

  const savePreset = useCallback(
    (name: string) => {
      const newPreset: ReleaseTablePreset = {
        name,
        columnVisibility: { ...columnVisibility },
        density,
      };
      setPresets(prev => {
        // Replace existing preset with same name, or add new
        const filtered = prev.filter(p => p.name !== name);
        return [...filtered, newPreset];
      });
    },
    [columnVisibility, density]
  );

  const loadPreset = useCallback((preset: ReleaseTablePreset) => {
    setColumnVisibility(preset.columnVisibility);
    setDensity(preset.density);
  }, []);

  const deletePreset = useCallback((name: string) => {
    setPresets(prev => prev.filter(p => p.name !== name));
  }, []);

  // Compute effective visibility (merge with always-visible columns)
  const effectiveColumnVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = { ...columnVisibility };
    for (const col of ALWAYS_VISIBLE_COLUMNS) {
      visibility[col] = true;
    }
    return visibility;
  }, [columnVisibility]);

  const rowHeight = DENSITY_ROW_HEIGHTS[density];

  return {
    // State
    columnVisibility,
    effectiveColumnVisibility,
    density,
    rowHeight,
    presets,
    isLoaded,
    showTracks,
    groupByYear,

    // Handlers
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onDensityChange: handleDensityChange,
    onShowTracksChange: handleShowTracksChange,
    onGroupByYearChange: handleGroupByYearChange,
    resetToDefaults,
    savePreset,
    loadPreset,
    deletePreset,

    // Constants for UI
    availableColumns: TOGGLEABLE_COLUMNS,
  };
}
