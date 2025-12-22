'use client';

import { useCallback } from 'react';

type HapticPattern =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'error'
  | 'selection';

const HAPTIC_PATTERNS: Record<HapticPattern, number[]> = {
  light: [10],
  medium: [20],
  heavy: [30],
  success: [10, 50, 20],
  error: [50, 50, 50],
  selection: [5],
};

/**
 * Provides haptic feedback using the Vibration API.
 * Falls back gracefully on devices that don't support it.
 */
export function useHapticFeedback() {
  const trigger = useCallback((pattern: HapticPattern = 'light') => {
    // Check for Vibration API support
    if (typeof navigator === 'undefined' || !navigator.vibrate) {
      return;
    }

    try {
      navigator.vibrate(HAPTIC_PATTERNS[pattern]);
    } catch {
      // Silently fail if vibration is not allowed
    }
  }, []);

  const light = useCallback(() => trigger('light'), [trigger]);
  const medium = useCallback(() => trigger('medium'), [trigger]);
  const heavy = useCallback(() => trigger('heavy'), [trigger]);
  const success = useCallback(() => trigger('success'), [trigger]);
  const error = useCallback(() => trigger('error'), [trigger]);
  const selection = useCallback(() => trigger('selection'), [trigger]);

  return {
    trigger,
    light,
    medium,
    heavy,
    success,
    error,
    selection,
  };
}
