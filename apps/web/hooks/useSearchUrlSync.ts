'use client';

import { useEffect, useRef } from 'react';
import { mergeHrefSearchParams } from '@/lib/utils/merge-href-search-params';

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Syncs a search term to the URL via history.replaceState (no navigation).
 * Debounced to avoid spamming the browser history on every keystroke.
 * The URL stays bookmarkable without triggering server re-renders.
 */
export function useSearchUrlSync(
  search: string,
  basePath: string,
  debounceMs = DEFAULT_DEBOUNCE_MS
): void {
  const initialRef = useRef(search);

  useEffect(() => {
    const trimmed = search.trim() || null;
    const initial = initialRef.current.trim() || null;

    // Don't update URL if it matches the initial value from server
    if (trimmed === initial) return;

    const timeout = globalThis.setTimeout(() => {
      globalThis.history.replaceState(
        null,
        '',
        mergeHrefSearchParams(basePath, { q: trimmed })
      );
    }, debounceMs);

    return () => globalThis.clearTimeout(timeout);
  }, [search, basePath, debounceMs]);
}
