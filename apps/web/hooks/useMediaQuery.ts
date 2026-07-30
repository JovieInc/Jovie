'use client';

import { useCallback, useSyncExternalStore } from 'react';

interface UseMediaQueryOptions {
  defaultValue?: boolean;
}

export function useMediaQuery(
  query: string,
  options: UseMediaQueryOptions = {}
): boolean {
  const { defaultValue = false } = options;

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof globalThis.matchMedia !== 'function') {
        return () => {};
      }

      const mediaQueryList = globalThis.matchMedia(query);
      mediaQueryList.addEventListener('change', onStoreChange);

      return () => {
        mediaQueryList.removeEventListener('change', onStoreChange);
      };
    },
    [query]
  );

  const getSnapshot = useCallback(() => {
    if (typeof globalThis.matchMedia !== 'function') {
      return defaultValue;
    }

    return globalThis.matchMedia(query).matches;
  }, [defaultValue, query]);

  // React uses this snapshot for SSR and its first hydration render. Reading
  // matchMedia during that render lets a mobile client choose a different
  // shell tree than the server, which causes recoverable hydration failures.
  const getServerSnapshot = useCallback(() => defaultValue, [defaultValue]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
