import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { InsightsPanel } from '@/features/dashboard/insights/InsightsPanel';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
import { getDashboardDataEssential } from '../actions';

export const runtime = 'nodejs';

/* -------------------------------------------------------------------------- */
/*  Independent async sections — each in its own Suspense boundary so they    */
/*  stream to the client as they resolve, instead of blocking behind one.     */
/* -------------------------------------------------------------------------- */

/**
 * Lightweight onboarding guard that streams independently.
 *
 * getDashboardDataEssential() is request-deduped via React cache() and already
 * pre-fetched by the shell layout, so this resolves near-instantly.
 * Separated into its own boundary so the redirect fires without
 * blocking the content skeleton from being displayed.
 */
async function InsightsOnboardingGuard() {
  try {
    const dashboardData = await getDashboardDataEssential();
    if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
      redirect(APP_ROUTES.ONBOARDING);
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
    const dashboardData = await getDashboardDataEssential();

    if (dashboardData.dashboardLoadError) {
      void captureError(
        'Dashboard data load failed on insights page',
        dashboardData.dashboardLoadError,
        { route: APP_ROUTES.INSIGHTS }
      );
      return (
        <PageErrorState message='Failed to load insights. Please refresh the page.' />
      );
    }

    if (dashboardData.needsOnboarding) return null;
    return <InsightsPanel />;
  } catch (error) {
    throwIfRedirect(error);
    void captureError('Insights page failed', error, {
      route: APP_ROUTES.INSIGHTS,
    });
    return (
      <PageErrorState message='Failed to load insights. Please refresh the page.' />
    );
  }
}

export default async function InsightsPage() {
  const { userId } = await getCachedAuth();
  if (!userId) {
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.INSIGHTS}`);
  }

  return (
    <>
      <Suspense fallback={null}>
        <InsightsOnboardingGuard />
      </Suspense>
      <InsightsContentSection />
    </>
  );
}
