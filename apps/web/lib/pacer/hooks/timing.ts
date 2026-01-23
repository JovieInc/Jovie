/**
 * Centralized timing constants for TanStack Pacer hooks.
 * Use these to ensure consistent debounce/throttle behavior across the app.
 */
export const PACER_TIMING = {
  /** Default debounce for general use */
  DEBOUNCE_MS: 300,
  /** Debounce for search inputs */
  SEARCH_DEBOUNCE_MS: 300,
  /** Debounce for async validation (handle checks, etc.) */
  VALIDATION_DEBOUNCE_MS: 450,
  /** Debounce for auto-save operations */
  SAVE_DEBOUNCE_MS: 500,
  /** Default throttle for event handlers */
  THROTTLE_MS: 100,
  /** Throttle for scroll/animation (60fps) */
  SCROLL_THROTTLE_MS: 16,
  /** Default timeout for validation requests */
  VALIDATION_TIMEOUT_MS: 5000,
} as const;
