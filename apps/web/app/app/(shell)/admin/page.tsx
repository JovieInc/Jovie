import type { Metadata } from 'next';
import { Suspense } from 'react';
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
    <div
      className='flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6'
      data-testid='admin-dashboard-content'
    >
      <div className='space-y-8'>
        <header>
          <h1 className='sr-only'>Admin Dashboard</h1>
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
    </div>
  );
}
