'use client';

import { useMemo } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { usePagination as usePaginationCore } from '@/hooks/usePagination';

interface UsePaginationProps {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export function usePagination({ page, pageSize, total }: UsePaginationProps) {
  const core = usePaginationCore({ page, pageSize, total });

  return useMemo(() => {
    const buildHref = (targetPage: number): string => {
      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('pageSize', String(pageSize));
      const query = params.toString();
      return query.length > 0
        ? `${APP_ROUTES.ADMIN_WAITLIST}?${query}`
        : APP_ROUTES.ADMIN_WAITLIST;
    };

    const prevHref = core.canPrev ? buildHref(page - 1) : undefined;
    const nextHref = core.canNext ? buildHref(page + 1) : undefined;

    return {
      totalPages: core.totalPages,
      canPrev: core.canPrev,
      canNext: core.canNext,
      from: core.from,
      to: core.to,
      prevHref,
      nextHref,
    };
  }, [
    core.totalPages,
    core.canPrev,
    core.canNext,
    core.from,
    core.to,
    page,
    pageSize,
  ]);
}
