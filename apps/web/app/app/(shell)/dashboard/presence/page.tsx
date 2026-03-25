import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { DspPresenceView } from '@/features/dashboard/organisms/dsp-presence/DspPresenceView';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
import { getDashboardData } from '../actions';
import { loadDspPresence } from './actions';
import PresenceLoading from './loading';

export const runtime = 'nodejs';

async function PresenceContent() {
  try {
    const dashboardData = await getDashboardData();

    if (dashboardData.dashboardLoadError) {
      void captureError(
        'Dashboard data load failed on presence page',
        dashboardData.dashboardLoadError,
        {
          route: APP_ROUTES.PRESENCE,
        }
      );
      return (
        <PageErrorState message='Failed to load presence data. Please refresh the page.' />
      );
    }

    if (dashboardData.needsOnboarding) {
      redirect(APP_ROUTES.ONBOARDING);
    }

    let presenceData: Awaited<ReturnType<typeof loadDspPresence>> = {
      items: [],
      confirmedCount: 0,
      suggestedCount: 0,
    };

    try {
      presenceData = await loadDspPresence();
    } catch (error) {
      throwIfRedirect(error);
      void captureError('loadDspPresence failed', error, {
        route: APP_ROUTES.PRESENCE,
      });
    }

    return <DspPresenceView data={presenceData} />;
  } catch (error) {
    throwIfRedirect(error);
    void captureError('Presence page failed', error, {
      route: APP_ROUTES.PRESENCE,
    });
    return (
      <PageErrorState message='Failed to load presence data. Please refresh the page.' />
    );
  }
}

export default async function PresencePage() {
  const { userId } = await getCachedAuth();
  if (!userId) {
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.PRESENCE}`);
  }

  return (
    <Suspense fallback={<PresenceLoading />}>
      <PresenceContent />
    </Suspense>
  );
}
