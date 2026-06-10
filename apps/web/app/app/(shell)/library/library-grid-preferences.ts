'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LibraryGridDensity } from './library-data';

export const LIBRARY_GRID_DENSITY_STORAGE_KEY = 'jovie:library-grid-density';

export const DEFAULT_LIBRARY_GRID_DENSITY: LibraryGridDensity = 'comfortable';

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
