import type { Metadata } from 'next';

import { ActivityTable } from '@/components/admin/activity-table';
import { CreatorProfilesTable } from '@/components/admin/CreatorProfilesTable';
import { KpiCards } from '@/components/admin/kpi-cards';
import { MetricsChart } from '@/components/admin/metrics-chart';
import { ReliabilityCard } from '@/components/admin/reliability-card';
import {
  type AdminCreatorProfilesSort,
  getAdminCreatorProfiles,
} from '@/lib/admin/creator-profiles';
import {
  getAdminActivityFeed,
  getAdminReliabilitySummary,
  getAdminUsageSeries,
} from '@/lib/admin/overview';

interface AdminOverviewMetrics {
  mrrUsd: number;
  activeSubscribers: number;
}

interface AdminPageProps {
  searchParams?: {
    page?: string;
    q?: string;
    sort?: string;
    pageSize?: string;
  };
}

export const metadata: Metadata = {
  title: 'Admin dashboard',
};

async function getAdminOverviewMetrics(): Promise<AdminOverviewMetrics> {
  try {
    const response = await fetch('/api/admin/overview', {
      cache: 'no-store',
    });

    if (!response.ok) {
      return { mrrUsd: 0, activeSubscribers: 0 };
    }

    const json = (await response.json()) as Partial<AdminOverviewMetrics>;

    return {
      mrrUsd: typeof json.mrrUsd === 'number' ? json.mrrUsd : 0,
      activeSubscribers:
        typeof json.activeSubscribers === 'number' ? json.activeSubscribers : 0,
    };
  } catch {
    return { mrrUsd: 0, activeSubscribers: 0 };
  }
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const metrics = await getAdminOverviewMetrics();

  const [usageSeries, reliabilitySummary, activityItems] = await Promise.all([
    getAdminUsageSeries(14),
    getAdminReliabilitySummary(),
    getAdminActivityFeed(20),
  ]);

  const pageParam = searchParams?.page
    ? Number.parseInt(searchParams.page, 10)
    : 1;
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const search = searchParams?.q ?? '';

  const pageSizeParam = searchParams?.pageSize
    ? Number.parseInt(searchParams.pageSize, 10)
    : 20;
  const pageSize =
    Number.isFinite(pageSizeParam) && pageSizeParam > 0 && pageSizeParam <= 100
      ? pageSizeParam
      : 20;

  const sortParam = searchParams?.sort;
  const sort: AdminCreatorProfilesSort =
    sortParam === 'created_asc' ||
    sortParam === 'verified_desc' ||
    sortParam === 'verified_asc' ||
    sortParam === 'claimed_desc' ||
    sortParam === 'claimed_asc'
      ? sortParam
      : 'created_desc';

  const {
    profiles,
    page: currentPage,
    pageSize: resolvedPageSize,
    total,
  } = await getAdminCreatorProfiles({
    page,
    pageSize,
    search,
    sort,
  });

  return (
    <div className='space-y-8'>
      <header className='space-y-2'>
        <p className='text-xs uppercase tracking-wide text-tertiary-token'>
          Internal
        </p>
        <h1 className='text-3xl font-semibold text-primary-token'>
          Admin dashboard
        </h1>
        <p className='text-sm text-secondary-token'>
          High-level KPIs, usage trends, and operational signals for Jovie.
          Admin-only access.
        </p>
      </header>

      <section id='users' className='space-y-4'>
        <KpiCards
          mrrUsd={metrics.mrrUsd}
          activeSubscribers={metrics.activeSubscribers}
        />
        <CreatorProfilesTable
          profiles={profiles}
          page={currentPage}
          pageSize={resolvedPageSize}
          total={total}
          search={search}
          sort={sort}
        />
      </section>

      <section id='usage' className='grid gap-6 lg:grid-cols-3'>
        <div className='lg:col-span-2'>
          <MetricsChart points={usageSeries} />
        </div>
        <div id='errors' className='h-full'>
          <ReliabilityCard summary={reliabilitySummary} />
        </div>
      </section>

      <section id='activity'>
        <ActivityTable items={activityItems} />
      </section>
    </div>
  );
}
