import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import {
  AdminBraggingRightsSection,
  AdminBraggingRightsSectionSkeleton,
  AdminKpiSection,
  AdminKpiSectionSkeleton,
  AdminOutreachSection,
  AdminOutreachSectionSkeleton,
  AdminPlatformStatsSection,
  AdminPlatformStatsSectionSkeleton,
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

          {/* Row 1: Business KPIs + YC metrics */}
          <Suspense fallback={<AdminKpiSectionSkeleton />}>
            <AdminKpiSection />
          </Suspense>

          <ContentSurfaceCard as='details' className='overflow-hidden'>
            <summary className='list-none [&::-webkit-details-marker]:hidden'>
              <ContentSectionHeader
                title='Platform reach metrics'
                subtitle='Secondary platform stats kept below the fold'
                actions={
                  <span className='text-[12px] font-[560] text-(--linear-text-tertiary)'>
                    Expand
                  </span>
                }
                className='min-h-0 cursor-pointer px-(--linear-app-header-padding-x) py-3'
                actionsClassName='shrink-0'
              />
            </summary>
            <div className='space-y-4 border-t border-(--linear-border-subtle) px-(--linear-app-header-padding-x) py-4'>
              <p className='text-app text-secondary-token'>
                Secondary platform stats are intentionally below the fold so
                core business KPIs stay front and center.
              </p>
              <Suspense fallback={<AdminPlatformStatsSectionSkeleton />}>
                <AdminPlatformStatsSection />
              </Suspense>
            </div>
          </ContentSurfaceCard>

          {/* Row 3: Outreach pipeline + Reliability side by side */}

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

          {/* Row 4: Sentry */}
          <Suspense fallback={<AdminSentrySectionSkeleton />}>
            <AdminSentrySection />
          </Suspense>
        </div>
      </PageContent>
    </PageShell>
  );
}
