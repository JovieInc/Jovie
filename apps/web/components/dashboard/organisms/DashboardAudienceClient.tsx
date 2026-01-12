'use client';

import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { DashboardErrorFallback } from '@/components/atoms/DashboardErrorFallback';
import { QueryErrorBoundary } from '@/lib/queries/QueryErrorBoundary';
import type { AudienceMember } from '@/types';

const DashboardAudienceTable = dynamic(
  () =>
    import('@/components/dashboard/organisms/dashboard-audience-table').then(
      mod => ({
        default: mod.DashboardAudienceTable,
      })
    ),
  {
    loading: () => (
      <div className='h-full w-full space-y-4 p-4'>
        <div className='flex items-center justify-between'>
          <div className='h-8 w-48 animate-pulse rounded bg-surface-1' />
          <div className='h-8 w-32 animate-pulse rounded bg-surface-1' />
        </div>
        <div className='space-y-2'>
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className='h-14 animate-pulse rounded-lg bg-surface-1'
            />
          ))}
        </div>
      </div>
    ),
    ssr: false,
  }
);

export type AudienceMode = 'members' | 'subscribers';

type AudienceServerRow = AudienceMember;

export interface DashboardAudienceClientProps {
  mode: AudienceMode;
  initialRows: AudienceServerRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  direction: 'asc' | 'desc';
  profileUrl?: string;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function setSearchParams(
  current: URLSearchParams,
  next: Record<string, string | number | null | undefined>
): URLSearchParams {
  const copy = new URLSearchParams(current);
  Object.entries(next).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      copy.delete(key);
      return;
    }
    copy.set(key, String(value));
  });
  return copy;
}

export function DashboardAudienceClient({
  mode,
  initialRows,
  total,
  page,
  pageSize,
  sort,
  direction,
  profileUrl,
}: DashboardAudienceClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handlePageChange = React.useCallback(
    (nextPage: number) => {
      const clamped = clampInt(nextPage, 1, 9999);
      const next = setSearchParams(searchParams, { page: clamped });
      router.push(`${pathname}?${next.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const handlePageSizeChange = React.useCallback(
    (nextPageSize: number) => {
      const clamped = clampInt(nextPageSize, 1, 100);
      const next = setSearchParams(searchParams, {
        pageSize: clamped,
        page: 1,
      });
      router.push(`${pathname}?${next.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const handleSortChange = React.useCallback(
    (nextSort: string) => {
      const isSame = sort === nextSort;
      const nextDirection: 'asc' | 'desc' =
        isSame && direction === 'asc' ? 'desc' : 'asc';

      const next = setSearchParams(searchParams, {
        sort: nextSort,
        direction: nextDirection,
        page: 1,
      });
      router.push(`${pathname}?${next.toString()}`);
    },
    [direction, pathname, router, searchParams, sort]
  );

  return (
    <QueryErrorBoundary fallback={DashboardErrorFallback}>
      <div data-testid='dashboard-audience-client'>
        <DashboardAudienceTable
          mode={mode}
          rows={initialRows}
          total={total}
          page={page}
          pageSize={pageSize}
          sort={sort}
          direction={direction}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onSortChange={handleSortChange}
          profileUrl={profileUrl}
        />
      </div>
    </QueryErrorBoundary>
  );
}
