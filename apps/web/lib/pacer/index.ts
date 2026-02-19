/**
 * TanStack Pacer Integration
 *
 * Centralized module for all debouncing, throttling, rate limiting, and queuing functionality.
 * This replaces the custom debounce implementations scattered throughout the codebase.
 *
 * @see https://tanstack.com/pacer
 */

// Re-export all TanStack Pacer hooks and utilities
export {
  AsyncBatcher,
  type AsyncBatcherOptions,
  type AsyncBatcherState,
  AsyncDebouncer,
  type AsyncDebouncerOptions,
  type AsyncDebouncerState,
  AsyncQueuer,
  type AsyncQueuerOptions,
  type AsyncQueuerState,
  AsyncRateLimiter,
  type AsyncRateLimiterOptions,
  type AsyncRateLimiterState,
  AsyncRetryer,
  type AsyncRetryerOptions,
  type AsyncRetryerState,
  AsyncThrottler,
  type AsyncThrottlerOptions,
  type AsyncThrottlerState,
  Batcher,
  type BatcherOptions,
  type BatcherState,
  Debouncer,
  // Types
  type DebouncerOptions,
  type DebouncerState,
  // Core utilities (non-React)
  debounce,
  // Provider (for default options)
  PacerProvider,
  type PacerProviderOptions,
  type PacerProviderProps,
  Queuer,
  type QueuerOptions,
  type QueuerState,
  RateLimiter,
  type RateLimiterOptions,
  type RateLimiterState,
  type ReactAsyncBatcher,
  type ReactAsyncDebouncer,
  type ReactAsyncQueuer,
  type ReactAsyncRateLimiter,
  type ReactAsyncThrottler,
  type ReactBatcher,
  type ReactDebouncer,
  type ReactQueuer,
  type ReactRateLimiter,
  type ReactThrottler,
  Throttler,
  type ThrottlerOptions,
  type ThrottlerState,
  throttle,
  useAsyncBatchedCallback,
  // Async Batching
  useAsyncBatcher,
  useAsyncDebouncedCallback,
  // Async Debouncing (for API calls)
  useAsyncDebouncer,
  useAsyncQueuedState,
  // Async Queuing
  useAsyncQueuer,
  useAsyncRateLimitedCallback,
  // Async Rate Limiting
  useAsyncRateLimiter,
  useAsyncThrottledCallback,
  // Async Throttling
  useAsyncThrottler,
  useBatchedCallback,
  // Batching
  useBatcher,
  useDebouncedCallback,
  useDebouncedState,
  useDebouncedValue,
  // Debouncing
  useDebouncer,
  useDefaultPacerOptions,
  usePacerContext,
  useQueuedState,
  useQueuedValue,
  // Queuing
  useQueuer,
  useRateLimitedCallback,
  useRateLimitedState,
  useRateLimitedValue,
  // Rate Limiting
  useRateLimiter,
  useThrottledCallback,
  useThrottledState,
  useThrottledValue,
  // Throttling
  useThrottler,
} from '@tanstack/react-pacer';
// Export cache utilities
export * from './cache';
// Export error handling utilities
export * from './errors';
// Export application-specific hooks
export * from './hooks';
// Export retry utilities
export * from './retry';
