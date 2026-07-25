import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import {
  AdminFounderHudSection,
  AdminFounderHudSectionSkeleton,
  AdminHeroMetrics,
  AdminHeroMetricsSkeleton,
  AdminKpiSection,
  AdminKpiSectionSkeleton,
  AdminOutreachSection,
  AdminOutreachSectionSkeleton,
  AdminScoreboardSection,
  AdminScoreboardSectionSkeleton,
  AdminUsageSection,
  AdminUsageSectionSkeleton,
} from './_components';

export const metadata: Metadata = {
  title: 'Admin Overview',
  description: 'Funnel scoreboard and operator tools.',
};

export const runtime = 'nodejs';

export default async function AdminOverviewPage() {
  await requireCurrentAdminPageAccess();

  return (
    <AdminPage
      title='Overview'
      description='Funnel scoreboard and operator tools.'
      testId='admin-overview-page'
      viewTestId='admin-dashboard-content'
      hero={
        <Suspense fallback={<AdminHeroMetricsSkeleton />}>
          <AdminHeroMetrics />
        </Suspense>
      }
    >
      <Suspense fallback={<AdminFounderHudSectionSkeleton />}>
        <AdminFounderHudSection />
      </Suspense>

      <Suspense fallback={<AdminScoreboardSectionSkeleton />}>
        <AdminScoreboardSection />
      </Suspense>

      <Suspense fallback={<AdminKpiSectionSkeleton />}>
        <AdminKpiSection />
      </Suspense>

      <div className='grid min-h-0 flex-1 gap-4 lg:grid-cols-3'>
        <div className='lg:col-span-2'>
          <Suspense fallback={<AdminOutreachSectionSkeleton />}>
            <AdminOutreachSection />
          </Suspense>
        </div>
        <div>
          <Suspense fallback={<AdminUsageSectionSkeleton />}>
            <AdminUsageSection />
          </Suspense>
        </div>
      </div>
    </AdminPage>
  );
}
