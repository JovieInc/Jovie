'use client';

import dynamic from 'next/dynamic';
import {
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from 'nuqs';
import * as React from 'react';
import { DashboardErrorFallback } from '@/components/organisms/DashboardErrorFallback';
import { audienceSortFields, audienceViews } from '@/lib/nuqs';
import { QueryErrorBoundary } from '@/lib/queries/QueryErrorBoundary';
import type { AudienceMember } from '@/types';
import { AudienceFunnelMetrics } from './AudienceFunnelMetrics';
import type { AudienceView } from './dashboard-audience-table/types';

const DASHBOARD_AUDIENCE_LOADING_ROW_KEYS = Array.from(
  { length: 10 },
  (_, i) => `dashboard-audience-loading-row-${i + 1}`
);

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
          {DASHBOARD_AUDIENCE_LOADING_ROW_KEYS.map(key => (
            <div
              key={key}
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
  readonly mode: AudienceMode;
  readonly view: AudienceView;
  readonly initialRows: AudienceServerRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: string;
  readonly direction: 'asc' | 'desc';
  readonly profileUrl?: string;
  readonly profileId?: string;
  readonly subscriberCount: number;
  readonly filter?: string;
}

/**
 * nuqs parsers for audience table URL params.
 * Reuses audienceSortFields from the centralized lib/nuqs module to avoid drift.
 */
const audienceUrlParsers = {
  page: parseAsInteger.withDefault(1),
  pageSize: parseAsInteger.withDefault(20),
  sort: parseAsStringLiteral(audienceSortFields).withDefault('lastSeen'),
  direction: parseAsStringLiteral(['asc', 'desc'] as const).withDefault('desc'),
};

export function DashboardAudienceClient({
  mode,
  view,
  initialRows,
  total,
  page,
  pageSize,
  sort,
  direction,
  profileUrl,
  profileId,
  subscriberCount,
  filter,
}: Readonly<DashboardAudienceClientProps>) {
  // State comes from server props; we only use nuqs to update the URL
  const [, setUrlParams] = useQueryStates(audienceUrlParsers, {
    shallow: false,
    history: 'push',
  });

  const [, setView] = useQueryState(
    'view',
    parseAsStringLiteral(audienceViews).withDefault('all').withOptions({
      shallow: false,
      history: 'push',
    })
  );

  const [, setFilter] = useQueryState(
    'filter',
    parseAsString.withOptions({
      shallow: false,
      history: 'push',
    })
  );

  const handlePageChange = React.useCallback(
    (nextPage: number) => {
      const clampedPage = Math.max(1, Math.min(9999, Math.floor(nextPage)));
      setUrlParams({ page: clampedPage });
    },
    [setUrlParams]
  );

  const handlePageSizeChange = React.useCallback(
    (nextPageSize: number) => {
      const clampedSize = Math.max(1, Math.min(100, Math.floor(nextPageSize)));
      setUrlParams({ pageSize: clampedSize, page: 1 });
    },
    [setUrlParams]
  );

  const handleSortChange = React.useCallback(
    (nextSort: string) => {
      const isSameSort = sort === nextSort;
      const nextDirection: 'asc' | 'desc' =
        isSameSort && direction === 'asc' ? 'desc' : 'asc';

      setUrlParams({
        sort: nextSort as (typeof audienceUrlParsers.sort)['defaultValue'],
        direction: nextDirection,
        page: 1,
      });
    },
    [sort, direction, setUrlParams]
  );

  const handleViewChange = React.useCallback(
    (nextView: AudienceView) => {
      // Reset to page 1 and default sort when changing views
      setView(nextView);
      setFilter(null);
      setUrlParams({ page: 1, sort: 'lastSeen', direction: 'desc' });
    },
    [setView, setFilter, setUrlParams]
  );

  const handleFilterChange = React.useCallback(
    (nextFilter: string | null) => {
      setFilter(nextFilter);
      setUrlParams({ page: 1 });
    },
    [setFilter, setUrlParams]
  );

  return (
    <QueryErrorBoundary fallback={DashboardErrorFallback}>
      <div data-testid='dashboard-audience-client'>
        <div className='px-4 pt-4 sm:px-6 sm:pt-5'>
          <AudienceFunnelMetrics />
        </div>
        <DashboardAudienceTable
          mode={mode}
          view={view}
          rows={initialRows}
          total={total}
          page={page}
          pageSize={pageSize}
          sort={sort}
          direction={direction}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onSortChange={handleSortChange}
          onViewChange={handleViewChange}
          onFilterChange={handleFilterChange}
          profileUrl={profileUrl}
          profileId={profileId}
          subscriberCount={subscriberCount}
          filter={filter}
        />
      </div>
    </QueryErrorBoundary>
  );
}
