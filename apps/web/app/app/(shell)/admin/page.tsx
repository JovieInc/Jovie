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
          <header className='space-y-1'>
            <p className='text-2xs font-medium uppercase tracking-[0.14em] text-tertiary-token'>
              Operations
            </p>
            <h1 className='text-2xl font-semibold tracking-tight text-primary-token'>
              Admin dashboard
            </h1>
            <p className='text-app text-secondary-token'>
              Monitor revenue, reliability, and platform health from one place.
            </p>
          </header>

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
