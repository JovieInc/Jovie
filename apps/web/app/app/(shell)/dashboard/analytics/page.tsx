import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { DashboardAnalytics } from '@/components/dashboard/dashboard-analytics';
import { PageErrorState } from '@/components/feedback/PageErrorState';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
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
async function AnalyticsOnboardingGuard() {
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
 * Analytics dashboard content: header with range controls, stat cards,
 * secondary metrics, and ranked lists. The DashboardAnalytics client
 * component manages its own loading states via TanStack Query, so this
 * section streams the component shell while client-side data fetching
 * runs in parallel.
 */
async function AnalyticsContentSection() {
  try {
    const dashboardData = await getDashboardData();
    if (dashboardData.needsOnboarding) return null;
    return <DashboardAnalytics />;
  } catch (error) {
    throwIfRedirect(error);
    logger.error('[AnalyticsPage] Failed to load analytics', { error });
    return (
      <PageErrorState message='Failed to load analytics. Please refresh the page.' />
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  Section-specific skeleton fallbacks                                       */
/* -------------------------------------------------------------------------- */

const SKELETON_STAT_KEYS = Array.from({ length: 3 }, (_, i) => `stat-${i}`);
const SKELETON_LIST_KEYS = Array.from({ length: 3 }, (_, i) => `list-${i}`);

function AnalyticsStatsSkeleton() {
  return (
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
      {SKELETON_STAT_KEYS.map(key => (
        <ContentSurfaceCard
          key={key}
          className='h-24 skeleton motion-reduce:animate-none'
        />
      ))}
    </div>
  );
}

function AnalyticsListsSkeleton() {
  return (
    <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
      {SKELETON_LIST_KEYS.map(key => (
        <ContentSurfaceCard
          key={key}
          className='h-56 skeleton motion-reduce:animate-none'
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page — sync shell with independent Suspense streaming boundaries          */
/* -------------------------------------------------------------------------- */

export default async function AnalyticsPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(
      `${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.DASHBOARD_ANALYTICS}`
    );
  }

  return (
    <>
      {/* Guard: invisible, triggers onboarding redirect independently */}
      <Suspense fallback={null}>
        <AnalyticsOnboardingGuard />
      </Suspense>

      {/* Content: header, stat cards, secondary metrics, ranked lists.
          The skeleton is split into visual sections so the page layout
          remains stable while streaming.  */}
      <Suspense
        fallback={
          <div className='max-w-5xl space-y-6'>
            <ContentSectionHeaderSkeleton
              titleWidth='w-24'
              descriptionWidth='w-32'
              actionWidths={['w-8', 'w-32']}
              actionsClassName='gap-2'
            />
            <div className='space-y-6'>
              <AnalyticsStatsSkeleton />
              <AnalyticsListsSkeleton />
            </div>
          </div>
        }
      >
        <AnalyticsContentSection />
      </Suspense>
    </>
  );
}
