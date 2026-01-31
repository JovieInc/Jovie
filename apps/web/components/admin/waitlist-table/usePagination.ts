'use client';

import { useMemo } from 'react';

interface UsePaginationProps {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export function usePagination({ page, pageSize, total }: UsePaginationProps) {
  return useMemo(() => {
    const totalPages = total > 0 ? Math.max(Math.ceil(total / pageSize), 1) : 1;
    const canPrev = page > 1;
    const canNext = page < totalPages;

    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = total === 0 ? 0 : Math.min(page * pageSize, total);

    const buildHref = (targetPage: number): string => {
      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('pageSize', String(pageSize));
      const query = params.toString();
      return query.length > 0
        ? `/app/admin/waitlist?${query}`
        : '/app/admin/waitlist';
    };

    const prevHref = canPrev ? buildHref(page - 1) : undefined;
    const nextHref = canNext ? buildHref(page + 1) : undefined;

    return {
      totalPages,
      canPrev,
      canNext,
      from,
      to,
      prevHref,
      nextHref,
    };
  }, [page, pageSize, total]);
}
