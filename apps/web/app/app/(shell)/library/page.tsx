import { notFound, redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { captureError } from '@/lib/error-tracking';
import { getAppFlagValue } from '@/lib/flags/server';
import { getDashboardShellData } from '../dashboard/actions';
import { loadReleaseMatrix } from '../dashboard/releases/actions';
import { LibrarySurface } from './LibrarySurface';
import { buildLibraryReleaseAssets } from './library-data';

export const runtime = 'nodejs';

export default async function LibraryPage() {
  const { userId } = await getCachedAuth();
  const libraryEnabled = await getAppFlagValue('SHELL_CHAT_V1', {
    userId,
  });

  if (!userId || !libraryEnabled) {
    notFound();
  }

  const dashboardData = await getDashboardShellData(userId);
  if (dashboardData.dashboardLoadError) {
    await captureError(
      'Dashboard data load failed on library page',
      dashboardData.dashboardLoadError,
      { route: APP_ROUTES.LIBRARY }
    );
    return (
      <PageErrorState message='Failed to load library data. Please refresh the page.' />
    );
  }

  if (dashboardData.needsOnboarding) {
    redirect(APP_ROUTES.ONBOARDING);
  }

  const profileId = dashboardData.selectedProfile?.id;
  const releases = profileId ? await loadReleaseMatrix(profileId) : [];

  return <LibrarySurface assets={buildLibraryReleaseAssets(releases)} />;
}
