import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { DashboardOverviewSkeleton } from '@/components/dashboard/organisms/DashboardOverviewSkeleton';
import { getCachedAuth } from '@/lib/auth/cached';
import { DashboardOverviewSection } from './dashboard/DashboardOverviewSection';

// User-specific page - always render fresh
export const dynamic = 'force-dynamic';

export default async function AppRootPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/signin?redirect_url=/');
  }

  return (
    <Suspense fallback={<DashboardOverviewSkeleton />}>
      <DashboardOverviewSection />
    </Suspense>
  );
}
