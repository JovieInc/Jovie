import * as Sentry from '@sentry/nextjs';
import { redirect } from 'next/navigation';

import { DashboardSettings } from '@/components/dashboard/DashboardSettings';
import { getCachedAuth } from '@/lib/auth/cached';
import { getDashboardData } from '../dashboard/actions';

export const runtime = 'nodejs';

export default async function SettingsPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/settings');
  }

  try {
    const dashboardData = await getDashboardData();

    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
    }

    return <DashboardSettings focusSection='account' />;
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      throw error;
    }

    Sentry.captureException(error);

    return (
      <div className='flex items-center justify-center'>
        <div className='w-full max-w-lg rounded-xl border border-subtle bg-surface-1 p-6 text-center shadow-sm'>
          <h1 className='mb-3 text-2xl font-semibold text-primary-token'>
            Something went wrong
          </h1>
          <p className='mb-4 text-secondary-token'>
            Failed to load settings data. Please refresh the page.
          </p>
        </div>
      </div>
    );
  }
}
