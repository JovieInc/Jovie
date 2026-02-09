import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { InsightsPanel } from '@/components/dashboard/insights/InsightsPanel';
import { PageErrorState } from '@/components/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { logger } from '@/lib/utils/logger';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
import { getDashboardData } from '../actions';

// User-specific page - always render fresh
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function InsightsContent() {
  try {
    const dashboardData = await getDashboardData();

    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
    }

    return <InsightsPanel />;
  } catch (error) {
    throwIfRedirect(error);
    logger.error('[InsightsPage] Failed to load insights', { error });

    return (
      <PageErrorState message='Failed to load insights. Please refresh the page.' />
    );
  }
}

const SKELETON_KEYS = Array.from({ length: 4 }, (_, i) => `insight-${i}`);

function InsightsSkeleton() {
  return (
    <div className='max-w-3xl space-y-6'>
      <div className='flex items-center justify-between'>
        <div className='space-y-1.5'>
          <div className='h-5 w-28 animate-pulse rounded bg-surface-1' />
          <div className='h-3 w-48 animate-pulse rounded bg-surface-1' />
        </div>
        <div className='h-8 w-28 animate-pulse rounded-lg bg-surface-1' />
      </div>
      <div className='flex gap-1.5'>
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={`filter-${i}`}
            className='h-7 w-20 animate-pulse rounded-full bg-surface-1'
          />
        ))}
      </div>
      <div className='space-y-3'>
        {SKELETON_KEYS.map((key) => (
          <div
            key={key}
            className='h-28 animate-pulse rounded-xl border border-subtle bg-surface-1'
          />
        ))}
      </div>
    </div>
  );
}

export default async function InsightsPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/dashboard/insights');
  }

  return (
    <Suspense fallback={<InsightsSkeleton />}>
      <InsightsContent />
    </Suspense>
  );
}
