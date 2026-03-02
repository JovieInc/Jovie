'use client';

import { Button } from '@jovie/ui';
import { BarChart3 } from 'lucide-react';
import dynamic from 'next/dynamic';
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from 'nuqs';
import * as React from 'react';
import { DashboardErrorFallback } from '@/components/organisms/DashboardErrorFallback';
import { audienceSortFields, audienceViews } from '@/lib/nuqs';
import { useAudienceInfiniteQuery } from '@/lib/queries/audience-infinite';
import { QueryErrorBoundary } from '@/lib/queries/QueryErrorBoundary';
import type { AudienceMember } from '@/types';
import { AnalyticsSidebar } from './AnalyticsSidebar';
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
  sort: parseAsStringLiteral(audienceSortFields).withDefault('lastSeen'),
  direction: parseAsStringLiteral(['asc', 'desc'] as const).withDefault('desc'),
};

export function DashboardAudienceClient({
  mode,
  view,
  initialRows,
  total,
  sort,
  direction,
  profileUrl,
  profileId,
  subscriberCount,
  filters: initialFilters,
}: Readonly<DashboardAudienceClientProps>) {
  // Analytics sidebar state
  const [isAnalyticsOpen, setIsAnalyticsOpen] = React.useState(false);
  const toggleAnalytics = React.useCallback(() => {
    setIsAnalyticsOpen(prev => !prev);
  }, []);
  const closeAnalytics = React.useCallback(() => {
    setIsAnalyticsOpen(false);
  }, []);

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

  // Infinite query for audience data
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useAudienceInfiniteQuery({
      profileId: profileId ?? '',
      mode,
      sort,
      direction,
      filters: initialFilters,
      initialData: { rows: initialRows, total },
    });

  // Flatten pages into a single rows array
  const rows = React.useMemo(
    () => data?.pages.flatMap(p => p.rows) ?? initialRows,
    [data?.pages, initialRows]
  );

  const totalCount = data?.pages[0]?.total ?? total;

  const handleSortChange = React.useCallback(
    (nextSort: string) => {
      const isSameSort = sort === nextSort;
      const nextDirection: 'asc' | 'desc' =
        isSameSort && direction === 'asc' ? 'desc' : 'asc';

      setUrlParams({
        sort: nextSort as (typeof audienceUrlParsers.sort)['defaultValue'],
        direction: nextDirection,
      });
    },
    [sort, direction, setUrlParams]
  );

  const handleViewChange = React.useCallback(
    (nextView: AudienceView) => {
      setView(nextView);
      setSegments([]);
      setUrlParams({ sort: 'lastSeen', direction: 'desc' });
    },
    [setView, setSegments, setUrlParams]
  );

  const handleFiltersChange = React.useCallback(
    (nextFilters: AudienceFilters) => {
      setSegments(nextFilters.segments);
    },
    [setSegments]
  );

  const handleLoadMore = React.useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <QueryErrorBoundary fallback={DashboardErrorFallback}>
      <div
        data-testid='dashboard-audience-client'
        className='flex h-full min-h-0 flex-row'
      >
        {/* Main content area */}
        <div className='flex-1 min-w-0 flex flex-col'>
          {/* Analytics toggle bar */}
          <div className='shrink-0 flex items-center justify-end px-4 pt-3 pb-1 sm:px-6'>
            <Button
              size='sm'
              variant={isAnalyticsOpen ? 'secondary' : 'ghost'}
              onClick={toggleAnalytics}
              className='gap-1.5 text-[13px]'
              aria-label={
                isAnalyticsOpen ? 'Close analytics' : 'Open analytics'
              }
              aria-expanded={isAnalyticsOpen}
            >
              <BarChart3 className='h-3.5 w-3.5' />
              Analytics
            </Button>
          </div>

          <div className='flex-1 min-h-0 flex flex-col'>
            <DashboardAudienceTable
              mode={mode}
              view={view}
              rows={rows}
              total={totalCount}
              sort={sort}
              direction={direction}
              onSortChange={handleSortChange}
              onViewChange={handleViewChange}
              onFiltersChange={handleFiltersChange}
              profileUrl={profileUrl}
              profileId={profileId}
              subscriberCount={subscriberCount}
              filters={initialFilters}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={handleLoadMore}
            />
          </div>
        </div>

        {/* Analytics right drawer */}
        <AnalyticsSidebar isOpen={isAnalyticsOpen} onClose={closeAnalytics} />
      </div>
    </QueryErrorBoundary>
  );
}
