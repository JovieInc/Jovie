'use client';

/**
 * Application-specific TanStack Pacer hooks
 *
 * These hooks provide common patterns used throughout the Jovie application,
 * built on top of TanStack Pacer's primitives.
 *
 * This file is a barrel export that re-exports from the modular
 * hooks directory for backwards compatibility.
 */

export { PACER_TIMING } from './hooks/timing';
export type {
  UseAsyncSearchOptions,
  UseAsyncSearchReturn,
} from './hooks/useAsyncSearch';
export { useAsyncSearch } from './hooks/useAsyncSearch';
export type {
  UseAsyncValidationOptions,
  UseAsyncValidationReturn,
} from './hooks/useAsyncValidation';
export { useAsyncValidation } from './hooks/useAsyncValidation';
export type {
  UseAutoSaveOptions,
  UseAutoSaveReturn,
} from './hooks/useAutoSave';
export { useAutoSave } from './hooks/useAutoSave';
export type {
  UseDebouncedInputOptions,
  UseDebouncedInputReturn,
} from './hooks/useDebouncedInput';
export { useDebouncedInput } from './hooks/useDebouncedInput';
export type {
  UseRateLimitedValidationOptions,
  UseRateLimitedValidationReturn,
} from './hooks/useRateLimitedValidation';
export { useRateLimitedValidation } from './hooks/useRateLimitedValidation';
export type { UseThrottledEventHandlerOptions } from './hooks/useThrottledEventHandler';
export { useThrottledEventHandler } from './hooks/useThrottledEventHandler';
export type {
  UseThrottledScrollOptions,
  UseThrottledScrollReturn,
} from './hooks/useThrottledScroll';
export { useThrottledScroll } from './hooks/useThrottledScroll';
