'use client';

/**
 * Debounce hooks for search inputs and other delayed updates.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );
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
}

/**
 * Combined hook for search input with debouncing.
 *
 * @example
 * ```tsx
 * const { value, setValue, searchTerm, clear } = useSearch({
 *   delay: 300,
 *   minLength: 2,
 *   onSearch: (term) => fetchResults(term),
 * });
 *
 * return (
 *   <div>
 *     <input value={value} onChange={e => setValue(e.target.value)} />
 *     <button onClick={clear}>Clear</button>
 *   </div>
 * );
 * ```
 */
export function useSearch(options: UseSearchOptions = {}): UseSearchReturn {
  const { delay = 300, minLength = 0, onSearch } = options;

  const [value, setValue] = useState('');
  const searchTerm = useDebouncedValue(value, delay);
  const isValid = searchTerm.length >= minLength;
  const isPending = value !== searchTerm;

  // Call onSearch when debounced value changes
  useEffect(() => {
    if (isValid && onSearch) {
      onSearch(searchTerm);
    }
  }, [searchTerm, isValid, onSearch]);

  const clear = useCallback(() => {
    setValue('');
  }, []);

  return {
    value,
    searchTerm,
    setValue,
    clear,
    isValid,
    isPending,
  };
}
