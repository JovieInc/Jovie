import type { ViewMode } from '@/components/organisms/table';

const VIEW_MODE_STORAGE_KEY = 'waitlist-view-mode';
const GROUPING_STORAGE_KEY = 'waitlist-grouping-enabled';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return globalThis.localStorage;
}

export function readViewModePreference(): ViewMode {
  try {
    const stored = getStorage()?.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored === 'list' || stored === 'board') {
      return stored;
    }
  } catch {
    // Ignore storage errors and fall back to default.
  }

  return 'list';
}

export function readGroupingPreference(): boolean {
  try {
    return getStorage()?.getItem(GROUPING_STORAGE_KEY) === 'true';
  } catch {
    // Ignore storage errors and fall back to default.
    return false;
  }
}

export function persistViewModePreference(viewMode: ViewMode): void {
  try {
    getStorage()?.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  } catch {
    // Ignore storage errors.
  }
}

export function persistGroupingPreference(groupingEnabled: boolean): void {
  try {
    getStorage()?.setItem(GROUPING_STORAGE_KEY, String(groupingEnabled));
  } catch {
    // Ignore storage errors.
  }
}
