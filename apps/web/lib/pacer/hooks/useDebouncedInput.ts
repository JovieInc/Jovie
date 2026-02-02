'use client';

import { useDebouncedValue } from '@tanstack/react-pacer';
import type React from 'react';
import { useCallback, useState } from 'react';
import { PACER_TIMING } from './timing';

export interface UseDebouncedInputOptions {
  /**
   * Initial value for the input
   * @default ''
   */
  initialValue?: string;
  /**
   * Debounce delay in milliseconds
   * @default PACER_TIMING.DEBOUNCE_MS (300)
   */
  delay?: number;
  /**
   * Callback when debounced value changes
   */
  onDebouncedChange?: (value: string) => void;
}

export interface UseDebouncedInputReturn {
  /**
   * Current input value (updates immediately)
   */
  value: string;
  /**
   * Debounced value (updates after delay)
   */
  debouncedValue: string;
  /**
   * Whether a debounce is pending
   */
  isPending: boolean;
  /**
   * Set the input value directly
   */
  setValue: (value: string) => void;
  /**
   * onChange handler for controlled inputs
   */
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  /**
   * Clear the input value
   */
  clear: () => void;
}

/**
 * Hook for debounced input handling.
 *
 * Provides immediate value updates for responsive UI while debouncing
 * the actual value for expensive operations (API calls, filtering, etc.).
 *
 * @example
 * ```tsx
 * function SearchInput() {
 *   const { value, debouncedValue, onChange, isPending } = useDebouncedInput({
 *     onDebouncedChange: (query) => searchAPI(query),
 *   });
 *
 *   return (
 *     <Input
 *       value={value}
 *       onChange={onChange}
 *       loading={isPending}
 *       placeholder="Search..."
 *     />
 *   );
 * }
 * ```
 */
export function useDebouncedInput({
  initialValue = '',
  delay = PACER_TIMING.DEBOUNCE_MS,
  onDebouncedChange,
}: UseDebouncedInputOptions = {}): UseDebouncedInputReturn {
  const [value, setValue] = useState(initialValue);

  const [debouncedValue] = useDebouncedValue(value, {
    wait: delay,
    onExecute: () => {
      if (onDebouncedChange) {
        onDebouncedChange(value);
      }
    },
  });

  // Derive isPending from value comparison (pending when values differ)
  const isPending = value !== debouncedValue;

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValue(e.target.value);
    },
    []
  );

  const clear = useCallback(() => {
    setValue('');
  }, []);

  return {
    value,
    debouncedValue,
    isPending,
    setValue,
    onChange,
    clear,
  };
}
