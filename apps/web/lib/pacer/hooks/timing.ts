/**
 * Centralized timing constants for TanStack Pacer hooks.
 * Use these to ensure consistent debounce/throttle behavior across the app.
 */
export const PACER_TIMING = {
  /** Default debounce for general use */
  DEBOUNCE_MS: 300,
  /** Debounce for search inputs (200ms with Redis cache backing) */
  SEARCH_DEBOUNCE_MS: 200,
  /** Debounce for async validation (handle checks, etc.) */
  VALIDATION_DEBOUNCE_MS: 450,
  /** Debounce for auto-save operations */
  SAVE_DEBOUNCE_MS: 500,
  /** Default throttle for event handlers */
  THROTTLE_MS: 100,
  /** Minimum time between chat submissions */
  CHAT_RATE_LIMIT_MS: 1000,
  /** Throttle for scroll/animation (60fps) */
  SCROLL_THROTTLE_MS: 16,
  /** Default timeout for validation requests */
  VALIDATION_TIMEOUT_MS: 5000,
  /** Debounce for Apple-style onboarding handle validation */
  ONBOARDING_HANDLE_DEBOUNCE_MS: 400,
  /** Default wait between queue item processing */
  QUEUE_WAIT_MS: 0,
  /** Default wait before a batch is flushed */
  BATCH_WAIT_MS: 100,
  /** Default rate limiter window duration */
  RATE_LIMIT_WINDOW_MS: 60_000,
  /** Rate limit for handle validation (requests per window) */
  HANDLE_CHECK_RATE_LIMIT: 10,
  /** Default rate limiter execution cap per window */
  DEFAULT_RATE_LIMIT: 60,
  /** Rate limit window for handle validation (1 minute) */
  HANDLE_CHECK_RATE_WINDOW_MS: 60_000,
} as const;
