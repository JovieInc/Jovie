import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { DspPresenceView } from '@/features/dashboard/organisms/dsp-presence/DspPresenceView';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { captureError } from '@/lib/error-tracking';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
import { getDashboardData } from '../actions';
import { loadDspPresence } from './actions';

export const runtime = 'nodejs';

export default async function PresencePage() {
  const dashboardData = await getDashboardData();

  // If data load failed, show error state (don't redirect — user IS authenticated)
  if (dashboardData.dashboardLoadError) {
    void captureError(
      'Dashboard data load failed on presence page',
      new Error('dashboardLoadError'),
      {
        route: APP_ROUTES.PRESENCE,
      }
    );
    return (
      <PageErrorState message='Failed to load presence data. Please refresh the page.' />
    );
  }

  if (!dashboardData.user?.id) {
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.PRESENCE}`);
  }

  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
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
}
