/**
 * Pagination parameter parsing utilities.
 *
 * Extracts and validates pagination parameters from URL search params,
 * ensuring they fall within acceptable ranges.
 */

export interface PaginationParams {
  page: number;
  pageSize: number;
}

/**
 * Parse and validate pagination parameters from URL search params.
 *
 * @param searchParams - URL search parameters object
 * @returns Validated pagination parameters with safe defaults
 *
 * @example
 * ```tsx
 * const { page, pageSize } = parsePaginationParams(searchParams);
 * ```
 */
export function parsePaginationParams(
  searchParams?: Record<string, string | undefined>
): PaginationParams {
  const pageParam = searchParams?.page
    ? Number.parseInt(searchParams.page, 10)
    : 1;
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const pageSizeParam = searchParams?.pageSize
    ? Number.parseInt(searchParams.pageSize, 10)
    : 20;
  const pageSize =
    Number.isFinite(pageSizeParam) && pageSizeParam > 0 && pageSizeParam <= 100
      ? pageSizeParam
      : 20;

  return { page, pageSize };
}
