'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LibraryGridDensity, LibraryViewMode } from './library-data';

export const LIBRARY_GRID_DENSITY_STORAGE_KEY = 'jovie:library-grid-density';
export const LIBRARY_VIEW_MODE_STORAGE_KEY = 'jovie:library-view-mode';

export const DEFAULT_LIBRARY_GRID_DENSITY: LibraryGridDensity = 'comfortable';
export const DEFAULT_LIBRARY_VIEW_MODE: LibraryViewMode = 'list';

export const LIBRARY_GRID_DENSITY_OPTIONS: readonly {
  readonly value: LibraryGridDensity;
  readonly label: 'S' | 'M' | 'L';
  readonly tooltip: string;
}[] = [
  { value: 'compact', label: 'S', tooltip: 'Small cards' },
  { value: 'comfortable', label: 'M', tooltip: 'Medium cards' },
  { value: 'spacious', label: 'L', tooltip: 'Large cards' },
] as const;

function parseLibraryGridDensity(value: string | null): LibraryGridDensity {
  if (value === 'compact' || value === 'comfortable' || value === 'spacious') {
    return value;
  }
  return DEFAULT_LIBRARY_GRID_DENSITY;
}

export function readLibraryGridDensity(): LibraryGridDensity {
  if (typeof window === 'undefined') return DEFAULT_LIBRARY_GRID_DENSITY;

  try {
    return parseLibraryGridDensity(
      window.localStorage.getItem(LIBRARY_GRID_DENSITY_STORAGE_KEY)
    );
  } catch {
    return DEFAULT_LIBRARY_GRID_DENSITY;
  }
}

export function writeLibraryGridDensity(density: LibraryGridDensity): void {
  try {
    window.localStorage.setItem(LIBRARY_GRID_DENSITY_STORAGE_KEY, density);
  } catch {
    // Ignore storage access errors.
  }
}

export function useLibraryGridDensity(): {
  readonly density: LibraryGridDensity;
  readonly setDensity: (density: LibraryGridDensity) => void;
} {
  const [density, setDensityState] = useState<LibraryGridDensity>(
    DEFAULT_LIBRARY_GRID_DENSITY
  );

  useEffect(() => {
    setDensityState(readLibraryGridDensity());
  }, []);

  const setDensity = useCallback((next: LibraryGridDensity) => {
    setDensityState(next);
    writeLibraryGridDensity(next);
  }, []);

  return { density, setDensity };
}

function parseLibraryViewMode(value: string | null): LibraryViewMode {
  if (value === 'grid' || value === 'list' || value === 'table') {
    return value;
  }
  return DEFAULT_LIBRARY_VIEW_MODE;
}

export function readLibraryViewMode(): LibraryViewMode {
  if (typeof window === 'undefined') return DEFAULT_LIBRARY_VIEW_MODE;

  try {
    return parseLibraryViewMode(
      window.localStorage.getItem(LIBRARY_VIEW_MODE_STORAGE_KEY)
    );
  } catch {
    return DEFAULT_LIBRARY_VIEW_MODE;
  }
}

export function writeLibraryViewMode(view: LibraryViewMode): void {
  try {
    window.localStorage.setItem(LIBRARY_VIEW_MODE_STORAGE_KEY, view);
  } catch {
    // Ignore storage access errors.
  }
}

export function useLibraryViewMode(): {
  readonly view: LibraryViewMode;
  readonly setView: (view: LibraryViewMode) => void;
} {
  const [view, setViewState] = useState<LibraryViewMode>(
    DEFAULT_LIBRARY_VIEW_MODE
  );

  useEffect(() => {
    setViewState(readLibraryViewMode());
  }, []);

  const setView = useCallback((next: LibraryViewMode) => {
    setViewState(next);
    writeLibraryViewMode(next);
  }, []);

  return { view, setView };
}
