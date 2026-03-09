import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import {
  AdminBraggingRightsSection,
  AdminBraggingRightsSectionSkeleton,
  AdminKpiSection,
  AdminKpiSectionSkeleton,
  AdminOutreachSection,
  AdminOutreachSectionSkeleton,
  AdminSentrySection,
  AdminSentrySectionSkeleton,
  AdminUsageSection,
  AdminUsageSectionSkeleton,
} from './_components';

export const metadata: Metadata = {
  title: 'Admin dashboard',
};

export const runtime = 'nodejs';

export default function AdminPage() {
  return (
    <PageShell>
      <PageContent>
        <div
          className='flex h-full flex-col gap-6'
          data-testid='admin-dashboard-content'
        >
          {/* Row 0: Platform bragging rights — labels, distributors, stats */}
          <Suspense fallback={<AdminBraggingRightsSectionSkeleton />}>
            <AdminBraggingRightsSection />
          </Suspense>

          {/* Row 1: Growth KPIs */}
          <Suspense fallback={<AdminKpiSectionSkeleton />}>
            <AdminKpiSection />
          </Suspense>

          {/* Row 2: Outreach pipeline + Reliability side by side */}
          <div className='grid min-h-0 flex-1 gap-6 lg:grid-cols-3'>
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

          {/* Row 3: Sentry */}
          <Suspense fallback={<AdminSentrySectionSkeleton />}>
            <AdminSentrySection />
          </Suspense>
        </div>
      </PageContent>
    </PageShell>
  );
}
