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
