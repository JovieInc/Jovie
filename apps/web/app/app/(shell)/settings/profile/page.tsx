import { redirect } from 'next/navigation';

import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { getDashboardData } from '../../dashboard/actions';

export const runtime = 'nodejs';

export default async function SettingsProfilePage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=/app/settings/profile`);
  }

  const dashboardData = await getDashboardData();
  if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
    redirect('/onboarding');
  }

  redirect(APP_ROUTES.SETTINGS_ARTIST_PROFILE);
}
