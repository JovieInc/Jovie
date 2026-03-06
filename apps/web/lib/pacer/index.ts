/**
 * TanStack Pacer Integration
 *
 * @deprecated Import directly from sub-modules or `@tanstack/react-pacer`.
 * This barrel is retained only for backwards compatibility.
 *
 * @see https://tanstack.com/pacer
 */

export type { CacheEntry, CacheOptions, ValidationCache } from './cache';
// Export cache utilities
export { CACHE_PRESETS, createValidationCache } from './cache';
export type { PacerErrorType } from './errors';
// Export error handling utilities
export {
  classifyError,
  createPacerErrorHandler,
  ERROR_MESSAGES,
  formatPacerError,
  getHttpStatusCode,
  isAbortError,
  isHttpError,
  isNetworkError,
  isTimeoutError,
  withPacerErrorHandling,
} from './errors';
export type {
  UseAsyncSearchOptions,
  UseAsyncSearchReturn,
  UseAsyncValidationOptions,
  UseAsyncValidationReturn,
  UseAutoSaveOptions,
  UseAutoSaveReturn,
  UseDebouncedInputOptions,
  UseDebouncedInputReturn,
  UseRateLimitedValidationOptions,
  UseRateLimitedValidationReturn,
  UseThrottledEventHandlerOptions,
  UseThrottledScrollOptions,
  UseThrottledScrollReturn,
} from './hooks';
// Export application-specific hooks
export {
  PACER_TIMING,
  useAsyncSearch,
  useAsyncValidation,
  useAutoSave,
  useDebouncedInput,
  useRateLimitedValidation,
  useThrottledEventHandler,
  useThrottledScroll,
} from './hooks';
// Export retry utilities
export { isRetryableError, RETRY_DEFAULTS } from './retry';
