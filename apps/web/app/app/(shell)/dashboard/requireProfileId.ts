'use server';

import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getDashboardData } from './actions';

export async function requireProfileId(): Promise<string> {
  const data = await getDashboardData();

  if (data.needsOnboarding && !data.dashboardLoadError) {
    redirect(APP_ROUTES.START);
  }

  if (!data.selectedProfile) {
    redirect(APP_ROUTES.START);
  }

  return data.selectedProfile.id;
}
