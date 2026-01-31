import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { DashboardAnalytics } from '@/components/dashboard/dashboard-analytics';
import { PageErrorState } from '@/components/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { logger } from '@/lib/utils/logger';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
import { getDashboardData } from '../actions';

// User-specific page - always render fresh
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function AnalyticsContent() {
  try {
    // Fetch dashboard data server-side
    const dashboardData = await getDashboardData();

    // Handle redirects for users who need onboarding
    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
    }

    // Render analytics dashboard
    return <DashboardAnalytics />;
  } catch (error) {
    throwIfRedirect(error);
    logger.error('[AnalyticsPage] Failed to load analytics', { error });

    return (
      <PageErrorState message='Failed to load analytics. Please refresh the page.' />
    );
  }
}

const SKELETON_CARDS = Array.from(
  { length: 6 },
  (_, i) => `skeleton-card-${i}`
);

function AnalyticsSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='h-8 w-48 animate-pulse rounded bg-surface-1' />
      <div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
        {SKELETON_CARDS.map(key => (
          <div
            key={key}
            className='h-32 animate-pulse rounded-lg bg-surface-1'
          />
        ))}
      </div>
      <div className='h-96 animate-pulse rounded-lg bg-surface-1' />
    </div>
  );
}

export default async function AnalyticsPage() {
  const { userId } = await getCachedAuth();

  // Handle unauthenticated users
  if (!userId) {
    redirect('/sign-in?redirect_url=/app/dashboard/analytics');
  }

  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <AnalyticsContent />
    </Suspense>
  );
}
