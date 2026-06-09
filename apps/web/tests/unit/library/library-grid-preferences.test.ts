import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LIBRARY_GRID_DENSITY,
  LIBRARY_GRID_DENSITY_STORAGE_KEY,
  readLibraryGridDensity,
  writeLibraryGridDensity,
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
