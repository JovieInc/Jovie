'use client';

import { useState } from 'react';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

interface UseMediaQueryOptions {
  defaultValue?: boolean;
}

export function useMediaQuery(
  query: string,
  options: UseMediaQueryOptions = {}
): boolean {
  const { defaultValue = false } = options;
  const [matches, setMatches] = useState<boolean>(() => {
    if (
      typeof globalThis !== 'undefined' &&
      typeof globalThis.matchMedia === 'function'
    ) {
      return globalThis.matchMedia(query).matches;
    }

    return defaultValue;
  });

  useIsomorphicLayoutEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof globalThis.matchMedia !== 'function'
    ) {
      return undefined;
    }

    const mediaQueryList = globalThis.matchMedia(query);
    setMatches(mediaQueryList.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    mediaQueryList.addEventListener('change', handleChange);

    return () => {
      mediaQueryList.removeEventListener('change', handleChange);
    };
  }, [query]);

  return matches;
}
