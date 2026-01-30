'use client';

import { useEffect, useState } from 'react';

/**
 * Hook to detect if the user prefers reduced motion.
 * This respects the user's system preference for reduced motion.
 *
 * @returns {boolean} True if the user prefers reduced motion, false otherwise.
 *
 * @example
 * ```tsx
 * const prefersReducedMotion = useReducedMotion();
 *
 * // In a framer-motion component:
 * <motion.div
 *   animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
 *   // ...
 * />
 * ```
 */
export function useReducedMotion(): boolean {
  // Default to true for SSR (better to have no motion than unwanted motion)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);

  useEffect(() => {
    // Check if window is defined (client-side)
    if (typeof window === 'undefined') return;
    // Gracefully handle environments without matchMedia (e.g., some test runs)
    if (typeof globalThis.matchMedia !== 'function') {
      // On client without matchMedia, default to false (no reduced motion preference)
      setPrefersReducedMotion(false);
      return;
    }

    // Create media query list
    const mediaQuery = globalThis.matchMedia(
      '(prefers-reduced-motion: reduce)'
    );

    // Set initial value
    setPrefersReducedMotion(mediaQuery.matches);

    // Define callback for changes
    const onChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    // Add listener with both modern and legacy APIs (feature detection)
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onChange);
    } else {
      // For older browsers
      mediaQuery.addListener?.(onChange);
    }

    // Cleanup
    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', onChange);
      } else {
        // For older browsers
        mediaQuery.removeListener?.(onChange);
      }
    };
  }, []);

  return prefersReducedMotion;
}

export default useReducedMotion;
