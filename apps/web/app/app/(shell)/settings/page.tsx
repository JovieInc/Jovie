import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { DashboardSettings } from '@/features/dashboard/DashboardSettings';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { getDashboardData } from '../dashboard/actions';

export const runtime = 'nodejs';

export default async function SettingsPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(`${APP_ROUTES.SIGNIN}?redirect_url=/app/settings`);
  }

  try {
    const dashboardData = await getDashboardData();

    if (dashboardData.needsOnboarding && !dashboardData.dashboardLoadError) {
      redirect('/onboarding');
    }

    return <DashboardSettings />;
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      throw error;
    }

    Sentry.captureException(error);

    return (
      <PageErrorState message='Failed to load settings data. Please refresh the page.' />
    );
  }
}
