import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LIBRARY_GRID_DENSITY,
  DEFAULT_LIBRARY_VIEW_MODE,
  LIBRARY_GRID_DENSITY_STORAGE_KEY,
  LIBRARY_VIEW_MODE_STORAGE_KEY,
  readLibraryGridDensity,
  readLibraryViewMode,
  writeLibraryGridDensity,
  writeLibraryViewMode,
} from '@/app/app/(shell)/library/library-grid-preferences';

describe('library grid preferences', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to comfortable density when no preference is stored', () => {
    expect(readLibraryGridDensity()).toBe(DEFAULT_LIBRARY_GRID_DENSITY);
  });

  it('persists and reads compact, comfortable, and spacious densities', () => {
    writeLibraryGridDensity('compact');
    expect(storage.get(LIBRARY_GRID_DENSITY_STORAGE_KEY)).toBe('compact');
    expect(readLibraryGridDensity()).toBe('compact');

    writeLibraryGridDensity('spacious');
    expect(readLibraryGridDensity()).toBe('spacious');
  });

  it('falls back to the default for invalid stored values', () => {
    storage.set(LIBRARY_GRID_DENSITY_STORAGE_KEY, 'xl');
    expect(readLibraryGridDensity()).toBe(DEFAULT_LIBRARY_GRID_DENSITY);
  });
});

describe('library view mode preferences', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to list view when no preference is stored', () => {
    expect(readLibraryViewMode()).toBe(DEFAULT_LIBRARY_VIEW_MODE);
    expect(readLibraryViewMode()).toBe('list');
  });

  it('persists and reads grid, list, and table view modes', () => {
    writeLibraryViewMode('grid');
    expect(storage.get(LIBRARY_VIEW_MODE_STORAGE_KEY)).toBe('grid');
    expect(readLibraryViewMode()).toBe('grid');

    writeLibraryViewMode('table');
    expect(readLibraryViewMode()).toBe('table');

    writeLibraryViewMode('list');
    expect(readLibraryViewMode()).toBe('list');
  });

  it('falls back to the default for invalid stored view modes', () => {
    storage.set(LIBRARY_VIEW_MODE_STORAGE_KEY, 'gallery');
    expect(readLibraryViewMode()).toBe(DEFAULT_LIBRARY_VIEW_MODE);
  });
});
