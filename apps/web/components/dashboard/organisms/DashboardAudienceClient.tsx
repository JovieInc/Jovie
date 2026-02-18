'use client';

import dynamic from 'next/dynamic';
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from 'nuqs';
import * as React from 'react';
import { DashboardErrorFallback } from '@/components/organisms/DashboardErrorFallback';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { audienceSortFields, audienceViews } from '@/lib/nuqs';
import { QueryErrorBoundary } from '@/lib/queries/QueryErrorBoundary';
import type { AudienceMember } from '@/types';
import { AudienceFunnelMetrics } from './AudienceFunnelMetrics';
import { AudienceHeaderBadge } from './dashboard-audience-table/AudienceHeaderBadge';
import type {
  AudienceFilters,
  AudienceView,
} from './dashboard-audience-table/types';

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
          <div className='h-8 w-48 rounded skeleton' />
          <div className='h-8 w-32 rounded skeleton' />
        </div>
        <div className='space-y-2'>
          {DASHBOARD_AUDIENCE_LOADING_ROW_KEYS.map(key => (
            <div key={key} className='h-14 rounded-lg skeleton' />
          ))}
        </div>
      </div>
    ),
    ssr: false,
  }
);

export type AudienceMode = 'members' | 'subscribers';

export interface DashboardAudienceClientProps {
  readonly mode: AudienceMode;
  readonly view: AudienceView;
  readonly initialRows: AudienceMember[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: string;
  readonly direction: 'asc' | 'desc';
  readonly profileUrl?: string;
  readonly profileId?: string;
  readonly subscriberCount: number;
  readonly filters: AudienceFilters;
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
  filters: initialFilters,
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

  const [, setSegments] = useQueryState(
    'segments',
    parseAsArrayOf(parseAsString).withDefault([]).withOptions({
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
      // Reset to page 1, clear filters, and default sort when changing views
      setView(nextView);
      setSegments([]);
      setUrlParams({ page: 1, sort: 'lastSeen', direction: 'desc' });
    },
    [setView, setSegments, setUrlParams]
  );

  const handleFiltersChange = React.useCallback(
    (nextFilters: AudienceFilters) => {
      setSegments(nextFilters.segments);
      setUrlParams({ page: 1 });
    },
    [setSegments, setUrlParams]
  );

  // Push audience segment control into the breadcrumb header bar
  const { setHeaderBadge } = useSetHeaderActions();

  const headerBadge = React.useMemo(
    () => <AudienceHeaderBadge view={view} onViewChange={handleViewChange} />,
    [view, handleViewChange]
  );

  React.useEffect(() => {
    setHeaderBadge(headerBadge);
    return () => setHeaderBadge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setHeaderBadge is a stable context setter
  }, [headerBadge]);

  return (
    <QueryErrorBoundary fallback={DashboardErrorFallback}>
      <div
        data-testid='dashboard-audience-client'
        className='flex h-full min-h-0 flex-col'
      >
        <div className='shrink-0 px-4 pt-4 sm:px-6 sm:pt-5'>
          <AudienceFunnelMetrics />
        </div>
        <div className='flex-1 min-h-0 flex flex-col'>
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
            onFiltersChange={handleFiltersChange}
            profileUrl={profileUrl}
            profileId={profileId}
            subscriberCount={subscriberCount}
            filters={initialFilters}
          />
        </div>
      </div>
    </QueryErrorBoundary>
  );
}
