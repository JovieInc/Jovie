'use client';

import { useCallback, useMemo } from 'react';

type SearchParamValue = string | number | boolean | null | undefined;

export interface UseAdminTablePaginationLinksOptions<SortType> {
  basePath: string;
  page: number;
  pageSize: number;
  total: number;
  search?: string;
  sort?: SortType;
}

export interface BuildHrefOverrides<SortType> {
  page?: number;
  sort?: SortType;
  pageSize?: number;
  search?: string;
  includeSearch?: boolean;
  extraParams?: Record<string, SearchParamValue>;
}

export interface AdminTablePaginationLinksResult<SortType> {
  totalPages: number;
  canPrev: boolean;
  canNext: boolean;
  from: number;
  to: number;
  buildHref: (overrides?: BuildHrefOverrides<SortType>) => string;
  prevHref?: string;
  nextHref?: string;
  clearHref: string;
}

function appendSearchParams(
  params: URLSearchParams,
  entries: Record<string, SearchParamValue>
): void {
  Object.entries(entries).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    params.set(key, String(value));
  });
}

export function useAdminTablePaginationLinks<SortType>(
  options: UseAdminTablePaginationLinksOptions<SortType>
): AdminTablePaginationLinksResult<SortType> {
  const { basePath, page, pageSize, total, search, sort } = options;

  const totalPages = total > 0 ? Math.max(Math.ceil(total / pageSize), 1) : 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(page * pageSize, total);

  const buildHref = useCallback(
    (overrides: BuildHrefOverrides<SortType> = {}): string => {
      const params = new URLSearchParams();
      params.set('page', String(overrides.page ?? page));
      params.set('pageSize', String(overrides.pageSize ?? pageSize));

      if (sort !== undefined || overrides.sort !== undefined) {
        params.set('sort', String(overrides.sort ?? sort ?? ''));
      }

      const shouldIncludeSearch = overrides.includeSearch ?? true;
      const nextSearch = overrides.search ?? search;
      if (shouldIncludeSearch && nextSearch) {
        params.set('q', nextSearch);
      }

      if (overrides.extraParams) {
        appendSearchParams(params, overrides.extraParams);
      }

      const query = params.toString();
      return query.length > 0 ? `${basePath}?${query}` : basePath;
    },
    [basePath, page, pageSize, search, sort]
  );

  const prevHref = useMemo(
    () => (canPrev ? buildHref({ page: page - 1 }) : undefined),
    [buildHref, canPrev, page]
  );

  const nextHref = useMemo(
    () => (canNext ? buildHref({ page: page + 1 }) : undefined),
    [buildHref, canNext, page]
  );

  const clearHref = useMemo(
    () => buildHref({ page: 1, includeSearch: false }),
    [buildHref]
  );

  return {
    totalPages,
    canPrev,
    canNext,
    from,
    to,
    buildHref,
    prevHref,
    nextHref,
    clearHref,
  };
}
