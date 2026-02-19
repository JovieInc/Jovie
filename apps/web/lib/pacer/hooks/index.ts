'use client';

/**
 * Application-specific TanStack Pacer hooks
 *
 * These hooks provide common patterns used throughout the Jovie application,
 * built on top of TanStack Pacer's primitives.
 */

// Retry utilities
export {
  executeWithRetry,
  type RetryOperationOptions,
  shouldRetryPacerNetworkError,
} from './retry';
// Timing constants
export { PACER_TIMING } from './timing';
// Search hook
export type {
  UseAsyncSearchOptions,
  UseAsyncSearchReturn,
} from './useAsyncSearch';
export { useAsyncSearch } from './useAsyncSearch';
// Validation hook
export type {
  UseAsyncValidationOptions,
  UseAsyncValidationReturn,
} from './useAsyncValidation';
export { useAsyncValidation } from './useAsyncValidation';
// Auto-save hook
export type { UseAutoSaveOptions, UseAutoSaveReturn } from './useAutoSave';
export { useAutoSave } from './useAutoSave';
// Debounced Input hook
export type {
  UseDebouncedInputOptions,
  UseDebouncedInputReturn,
} from './useDebouncedInput';
export { useDebouncedInput } from './useDebouncedInput';
// Rate-limited validation hook
export type {
  UseRateLimitedValidationOptions,
  UseRateLimitedValidationReturn,
} from './useRateLimitedValidation';
export { useRateLimitedValidation } from './useRateLimitedValidation';
// Throttled event handler
export type { UseThrottledEventHandlerOptions } from './useThrottledEventHandler';
export { useThrottledEventHandler } from './useThrottledEventHandler';
// Throttled scroll
export type {
  UseThrottledScrollOptions,
  UseThrottledScrollReturn,
} from './useThrottledScroll';
export { useThrottledScroll } from './useThrottledScroll';
