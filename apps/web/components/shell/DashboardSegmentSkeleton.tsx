import { Skeleton } from '@jovie/ui';
import type { ReactNode } from 'react';

const DASHBOARD_LOADING_ROWS = [1, 2, 3, 4] as const;
const ADMIN_KPI_CARDS = [1, 2, 3, 4] as const;
const INSIGHT_FILTERS = [1, 2, 3, 4, 5, 6, 7] as const;
const INSIGHT_CARDS = [1, 2, 3, 4] as const;
const PROFILE_FILTERS = [1, 2, 3, 4, 5] as const;
const PROFILE_ROWS = [1, 2, 3, 4, 5, 6] as const;
const TOUR_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type DashboardSegmentSkeletonVariant =
  | 'default'
  | 'admin'
  | 'insights'
  | 'profile'
  | 'tour';

const LOADING_LABELS: Record<DashboardSegmentSkeletonVariant, string> = {
  default: 'Loading dashboard',
  admin: 'Loading admin',
  insights: 'Loading insights',
  profile: 'Loading artist profiles',
  tour: 'Loading tour dates',
};

interface DashboardSegmentSkeletonProps {
  readonly rowKeyPrefix?: string;
  readonly variant?: DashboardSegmentSkeletonVariant;
}

function DefaultSkeleton({ rowKeyPrefix }: { readonly rowKeyPrefix: string }) {
  return (
    <div className='space-y-3 p-4 sm:p-5' data-skeleton-layout='default'>
      <div className='flex items-center justify-between gap-3'>
        <div className='space-y-2'>
          <Skeleton className='h-6 w-52' rounded='md' />
          <Skeleton className='h-4 w-72' />
        </div>
        <Skeleton className='h-8 w-24' rounded='md' />
      </div>

      <div className='space-y-3 rounded-xl border border-subtle/70 bg-surface-0 p-3'>
        <div className='grid grid-cols-[minmax(0,1.5fr)_120px_72px] gap-3 border-b border-subtle/60 pb-2'>
          <Skeleton className='h-3 w-24' />
          <Skeleton className='h-3 w-16' />
          <Skeleton className='h-3 w-12' />
        </div>

        {DASHBOARD_LOADING_ROWS.map(row => (
          <div
            key={`${rowKeyPrefix}-${row}`}
            className='grid grid-cols-[minmax(0,1.5fr)_120px_72px] items-center gap-3 py-1'
          >
            <Skeleton className='h-4 w-full' />
            <Skeleton className='h-4 w-20' />
            <Skeleton className='h-4 w-12' />
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminSkeleton() {
  return (
    <div
      className='flex min-h-full flex-col gap-4 p-4 sm:p-5'
      data-skeleton-layout='admin'
    >
      <div
        className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'
        data-skeleton-slot='admin-kpis'
      >
        {ADMIN_KPI_CARDS.map(card => (
          <Skeleton key={card} className='h-43 w-full rounded-xl' />
        ))}
      </div>
      <Skeleton
        className='h-40 w-full shrink-0 rounded-xl'
        data-skeleton-slot='admin-scoreboard'
      />
      <div
        className='grid min-h-72 flex-1 grid-cols-1 gap-4 lg:grid-cols-3'
        data-skeleton-slot='admin-panels'
      >
        <Skeleton className='h-full min-h-72 w-full rounded-xl lg:col-span-2' />
        <Skeleton className='h-full min-h-72 w-full rounded-xl' />
      </div>
    </div>
  );
}

function InsightsSkeleton() {
  return (
    <div className='space-y-4 p-3 sm:p-4' data-skeleton-layout='insights'>
      <div
        className='flex min-h-8 flex-wrap gap-1.5'
        data-skeleton-slot='insights-filters'
      >
        {INSIGHT_FILTERS.map(filter => (
          <Skeleton key={filter} className='h-8 w-20' rounded='full' />
        ))}
      </div>
      <div className='space-y-3' data-skeleton-slot='insights-cards'>
        {INSIGHT_CARDS.map(card => (
          <Skeleton key={card} className='h-28 w-full rounded-xl' />
        ))}
      </div>
    </div>
  );
}

function ProfileSkeleton({ rowKeyPrefix }: { readonly rowKeyPrefix: string }) {
  return (
    <div className='min-h-full' data-skeleton-layout='profile'>
      <div
        className='flex min-h-10 items-center gap-1.5 border-b border-subtle px-3 py-1'
        data-skeleton-slot='profile-filters'
      >
        {PROFILE_FILTERS.map(filter => (
          <Skeleton key={filter} className='h-7 w-14 sm:w-16' rounded='full' />
        ))}
      </div>
      <div className='min-w-0' data-skeleton-slot='profile-table'>
        <div className='grid h-10 grid-cols-12 items-center gap-3 border-b border-subtle px-3'>
          <Skeleton className='col-span-8 h-3 w-24 sm:col-span-6' />
          <Skeleton className='col-span-2 hidden h-3 w-12 sm:block' />
          <Skeleton className='col-span-2 hidden h-3 w-16 sm:block' />
          <Skeleton className='col-span-2 h-3 w-14 sm:col-span-2' />
        </div>
        {PROFILE_ROWS.map(row => (
          <div
            key={`${rowKeyPrefix}-${row}`}
            className='grid h-14 grid-cols-12 items-center gap-3 border-b border-subtle px-3'
          >
            <div className='col-span-8 flex min-w-0 items-center gap-2.5 sm:col-span-6'>
              <Skeleton className='h-7 w-7 shrink-0' rounded='md' />
              <div className='min-w-0 flex-1 space-y-1.5'>
                <Skeleton className='h-3.5 w-32 max-w-full' />
                <Skeleton className='h-3 w-44 max-w-full' />
              </div>
            </div>
            <Skeleton className='col-span-2 hidden h-3 w-12 sm:block' />
            <Skeleton className='col-span-2 hidden h-3 w-20 sm:block' />
            <Skeleton className='col-span-2 h-3 w-14 sm:col-span-2' />
          </div>
        ))}
      </div>
    </div>
  );
}

function TourSkeleton() {
  return (
    <div className='flex h-full min-h-0 flex-col' data-skeleton-layout='tour'>
      <div
        className='flex h-11 shrink-0 items-center justify-between border-b border-subtle bg-surface-1 px-4'
        data-skeleton-slot='tour-status'
      >
        <div className='flex items-center gap-2'>
          <Skeleton className='h-6 w-6' rounded='lg' />
          <Skeleton className='h-4 w-52 max-w-full' />
        </div>
        <div className='flex items-center gap-2'>
          <Skeleton className='h-8 w-16' rounded='md' />
          <Skeleton className='hidden h-8 w-24 sm:block' rounded='md' />
        </div>
      </div>
      <div
        className='min-h-0 flex-1 overflow-hidden'
        data-skeleton-slot='tour-table'
      >
        <div className='grid h-10 grid-cols-12 items-center gap-3 border-b border-subtle px-4'>
          <Skeleton className='col-span-4 h-3 w-16 sm:col-span-2' />
          <Skeleton className='col-span-5 h-3 w-20 sm:col-span-3' />
          <Skeleton className='col-span-3 h-3 w-16 sm:col-span-2' />
          <Skeleton className='col-span-2 hidden h-3 w-14 sm:block' />
          <Skeleton className='col-span-2 hidden h-3 w-14 sm:block' />
          <Skeleton className='col-span-1 hidden h-3 w-8 sm:block' />
        </div>
        {TOUR_ROWS.map(row => (
          <div
            key={row}
            className='grid h-10 grid-cols-12 items-center gap-3 border-b border-subtle px-4'
          >
            <Skeleton className='col-span-4 h-3.5 w-20 sm:col-span-2' />
            <Skeleton className='col-span-5 h-3.5 w-32 max-w-full sm:col-span-3' />
            <Skeleton className='col-span-3 h-3.5 w-24 max-w-full sm:col-span-2' />
            <Skeleton
              className='col-span-2 hidden h-5 w-16 sm:block'
              rounded='full'
            />
            <Skeleton className='col-span-2 hidden h-3.5 w-20 sm:block' />
            <Skeleton
              className='col-span-1 hidden h-7 w-7 sm:block'
              rounded='md'
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Route-shaped loading fallback for shell and dashboard segment boundaries.
 * Every variant has a fixed child structure and reserved geometry so the
 * matching loaded surface can replace it without moving shell chrome.
 */
export function DashboardSegmentSkeleton({
  rowKeyPrefix = 'dashboard-loading-row',
  variant = 'default',
}: DashboardSegmentSkeletonProps) {
  let content: ReactNode;

  switch (variant) {
    case 'admin':
      content = <AdminSkeleton />;
      break;
    case 'insights':
      content = <InsightsSkeleton />;
      break;
    case 'profile':
      content = <ProfileSkeleton rowKeyPrefix={rowKeyPrefix} />;
      break;
    case 'tour':
      content = <TourSkeleton />;
      break;
    default:
      content = <DefaultSkeleton rowKeyPrefix={rowKeyPrefix} />;
  }

  return (
    <div
      role='status'
      aria-busy='true'
      aria-label={LOADING_LABELS[variant]}
      aria-live='polite'
      data-testid='dashboard-segment-skeleton'
      data-skeleton-variant={variant}
      className='min-h-full w-full'
    >
      {content}
    </div>
  );
}
