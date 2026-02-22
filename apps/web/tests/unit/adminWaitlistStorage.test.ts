import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  persistGroupingPreference,
  persistViewModePreference,
  readGroupingPreference,
  readViewModePreference,
} from '@/components/admin/waitlist-table/storage';

describe('admin waitlist storage helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('returns safe defaults when localStorage is null', () => {
    vi.stubGlobal('localStorage', null);

    expect(readViewModePreference()).toBe('list');
    expect(readGroupingPreference()).toBe(false);
    expect(() => persistViewModePreference('board')).not.toThrow();
    expect(() => persistGroupingPreference(true)).not.toThrow();
  });

  it('reads and writes persisted preferences', () => {
    persistViewModePreference('board');
    persistGroupingPreference(true);

    expect(readViewModePreference()).toBe('board');
    expect(readGroupingPreference()).toBe(true);
  });
});
