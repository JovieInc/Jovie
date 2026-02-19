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

const SKELETON_STAT_KEYS = Array.from({ length: 3 }, (_, i) => `stat-${i}`);
const SKELETON_LIST_KEYS = Array.from({ length: 3 }, (_, i) => `list-${i}`);

function AnalyticsSkeleton() {
  return (
    <div className='max-w-5xl space-y-8'>
      <div className='flex items-center justify-between'>
        <div className='h-4 w-24 skeleton motion-reduce:animate-none rounded' />
        <div className='h-8 w-32 skeleton motion-reduce:animate-none rounded-full' />
      </div>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
        {SKELETON_STAT_KEYS.map(key => (
          <div
            key={key}
            className='h-24 skeleton motion-reduce:animate-none rounded-xl border border-subtle'
          />
        ))}
      </div>
      <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
        {SKELETON_LIST_KEYS.map(key => (
          <div
            key={key}
            className='h-56 skeleton motion-reduce:animate-none rounded-xl border border-subtle'
          />
        ))}
      </div>
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
