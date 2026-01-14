'use client';

/**
 * Debounce hooks for search inputs and other delayed updates.
 *
 * Built on TanStack Pacer for world-class debouncing with proper
 * state management, cancellation, and type safety.
 *
 * @see https://tanstack.com/pacer
 */

import {
  useDebouncer,
  useDebouncedCallback as usePacerDebouncedCallback,
  useDebouncedValue as usePacerDebouncedValue,
} from '@tanstack/react-pacer';
import { useCallback, useEffect, useState } from 'react';

/**
 * Debounce a value, returning the debounced version.
 *
 * @example
 * ```tsx
 * const [search, setSearch] = useState('');
 * const debouncedSearch = useDebouncedValue(search, 300);
 *
 * useEffect(() => {
 *   // Only fires 300ms after user stops typing
 *   fetchResults(debouncedSearch);
 * }, [debouncedSearch]);
 * ```
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue] = usePacerDebouncedValue(value, { wait: delay });
  return debouncedValue;
}

/**
 * Debounce a callback function.
 *
 * @example
 * ```tsx
 * const debouncedFetch = useDebouncedCallback((query: string) => {
 *   fetchResults(query);
 * }, 300);
 *
 * return <input onChange={e => debouncedFetch(e.target.value)} />;
 * ```
 */
export function useDebouncedCallback<
  T extends (...args: Parameters<T>) => void,
>(callback: T, delay: number): (...args: Parameters<T>) => void {
  return usePacerDebouncedCallback(callback, { wait: delay });
}

export interface UseSearchOptions {
  /** Debounce delay in ms (default: 300) */
  delay?: number;
  /** Minimum characters before triggering search (default: 0) */
  minLength?: number;
  /** Callback when search term changes (after debounce) */
  onSearch?: (term: string) => void;
}

export interface UseSearchReturn {
  /** Current input value */
  value: string;
  /** Debounced search term */
  searchTerm: string;
  /** Update the input value */
  setValue: (value: string) => void;
  /** Clear the search */
  clear: () => void;
  /** Whether the search term meets minimum length */
  isValid: boolean;
  /** Whether the debounced value is pending */
  isPending: boolean;
  /** Cancel pending debounce */
  cancel: () => void;
}

/**
 * Combined hook for search input with debouncing.
 *
 * Built on TanStack Pacer's useDebouncer for robust state management.
 *
 * @example
 * ```tsx
 * const { value, setValue, searchTerm, clear, isPending } = useSearch({
 *   delay: 300,
 *   minLength: 2,
 *   onSearch: (term) => fetchResults(term),
 * });
 *
 * return (
 *   <div>
 *     <input value={value} onChange={e => setValue(e.target.value)} />
 *     {isPending && <Spinner />}
 *     <button onClick={clear}>Clear</button>
 *   </div>
 * );
 * ```
 */
export function useSearch(options: UseSearchOptions = {}): UseSearchReturn {
  const { delay = 300, minLength = 0, onSearch } = options;

  const [value, setValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Use TanStack Pacer's debouncer with selector for reactive isPending state
  const debouncer = useDebouncer(
    (newValue: string) => {
      setSearchTerm(newValue);
    },
    { wait: delay },
    state => ({ isPending: state.isPending })
  );

  // Update debounced value when input changes
  useEffect(() => {
    debouncer.maybeExecute(value);
  }, [value, debouncer]);

  const isValid = searchTerm.length >= minLength;

  // Call onSearch when debounced value changes
  useEffect(() => {
    if (isValid && onSearch) {
      onSearch(searchTerm);
    }
  }, [searchTerm, isValid, onSearch]);

  const clear = useCallback(() => {
    debouncer.cancel();
    setValue('');
    setSearchTerm('');
  }, [debouncer]);

  const cancel = useCallback(() => {
    debouncer.cancel();
  }, [debouncer]);

  return {
    value,
    searchTerm,
    setValue,
    clear,
    isValid,
    isPending: debouncer.state.isPending,
    cancel,
  };
}
