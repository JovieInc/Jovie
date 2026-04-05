import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { DspPresenceView } from '@/features/dashboard/organisms/dsp-presence/DspPresenceView';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { throwIfRedirect } from '@/lib/utils/redirect-error';
import { getDashboardShellData } from '../actions';
import {
  getUnresolvedMismatchCount,
  loadDspPresenceForProfile,
} from './actions';
import PresenceLoading from './loading';

export const runtime = 'nodejs';

export default async function PresencePage() {
  const { userId } = await getCachedAuth();
  if (!userId) {
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=${APP_ROUTES.PRESENCE}`);
  }

  return (
    <Suspense fallback={<PresenceLoading />}>
      <PresenceContent userId={userId} />
    </Suspense>
  );
}

async function PresenceContent({ userId }: Readonly<{ userId: string }>) {
  try {
    const dashboardData = await getDashboardShellData(userId);
    if (dashboardData.dashboardLoadError) {
      void captureError(
        'Dashboard data load failed on presence page',
        dashboardData.dashboardLoadError,
        { route: APP_ROUTES.PRESENCE }
      );
      return (
        <PageErrorState message='Failed to load presence data. Please refresh the page.' />
      );
    }

    if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
      redirect(APP_ROUTES.ONBOARDING);
    }

    const selectedProfile = dashboardData.selectedProfile;
    if (!selectedProfile) {
      redirect(APP_ROUTES.ONBOARDING);
    }

    const [presenceResult, unresolvedCountResult] = await Promise.allSettled([
      loadDspPresenceForProfile(selectedProfile.id),
      getUnresolvedMismatchCount(selectedProfile.id),
    ]);

    if (presenceResult.status !== 'fulfilled') {
      throw presenceResult.reason;
    }

    const unresolvedCount =
      unresolvedCountResult.status === 'fulfilled'
        ? unresolvedCountResult.value
        : 0;

    if (unresolvedCountResult.status === 'rejected') {
      void captureError(
        'Presence unresolved mismatch count failed',
        unresolvedCountResult.reason,
        { route: APP_ROUTES.PRESENCE, profileId: selectedProfile.id }
      );
    }

    return (
      <DspPresenceView
        data={presenceResult.value}
        hasUnresolvedMismatches={unresolvedCount > 0}
      />
    );
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
