'use client';

/**
 * Client-side nuqs hooks for URL state management.
 *
 * These hooks provide type-safe, reactive URL search params state.
 * Use these in client components for interactive URL-based state.
 *
 * @see https://nuqs.dev
 */

import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from 'nuqs';
import { useCallback } from 'react';

// ============================================================================
// Pagination Hook
// ============================================================================

/**
 * Pagination state from URL params.
 */
export interface PaginationState {
  page: number;
  pageSize: number;
}

/**
 * Pagination actions for updating URL params.
 */
export interface PaginationActions {
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  resetPagination: () => void;
}

/**
 * Options for usePaginationParams hook.
 */
export interface UsePaginationParamsOptions {
  defaultPageSize?: number;
  shallow?: boolean;
}

/**
 * Hook for managing pagination state in URL params.
 *
 * @example
 * ```tsx
 * function DataTable() {
 *   const [{ page, pageSize }, { setPage, setPageSize }] = usePaginationParams();
 *
 *   return (
 *     <>
 *       <Table data={data.slice((page - 1) * pageSize, page * pageSize)} />
 *       <Pagination
 *         currentPage={page}
 *         onPageChange={setPage}
 *         pageSize={pageSize}
 *         onPageSizeChange={setPageSize}
 *       />
 *     </>
 *   );
 * }
 * ```
 */
export function usePaginationParams(
  options: UsePaginationParamsOptions = {}
): [PaginationState, PaginationActions] {
  const { defaultPageSize = 20, shallow = true } = options;

  const [state, setQueryStates] = useQueryStates(
    {
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(defaultPageSize),
    },
    {
      shallow,
      history: 'push',
    }
  );

  const setPage = useCallback(
    (page: number) => {
      const clampedPage = Math.max(1, Math.floor(page));
      setQueryStates({ page: clampedPage });
    },
    [setQueryStates]
  );

  const setPageSize = useCallback(
    (pageSize: number) => {
      const clampedSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
      // Reset to page 1 when page size changes
      setQueryStates({ pageSize: clampedSize, page: 1 });
    },
    [setQueryStates]
  );

  const resetPagination = useCallback(() => {
    setQueryStates({ page: 1, pageSize: defaultPageSize });
  }, [setQueryStates, defaultPageSize]);

  return [state, { setPage, setPageSize, resetPagination }];
}

// ============================================================================
// Sorting Hook
// ============================================================================

/**
 * Sort state from URL params.
 */
export interface SortState<T extends string = string> {
  sort: T | null;
  direction: 'asc' | 'desc';
}

/**
 * Sort actions for updating URL params.
 */
export interface SortActions<T extends string = string> {
  setSort: (field: T) => void;
  setDirection: (direction: 'asc' | 'desc') => void;
  toggleSort: (field: T) => void;
  clearSort: () => void;
}

/**
 * Options for useSortParams hook.
 */
export interface UseSortParamsOptions<T extends string> {
  defaultSort?: T;
  defaultDirection?: 'asc' | 'desc';
  validSortFields?: readonly T[];
  shallow?: boolean;
}

/**
 * Hook for managing sort state in URL params.
 *
 * @example
 * ```tsx
 * function SortableTable() {
 *   const [{ sort, direction }, { toggleSort }] = useSortParams({
 *     defaultSort: 'createdAt',
 *     defaultDirection: 'desc',
 *   });
 *
 *   return (
 *     <Table
 *       sortField={sort}
 *       sortDirection={direction}
 *       onSort={toggleSort}
 *     />
 *   );
 * }
 * ```
 */
export function useSortParams<T extends string = string>(
  options: UseSortParamsOptions<T> = {}
): [SortState<T>, SortActions<T>] {
  const {
    defaultSort,
    defaultDirection = 'desc',
    validSortFields,
    shallow = true,
  } = options;

  const sortParser = validSortFields
    ? parseAsStringLiteral(validSortFields as unknown as readonly string[])
    : parseAsString;

  const [state, setQueryStates] = useQueryStates(
    {
      sort: defaultSort
        ? (sortParser.withDefault(defaultSort as string) as typeof sortParser)
        : sortParser,
      direction: parseAsStringLiteral(['asc', 'desc'] as const).withDefault(
        defaultDirection
      ),
    },
    {
      shallow,
      history: 'push',
    }
  );

  const setSort = useCallback(
    (field: T) => {
      setQueryStates({ sort: field });
    },
    [setQueryStates]
  );

  const setDirection = useCallback(
    (direction: 'asc' | 'desc') => {
      setQueryStates({ direction });
    },
    [setQueryStates]
  );

  const toggleSort = useCallback(
    (field: T) => {
      const isSameField = state.sort === field;
      if (isSameField) {
        // Toggle direction
        setQueryStates({
          direction: state.direction === 'asc' ? 'desc' : 'asc',
        });
      } else {
        // New field, use default direction
        setQueryStates({ sort: field, direction: defaultDirection });
      }
    },
    [state.sort, state.direction, setQueryStates, defaultDirection]
  );

  const clearSort = useCallback(() => {
    setQueryStates({ sort: null, direction: defaultDirection });
  }, [setQueryStates, defaultDirection]);

  return [
    state as SortState<T>,
    { setSort, setDirection, toggleSort, clearSort },
  ];
}

// ============================================================================
// Search Hook
// ============================================================================

/**
 * Search state from URL params.
 */
export interface SearchState {
  q: string | null;
}

/**
 * Search actions for updating URL params.
 */
export interface SearchActions {
  setSearch: (query: string | null) => void;
  clearSearch: () => void;
}

/**
 * Options for useSearchParams hook.
 */
export interface UseSearchParamsOptions {
  paramName?: string;
  shallow?: boolean;
}

/**
 * Hook for managing search query in URL params.
 *
 * @example
 * ```tsx
 * function SearchBar() {
 *   const [{ q }, { setSearch, clearSearch }] = useSearchQuery();
 *
 *   return (
 *     <Input
 *       value={q ?? ''}
 *       onChange={(e) => setSearch(e.target.value || null)}
 *       placeholder="Search..."
 *     />
 *   );
 * }
 * ```
 */
export function useSearchQuery(
  options: UseSearchParamsOptions = {}
): [SearchState, SearchActions] {
  const { paramName = 'q', shallow = true } = options;

  const [state, setQueryStates] = useQueryStates(
    {
      [paramName]: parseAsString,
    },
    {
      shallow,
      history: 'push',
    }
  );

  const setSearch = useCallback(
    (query: string | null) => {
      const trimmed = query?.trim();
      setQueryStates({ [paramName]: trimmed || null });
    },
    [setQueryStates, paramName]
  );

  const clearSearch = useCallback(() => {
    setQueryStates({ [paramName]: null });
  }, [setQueryStates, paramName]);

  return [{ q: state[paramName] as string | null }, { setSearch, clearSearch }];
}

// ============================================================================
// Release Table Sort Hook
// ============================================================================

/**
 * Valid sort fields for the release table.
 * These must match the column IDs in ReleaseTable.tsx
 */
export const releaseSortFields = [
  'releaseDate',
  'title',
  'releaseType',
  'popularity',
  'primaryIsrc',
  'upc',
  'label',
  'totalTracks',
  'totalDurationMs',
] as const;

export type ReleaseSortField = (typeof releaseSortFields)[number];

/**
 * Release sort state from URL params.
 */
export interface ReleaseSortState {
  sort: ReleaseSortField;
  direction: 'asc' | 'desc';
}

/**
 * Release sort actions for updating URL params.
 */
export interface ReleaseSortActions {
  setSort: (field: ReleaseSortField) => void;
  setDirection: (direction: 'asc' | 'desc') => void;
  /** Set both field and direction at once - use when syncing from TanStack Table */
  setSorting: (field: ReleaseSortField, direction: 'asc' | 'desc') => void;
  toggleSort: (field: ReleaseSortField) => void;
}

/**
 * Hook for managing release table sort state in URL params.
 *
 * This hook provides type-safe sorting for the ReleaseTable component,
 * persisting sort state to the URL for shareable links and browser history.
 *
 * @example
 * ```tsx
 * function ReleaseTable() {
 *   const [{ sort, direction }, { toggleSort }] = useReleaseSortParams();
 *
 *   // Convert to TanStack SortingState
 *   const sorting = useMemo(() =>
 *     [{ id: sort, desc: direction === 'desc' }],
 *     [sort, direction]
 *   );
 *
 *   return <UnifiedTable sorting={sorting} onSortingChange={...} />
 * }
 * ```
 */
export function useReleaseSortParams(): [ReleaseSortState, ReleaseSortActions] {
  const [state, setQueryStates] = useQueryStates(
    {
      sort: parseAsStringLiteral(releaseSortFields).withDefault('releaseDate'),
      direction: parseAsStringLiteral(['asc', 'desc'] as const).withDefault(
        'desc'
      ),
    },
    {
      shallow: true,
      history: 'push',
    }
  );

  const setSort = useCallback(
    (field: ReleaseSortField) => {
      setQueryStates({ sort: field });
    },
    [setQueryStates]
  );

  const setDirection = useCallback(
    (direction: 'asc' | 'desc') => {
      setQueryStates({ direction });
    },
    [setQueryStates]
  );

  // Set both field and direction at once - avoids intermediate states
  // Use this when syncing from TanStack Table's onSortingChange
  const setSorting = useCallback(
    (field: ReleaseSortField, direction: 'asc' | 'desc') => {
      // Only update if values actually changed to prevent unnecessary re-renders
      if (state.sort === field && state.direction === direction) return;
      setQueryStates({ sort: field, direction });
    },
    [state.sort, state.direction, setQueryStates]
  );

  const toggleSort = useCallback(
    (field: ReleaseSortField) => {
      const isSameField = state.sort === field;
      if (isSameField) {
        // Toggle direction
        setQueryStates({
          direction: state.direction === 'asc' ? 'desc' : 'asc',
        });
      } else {
        // New field, default to descending
        setQueryStates({ sort: field, direction: 'desc' });
      }
    },
    [state.sort, state.direction, setQueryStates]
  );

  return [
    state as ReleaseSortState,
    { setSort, setDirection, setSorting, toggleSort },
  ];
}

// ============================================================================
// Combined Table State Hook
// ============================================================================

/**
 * Combined table state including pagination, sorting, and search.
 */
export interface TableState<SortField extends string = string> {
  page: number;
  pageSize: number;
  sort: SortField | null;
  direction: 'asc' | 'desc';
  q: string | null;
}

/**
 * Combined table actions.
 */
export interface TableActions<SortField extends string = string> {
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  toggleSort: (field: SortField) => void;
  setSearch: (query: string | null) => void;
  reset: () => void;
}

/**
 * Options for useTableParams hook.
 */
export interface UseTableParamsOptions<SortField extends string> {
  defaultPageSize?: number;
  defaultSort?: SortField;
  defaultDirection?: 'asc' | 'desc';
  validSortFields?: readonly SortField[];
  shallow?: boolean;
}

/**
 * Hook for managing complete table state in URL params.
 * Combines pagination, sorting, and search into a single hook.
 *
 * @example
 * ```tsx
 * function AdminTable() {
 *   const [state, actions] = useTableParams({
 *     defaultPageSize: 20,
 *     defaultSort: 'createdAt',
 *     defaultDirection: 'desc',
 *   });
 *
 *   const { page, pageSize, sort, direction, q } = state;
 *   const { setPage, toggleSort, setSearch } = actions;
 *
 *   return (
 *     <DataTable
 *       page={page}
 *       pageSize={pageSize}
 *       sortField={sort}
 *       sortDirection={direction}
 *       searchQuery={q}
 *       onPageChange={setPage}
 *       onSort={toggleSort}
 *       onSearch={setSearch}
 *     />
 *   );
 * }
 * ```
 */
export function useTableParams<SortField extends string = string>(
  options: UseTableParamsOptions<SortField> = {}
): [TableState<SortField>, TableActions<SortField>] {
  const {
    defaultPageSize = 20,
    defaultSort,
    defaultDirection = 'desc',
    validSortFields,
    shallow = true,
  } = options;

  const sortParser = validSortFields
    ? parseAsStringLiteral(validSortFields as unknown as readonly string[])
    : parseAsString;

  const [state, setQueryStates] = useQueryStates(
    {
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(defaultPageSize),
      sort: defaultSort
        ? (sortParser.withDefault(defaultSort as string) as typeof sortParser)
        : sortParser,
      direction: parseAsStringLiteral(['asc', 'desc'] as const).withDefault(
        defaultDirection
      ),
      q: parseAsString,
    },
    {
      shallow,
      history: 'push',
    }
  );

  const setPage = useCallback(
    (page: number) => {
      const clampedPage = Math.max(1, Math.floor(page));
      setQueryStates({ page: clampedPage });
    },
    [setQueryStates]
  );

  const setPageSize = useCallback(
    (pageSize: number) => {
      const clampedSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
      setQueryStates({ pageSize: clampedSize, page: 1 });
    },
    [setQueryStates]
  );

  const toggleSort = useCallback(
    (field: SortField) => {
      const isSameField = state.sort === field;
      if (isSameField) {
        setQueryStates({
          direction: state.direction === 'asc' ? 'desc' : 'asc',
          page: 1,
        });
      } else {
        setQueryStates({ sort: field, direction: defaultDirection, page: 1 });
      }
    },
    [state.sort, state.direction, setQueryStates, defaultDirection]
  );

  const setSearch = useCallback(
    (query: string | null) => {
      const trimmed = query?.trim();
      setQueryStates({ q: trimmed || null, page: 1 });
    },
    [setQueryStates]
  );

  const reset = useCallback(() => {
    setQueryStates({
      page: 1,
      pageSize: defaultPageSize,
      sort: defaultSort ?? null,
      direction: defaultDirection,
      q: null,
    });
  }, [setQueryStates, defaultPageSize, defaultSort, defaultDirection]);

  return [
    state as TableState<SortField>,
    { setPage, setPageSize, toggleSort, setSearch, reset },
  ];
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsJson,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from 'nuqs';
