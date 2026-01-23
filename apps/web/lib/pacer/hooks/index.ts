'use client';

/**
 * Application-specific TanStack Pacer hooks
 *
 * These hooks provide common patterns used throughout the Jovie application,
 * built on top of TanStack Pacer's primitives.
 */

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

// Throttled event handler
export type { UseThrottledEventHandlerOptions } from './useThrottledEventHandler';
export { useThrottledEventHandler } from './useThrottledEventHandler';

// Throttled scroll
export type {
  UseThrottledScrollOptions,
  UseThrottledScrollReturn,
} from './useThrottledScroll';
export { useThrottledScroll } from './useThrottledScroll';
