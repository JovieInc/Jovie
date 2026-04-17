'use client';
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from 'nuqs';
import * as React from 'react';
import { DashboardErrorFallback } from '@/components/organisms/DashboardErrorFallback';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { audienceSortFields, audienceViews } from '@/lib/nuqs';
import { QueryErrorBoundary, useAudienceInfiniteQuery } from '@/lib/queries';
import type { TourDateForMatching } from '@/lib/utils/touring-city-match';
import type { AudienceMember } from '@/types';
import {
  AudiencePanelProvider,
  useAudiencePanel,
} from './AudiencePanelContext';
import { DashboardAudienceWorkspace } from './DashboardAudienceWorkspace';
import type {
  AudienceFilters,
  AudienceView,
} from './dashboard-audience-table/types';

export type AudienceMode = 'members' | 'subscribers';

export interface DashboardAudienceClientProps {
  readonly mode: AudienceMode;
  readonly view: AudienceView;
  readonly initialRows: AudienceMember[];
  /** Null when the per-page COUNT query was skipped for performance (JOV-1262, JOV-1264). */
  readonly total: number | null;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: string;
  readonly direction: 'asc' | 'desc';
  readonly profileUrl?: string;
  readonly profileId?: string;
  /** Null when the identified COUNT query was skipped for performance (JOV-1262). */
  readonly subscriberCount: number | null;
  /** Null when the audience COUNT query was skipped for performance (JOV-1262). */
  readonly totalAudienceCount: number | null;
  readonly filters: AudienceFilters;
  readonly tourDates?: TourDateForMatching[];
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
  totalAudienceCount,
  filters: initialFilters,
  tourDates,
}: Readonly<DashboardAudienceClientProps>) {
  return (
    <AudiencePanelProvider initialMode={null}>
      <DashboardAudienceClientInner
        mode={mode}
        view={view}
        initialRows={initialRows}
        total={total}
        sort={sort}
        direction={direction}
        profileUrl={profileUrl}
        profileId={profileId}
        subscriberCount={subscriberCount}
        totalAudienceCount={totalAudienceCount}
        filters={initialFilters}
        tourDates={tourDates}
      />
    </AudiencePanelProvider>
  );
}

function DashboardAudienceClientInner({
  mode,
  view,
  initialRows,
  total,
  sort,
  direction,
  profileUrl,
  profileId,
  subscriberCount,
  totalAudienceCount,
  filters: initialFilters,
  tourDates,
}: Readonly<Omit<DashboardAudienceClientProps, 'page' | 'pageSize'>>) {
  const { mode: panelMode, open, close } = useAudiencePanel();
  const isBelowLg = useBreakpointDown('lg');
  const previousIsBelowLgRef = React.useRef<boolean | null>(null);

  React.useEffect(() => {
    if ((globalThis.window?.innerWidth ?? 0) >= 1024) {
      open('analytics');
    }
  }, [open]);

  React.useEffect(() => {
    if (previousIsBelowLgRef.current === null) {
      previousIsBelowLgRef.current = isBelowLg;
      return;
    }

    const crossedToMobile = previousIsBelowLgRef.current === false && isBelowLg;
    previousIsBelowLgRef.current = isBelowLg;

    if (crossedToMobile && panelMode === 'analytics') {
      close();
    }
  }, [close, isBelowLg, panelMode]);

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
      view,
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
        className='flex h-full min-h-0 flex-col'
      >
        <div className='flex-1 min-h-0 flex flex-col'>
          <DashboardAudienceWorkspace
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
            totalAudienceCount={totalAudienceCount}
            filters={initialFilters}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={handleLoadMore}
            tourDates={tourDates}
          />
        </div>
      </div>
    </QueryErrorBoundary>
  );
}
