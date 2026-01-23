'use client';

/**
 * Hook for throttled event handlers.
 */

import { useThrottler } from '@tanstack/react-pacer';
import { useCallback } from 'react';
import { PACER_TIMING } from './timing';

export interface UseThrottledEventHandlerOptions {
  /** Throttle wait time in ms */
  wait?: number;
  /** Execute on leading edge */
  leading?: boolean;
  /** Execute on trailing edge */
  trailing?: boolean;
}

/**
 * @example
 * ```tsx
 * const handleScroll = useThrottledEventHandler(() => {
 *   // Handle scroll
 * }, { wait: 100 });
 * ```
 */
export function useThrottledEventHandler<
  T extends (...args: unknown[]) => void,
>(handler: T, options: UseThrottledEventHandlerOptions = {}): T {
  const {
    wait = PACER_TIMING.THROTTLE_MS,
    leading = true,
    trailing = true,
  } = options;

  const throttler = useThrottler(handler, {
    wait,
    leading,
    trailing,
  });

  return useCallback(
    (...args: Parameters<T>) => {
      throttler.maybeExecute(...args);
    },
    [throttler]
  ) as T;
}
