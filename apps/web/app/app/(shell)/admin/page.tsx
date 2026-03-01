import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import {
  AdminActivitySection,
  AdminActivitySectionSkeleton,
  AdminKpiSection,
  AdminKpiSectionSkeleton,
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
          className='space-y-6 md:space-y-8'
          data-testid='admin-dashboard-content'
        >
          <Suspense fallback={<AdminKpiSectionSkeleton />}>
            <AdminKpiSection />
          </Suspense>

          <Suspense fallback={<AdminUsageSectionSkeleton />}>
            <AdminUsageSection />
          </Suspense>

          <Suspense fallback={<AdminSentrySectionSkeleton />}>
            <AdminSentrySection />
          </Suspense>

          <Suspense fallback={<AdminActivitySectionSkeleton />}>
            <AdminActivitySection />
          </Suspense>
        </div>
      </PageContent>
    </PageShell>
  );
}
