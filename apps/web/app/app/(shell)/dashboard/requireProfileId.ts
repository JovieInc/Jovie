'use server';

import { redirect } from 'next/navigation';
import { getDashboardData } from './actions';

export async function requireProfileId(): Promise<string> {
  const data = await getDashboardData();

  if (data.needsOnboarding && !data.dashboardLoadError) {
    redirect('/onboarding');
  }

  if (!data.selectedProfile) {
    redirect('/onboarding');
  }

  return data.selectedProfile.id;
}
