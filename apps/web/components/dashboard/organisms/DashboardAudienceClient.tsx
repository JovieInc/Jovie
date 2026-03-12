'use client';

import { BarChart3, User } from 'lucide-react';
import dynamic from 'next/dynamic';
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from 'nuqs';
import * as React from 'react';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';
import { DashboardHeaderActionGroup } from '@/components/dashboard/atoms/DashboardHeaderActionGroup';
import { DashboardErrorFallback } from '@/components/organisms/DashboardErrorFallback';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { audienceSortFields, audienceViews } from '@/lib/nuqs';
import { useAudienceInfiniteQuery } from '@/lib/queries/audience-infinite';
import { QueryErrorBoundary } from '@/lib/queries/QueryErrorBoundary';
import type { TourDateForMatching } from '@/lib/utils/touring-city-match';
import type { AudienceMember } from '@/types';
import {
  type AudiencePanelMode,
  AudiencePanelProvider,
  useAudiencePanel,
} from './AudiencePanelContext';
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

/** Header action buttons for toggling right panel between contact and analytics */
function AudienceHeaderActions({
  mode,
  onToggle,
}: {
  readonly mode: AudiencePanelMode | null;
  readonly onToggle: (panel: AudiencePanelMode) => void;
}) {
  return (
    <DashboardHeaderActionGroup>
      <DashboardHeaderActionButton
        ariaLabel={
          mode === 'contact' ? 'Close contact sidebar' : 'Open contact sidebar'
        }
        pressed={mode === 'contact'}
        onClick={() => onToggle('contact')}
        icon={<User className='h-4 w-4' />}
      />
      <DashboardHeaderActionButton
        ariaLabel={
          mode === 'analytics'
            ? 'Close analytics sidebar'
            : 'Open analytics sidebar'
        }
        pressed={mode === 'analytics'}
        onClick={() => onToggle('analytics')}
        icon={<BarChart3 className='h-4 w-4' />}
      />
    </DashboardHeaderActionGroup>
  );
}

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
    <AudiencePanelProvider>
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
  // Register header actions with both panel toggle buttons
  const { setHeaderActions } = useSetHeaderActions();
  const { mode: panelMode, toggle: togglePanel } = useAudiencePanel();

  const headerActions = React.useMemo(
    () => <AudienceHeaderActions mode={panelMode} onToggle={togglePanel} />,
    [panelMode, togglePanel]
  );

  React.useEffect(() => {
    setHeaderActions(headerActions);
    return () => setHeaderActions(null);
  }, [setHeaderActions, headerActions]);

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
