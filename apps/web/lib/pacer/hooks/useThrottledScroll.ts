'use client';

/**
 * Hook for tracking scroll position with throttling.
 *
 * Uses requestAnimationFrame-based throttling for optimal performance.
 */

import { useThrottler } from '@tanstack/react-pacer';
import { useEffect, useState } from 'react';
import { PACER_TIMING } from './timing';

export interface UseThrottledScrollOptions {
  /** Throttle wait time in ms */
  wait?: number;
  /** Scroll threshold for isScrolled state */
  threshold?: number;
}

export interface UseThrottledScrollReturn {
  /** Current scroll Y position */
  scrollY: number;
  /** Whether scroll exceeds threshold */
  isScrolled: boolean;
}

/**
 * @example
 * ```tsx
 * const { scrollY, isScrolled } = useThrottledScroll({ threshold: 100 });
 * ```
 */
export function useThrottledScroll(
  options: UseThrottledScrollOptions = {}
): UseThrottledScrollReturn {
  const { wait = PACER_TIMING.THROTTLE_MS, threshold = 0 } = options;

  const [scrollY, setScrollY] = useState(() =>
    typeof window === 'undefined' ? 0 : globalThis.scrollY
  );

  const throttler = useThrottler(
    () => {
      setScrollY(globalThis.scrollY);
    },
    { wait, leading: true, trailing: true }
  );

  useEffect(() => {
    const handleScroll = () => {
      throttler.maybeExecute();
    };

    // Initial value
    setScrollY(globalThis.scrollY);

    globalThis.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      globalThis.removeEventListener('scroll', handleScroll);
      throttler.cancel();
    };
  }, [throttler]);

  return {
    scrollY,
    isScrolled: scrollY > threshold,
  };
}
