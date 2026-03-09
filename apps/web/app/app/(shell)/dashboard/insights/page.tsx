import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { InsightsPanel } from '@/components/dashboard/insights/InsightsPanel';
import { PageErrorState } from '@/components/feedback/PageErrorState';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { logger } from '@/lib/utils/logger';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
import { getDashboardData } from '../actions';

// User-specific page - always render fresh
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* -------------------------------------------------------------------------- */
/*  Independent async sections — each in its own Suspense boundary so they    */
/*  stream to the client as they resolve, instead of blocking behind one.     */
/* -------------------------------------------------------------------------- */

/**
 * Lightweight onboarding guard that streams independently.
 *
 * getDashboardData() is request-deduped via React cache() and already
 * pre-fetched by the shell layout, so this resolves near-instantly.
 * Separated into its own boundary so the redirect fires without
 * blocking the content skeleton from being displayed.
 */
async function InsightsOnboardingGuard() {
  try {
    const dashboardData = await getDashboardData();
    if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
      redirect('/onboarding');
    }
  } catch (error) {
    throwIfRedirect(error);
    // Swallow — the layout's ProfileCompletionRedirect is the client-side safety net.
  }
  return null;
}

/**
 * Insights content: header with generate button, category filter pills,
 * and priority-grouped insight cards. The InsightsPanel client component
 * manages its own loading states via TanStack Query, so this section
 * streams the component shell while client-side data fetching runs in
 * parallel.
 */
async function InsightsContentSection() {
  try {
    const dashboardData = await getDashboardData();
    if (dashboardData.needsOnboarding) return null;
    return <InsightsPanel />;
  } catch (error) {
    throwIfRedirect(error);
    logger.error('[InsightsPage] Failed to load insights', { error });
    return (
      <PageErrorState message='Failed to load insights. Please refresh the page.' />
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  Section-specific skeleton fallbacks                                       */
/* -------------------------------------------------------------------------- */

const FILTER_SKELETON_KEYS = Array.from({ length: 5 }, (_, i) => `filter-${i}`);
const SKELETON_KEYS = Array.from({ length: 4 }, (_, i) => `insight-${i}`);

function InsightsHeaderSkeleton() {
  return (
    <div className='flex items-center justify-between'>
      <div className='space-y-1.5'>
        <div className='h-5 w-28 skeleton motion-reduce:animate-none rounded' />
        <div className='h-3 w-48 skeleton motion-reduce:animate-none rounded' />
      </div>
      <div className='h-8 w-28 skeleton motion-reduce:animate-none rounded-lg' />
    </div>
  );
}

function InsightsFiltersSkeleton() {
  return (
    <div className='flex gap-1.5'>
      {FILTER_SKELETON_KEYS.map(key => (
        <div
          key={key}
          className='h-7 w-20 skeleton motion-reduce:animate-none rounded-full'
        />
      ))}
    </div>
  );
}

function InsightsCardsSkeleton() {
  return (
    <div className='space-y-3'>
      {SKELETON_KEYS.map(key => (
        <div
          key={key}
          className='h-28 skeleton motion-reduce:animate-none rounded-xl border border-subtle'
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page — sync shell with independent Suspense streaming boundaries          */
/* -------------------------------------------------------------------------- */

export default async function InsightsPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=/app/insights`);
  }

  return (
    <>
      {/* Guard: invisible, triggers onboarding redirect independently */}
      <Suspense fallback={null}>
        <InsightsOnboardingGuard />
      </Suspense>

      {/* Content: header, filter pills, priority-grouped insight cards.
          The skeleton is split into visual sections so the page layout
          remains stable while streaming. */}
      <Suspense
        fallback={
          <div className='max-w-3xl space-y-6'>
            <InsightsHeaderSkeleton />
            <InsightsFiltersSkeleton />
            <InsightsCardsSkeleton />
          </div>
        }
      >
        <InsightsContentSection />
      </Suspense>
    </>
  );
}
