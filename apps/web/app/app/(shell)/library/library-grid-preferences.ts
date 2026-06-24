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

function readStoredPreference<T extends string>(
  storageKey: string,
  parse: (value: string | null) => T,
  defaultValue: T
): T {
  if (typeof window === 'undefined') return defaultValue;

  try {
    return parse(window.localStorage.getItem(storageKey));
  } catch {
    return defaultValue;
  }
}

function writeStoredPreference(storageKey: string, value: string): void {
  try {
    window.localStorage.setItem(storageKey, value);
  } catch {
    // Ignore storage access errors.
  }
}

function useStoredPreference<T extends string>(
  defaultValue: T,
  read: () => T,
  write: (value: T) => void
): {
  readonly value: T;
  readonly setValue: (value: T) => void;
} {
  const [value, setValueState] = useState<T>(defaultValue);

  useEffect(() => {
    setValueState(read());
  }, [read]);

  const setValue = useCallback(
    (next: T) => {
      setValueState(next);
      write(next);
    },
    [write]
  );

  return { value, setValue };
}

function parseLibraryGridDensity(value: string | null): LibraryGridDensity {
  if (value === 'compact' || value === 'comfortable' || value === 'spacious') {
    return value;
  }
  return DEFAULT_LIBRARY_GRID_DENSITY;
}

export function readLibraryGridDensity(): LibraryGridDensity {
  return readStoredPreference(
    LIBRARY_GRID_DENSITY_STORAGE_KEY,
    parseLibraryGridDensity,
    DEFAULT_LIBRARY_GRID_DENSITY
  );
}

export function writeLibraryGridDensity(density: LibraryGridDensity): void {
  writeStoredPreference(LIBRARY_GRID_DENSITY_STORAGE_KEY, density);
}

export function useLibraryGridDensity(): {
  readonly density: LibraryGridDensity;
  readonly setDensity: (density: LibraryGridDensity) => void;
} {
  const { value, setValue } = useStoredPreference(
    DEFAULT_LIBRARY_GRID_DENSITY,
    readLibraryGridDensity,
    writeLibraryGridDensity
  );

  return { density: value, setDensity: setValue };
}

function parseLibraryViewMode(value: string | null): LibraryViewMode {
  if (value === 'grid' || value === 'list' || value === 'table') {
    return value;
  }
  return DEFAULT_LIBRARY_VIEW_MODE;
}

export function readLibraryViewMode(): LibraryViewMode {
  return readStoredPreference(
    LIBRARY_VIEW_MODE_STORAGE_KEY,
    parseLibraryViewMode,
    DEFAULT_LIBRARY_VIEW_MODE
  );
}

export function writeLibraryViewMode(view: LibraryViewMode): void {
  writeStoredPreference(LIBRARY_VIEW_MODE_STORAGE_KEY, view);
}

export function useLibraryViewMode(): {
  readonly view: LibraryViewMode;
  readonly setView: (view: LibraryViewMode) => void;
} {
  const { value, setValue } = useStoredPreference(
    DEFAULT_LIBRARY_VIEW_MODE,
    readLibraryViewMode,
    writeLibraryViewMode
  );

  return { view: value, setView: setValue };
}
