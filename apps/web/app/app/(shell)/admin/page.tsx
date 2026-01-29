import type { Metadata } from 'next';
import { Suspense } from 'react';
import {
  AdminActivitySection,
  AdminActivitySectionSkeleton,
  AdminKpiSection,
  AdminKpiSectionSkeleton,
  AdminUsageSection,
  AdminUsageSectionSkeleton,
} from './_components';

export const metadata: Metadata = {
  title: 'Admin dashboard',
};

export const runtime = 'nodejs';

export default function AdminPage() {
  return (
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

      <Suspense fallback={<AdminActivitySectionSkeleton />}>
        <AdminActivitySection />
      </Suspense>
    </div>
  );
}
