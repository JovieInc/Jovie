'use client';

import type { CommonDropdownItem } from '@jovie/ui';
import { Copy, Download, Eye, Phone, UserMinus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
  useQueryStates,
} from 'nuqs';
import * as React from 'react';
import { toast } from 'sonner';
import { DrawerToggleButton } from '@/components/dashboard/atoms/DrawerToggleButton';
import { AudienceMemberSidebar } from '@/components/dashboard/organisms/audience-member-sidebar';
import { DashboardErrorFallback } from '@/components/organisms/DashboardErrorFallback';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { audienceSortFields, audienceViews } from '@/lib/nuqs';
import { QueryErrorBoundary } from '@/lib/queries/QueryErrorBoundary';
import { cn } from '@/lib/utils';
import type { AudienceMember } from '@/types';
import { AudienceFunnelMetrics } from './AudienceFunnelMetrics';
import type {
  AudienceFilters,
  AudienceView,
} from './dashboard-audience-table/types';
import { downloadVCard } from './dashboard-audience-table/utils';

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

const VIEW_OPTIONS: { value: AudienceView; label: string }[] = [
  { value: 'all', label: 'All audience' },
  { value: 'subscribers', label: 'Subscribers' },
  { value: 'anonymous', label: 'Anonymous' },
];

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
  const router = useRouter();

  // Lifted selectedMember state — so the sidebar can render at this level
  const [selectedMember, setSelectedMember] =
    React.useState<AudienceMember | null>(null);

  // Stable callback for child components
  const handleSelectedMemberChange = React.useCallback(
    (member: AudienceMember | null) => setSelectedMember(member),
    []
  );

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

  // --- Header badge: view tabs replace the breadcrumb ---
  const { setHeaderBadge, setHeaderActions } = useSetHeaderActions();

  const headerBadge = React.useMemo(
    () => (
      <fieldset className='inline-flex items-center gap-0.5 rounded-md bg-transparent p-0'>
        <legend className='sr-only'>Audience view filter</legend>
        {VIEW_OPTIONS.map(option => (
          <button
            key={option.value}
            type='button'
            onClick={() => handleViewChange(option.value)}
            aria-pressed={view === option.value}
            className={cn(
              'h-7 px-2.5 text-[13px] font-medium rounded-md transition-colors',
              view === option.value
                ? 'bg-surface-2 text-primary-token'
                : 'text-tertiary-token hover:text-secondary-token'
            )}
          >
            {option.label}
          </button>
        ))}
      </fieldset>
    ),
    [view, handleViewChange]
  );

  const headerActions = React.useMemo(() => <DrawerToggleButton />, []);

  React.useEffect(() => {
    setHeaderBadge(headerBadge);
    setHeaderActions(headerActions);
    return () => {
      setHeaderBadge(null);
      setHeaderActions(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setHeaderBadge/setHeaderActions are stable context setters
  }, [headerBadge, headerActions]);

  // --- Sidebar context menu items ---
  const handleRemoveMember = React.useCallback(
    async (member: AudienceMember) => {
      if (!profileId) return;
      try {
        const res = await fetch('/api/dashboard/audience/members', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberId: member.id, profileId }),
        });
        if (!res.ok) throw new Error('Failed to remove member');
        toast.success('Member removed');
        if (selectedMember?.id === member.id) setSelectedMember(null);
        router.refresh();
      } catch {
        toast.error('Failed to remove member');
      }
    },
    [profileId, selectedMember, router]
  );

  const sidebarContextMenuItems = React.useMemo<
    CommonDropdownItem[] | undefined
  >(() => {
    if (!selectedMember) return undefined;
    return [
      {
        type: 'action' as const,
        id: 'view-details',
        label: 'View details',
        icon: <Eye className='h-3.5 w-3.5' />,
        onClick: () => {},
      },
      {
        type: 'action' as const,
        id: 'copy-email',
        label: 'Copy email',
        icon: <Copy className='h-3.5 w-3.5' />,
        disabled: !selectedMember.email,
        onClick: () => {
          if (selectedMember.email) {
            void navigator.clipboard.writeText(selectedMember.email);
            toast.success('Email copied to clipboard');
          }
        },
      },
      {
        type: 'action' as const,
        id: 'copy-phone',
        label: 'Copy phone',
        icon: <Phone className='h-3.5 w-3.5' />,
        disabled: !selectedMember.phone,
        onClick: () => {
          if (selectedMember.phone) {
            void navigator.clipboard.writeText(selectedMember.phone);
            toast.success('Phone number copied to clipboard');
          }
        },
      },
      { type: 'separator' as const, id: 'sep-1' },
      {
        type: 'action' as const,
        id: 'export-contact',
        label: 'Export as vCard',
        icon: <Download className='h-3.5 w-3.5' />,
        onClick: () => {
          downloadVCard(selectedMember);
          toast.success('Contact exported as vCard');
        },
      },
      { type: 'separator' as const, id: 'sep-2' },
      {
        type: 'action' as const,
        id: 'remove-member',
        label: 'Block',
        icon: <UserMinus className='h-3.5 w-3.5' />,
        disabled: !profileId,
        variant: 'destructive' as const,
        onClick: () => {
          handleRemoveMember(selectedMember).catch(() => {});
        },
      },
    ];
  }, [selectedMember, profileId, handleRemoveMember]);

  return (
    <QueryErrorBoundary fallback={DashboardErrorFallback}>
      <div
        data-testid='dashboard-audience-client'
        className='flex h-full min-h-0 flex-row'
      >
        {/* Main content column: funnel metrics + table */}
        <div className='flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden'>
          <div className='px-4 pt-4 sm:px-6 sm:pt-5 shrink-0'>
            <AudienceFunnelMetrics />
          </div>
          <div className='flex-1 min-h-0'>
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
              onFiltersChange={handleFiltersChange}
              profileUrl={profileUrl}
              profileId={profileId}
              subscriberCount={subscriberCount}
              filters={initialFilters}
              selectedMember={selectedMember}
              onSelectedMemberChange={handleSelectedMemberChange}
            />
          </div>
        </div>

        {/* Right sidebar — full-height, sibling to content column */}
        <AudienceMemberSidebar
          member={selectedMember}
          isOpen={Boolean(selectedMember)}
          onClose={() => setSelectedMember(null)}
          contextMenuItems={sidebarContextMenuItems}
        />
      </div>
    </QueryErrorBoundary>
  );
}
