'use client';

/**
 * Core pagination calculations hook.
 * Provides pagination state without URL/routing concerns.
 * For URL-based pagination, use useAdminTablePaginationLinks instead.
 */

import { useCallback, useMemo } from 'react';

export interface UsePaginationOptions {
  /** Current page (1-indexed) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total number of items */
  total: number;
}

export interface UsePaginationReturn {
  /** Total number of pages */
  totalPages: number;
  /** Whether there's a previous page */
  canPrev: boolean;
  /** Whether there's a next page */
  canNext: boolean;
  /** First item index on current page (1-indexed, 0 if empty) */
  from: number;
  /** Last item index on current page (0 if empty) */
  to: number;
  /** Database offset for current page */
  offset: number;
  /** Whether the current page is empty */
  isEmpty: boolean;
  /** Whether this is the first page */
  isFirstPage: boolean;
  /** Whether this is the last page */
  isLastPage: boolean;
  /** Get page number for a given item index (1-indexed) */
  getPageForItem: (itemIndex: number) => number;
  /** Get the range of items for a given page */
  getPageRange: (pageNum: number) => { from: number; to: number };
}

/**
 * Hook for pagination calculations.
 *
 * @example
 * ```tsx
 * const { totalPages, canPrev, canNext, from, to } = usePagination({
 *   page: currentPage,
 *   pageSize: 20,
 *   total: items.length,
 * });
 *
 * return (
 *   <div>
 *     <span>Showing {from}-{to} of {total}</span>
 *     <button disabled={!canPrev} onClick={() => setPage(p => p - 1)}>Prev</button>
 *     <button disabled={!canNext} onClick={() => setPage(p => p + 1)}>Next</button>
 *   </div>
 * );
 * ```
 */
export function usePagination(
  options: UsePaginationOptions
): UsePaginationReturn {
  const { page, pageSize, total } = options;

  const totalPages = useMemo(
    () => (total > 0 ? Math.max(Math.ceil(total / pageSize), 1) : 1),
    [total, pageSize]
  );

  const canPrev = page > 1;
  const canNext = page < totalPages;
  const isFirstPage = page === 1;
  const isLastPage = page >= totalPages;
  const isEmpty = total === 0;

  const from = isEmpty ? 0 : (page - 1) * pageSize + 1;
  const to = isEmpty ? 0 : Math.min(page * pageSize, total);
  const offset = (page - 1) * pageSize;

  const getPageForItem = useCallback(
    (itemIndex: number) => Math.ceil(itemIndex / pageSize),
    [pageSize]
  );

  const getPageRange = useCallback(
    (pageNum: number) => {
      const rangeFrom = isEmpty ? 0 : (pageNum - 1) * pageSize + 1;
      const rangeTo = isEmpty ? 0 : Math.min(pageNum * pageSize, total);
      return { from: rangeFrom, to: rangeTo };
    },
    [pageSize, total, isEmpty]
  );

  return {
    totalPages,
    canPrev,
    canNext,
    from,
    to,
    offset,
    isEmpty,
    isFirstPage,
    isLastPage,
    getPageForItem,
    getPageRange,
  };
}

/**
 * Calculate pagination values without React hooks.
 * Useful for server-side calculations.
 */
export function calculatePagination(options: UsePaginationOptions) {
  const { page, pageSize, total } = options;

  const totalPages = total > 0 ? Math.max(Math.ceil(total / pageSize), 1) : 1;
  const isEmpty = total === 0;
  const from = isEmpty ? 0 : (page - 1) * pageSize + 1;
  const to = isEmpty ? 0 : Math.min(page * pageSize, total);
  const offset = (page - 1) * pageSize;

  return {
    totalPages,
    canPrev: page > 1,
    canNext: page < totalPages,
    from,
    to,
    offset,
    isEmpty,
    isFirstPage: page === 1,
    isLastPage: page >= totalPages,
  };
}
