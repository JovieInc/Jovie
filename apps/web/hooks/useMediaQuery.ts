'use client';

import { useEffect, useState } from 'react';

interface UseMediaQueryOptions {
  defaultValue?: boolean;
}

export function useMediaQuery(
  query: string,
  options: UseMediaQueryOptions = {}
): boolean {
  const { defaultValue = false } = options;
  const [matches, setMatches] = useState<boolean>(defaultValue);

  useEffect(() => {
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
