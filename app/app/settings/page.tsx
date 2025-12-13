import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getDashboardDataCached } from '../dashboard/actions';

export default async function SettingsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/settings');
  }

  try {
    const dashboardData = await getDashboardDataCached();

    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
    }

    redirect('/app/settings/account');
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      throw error;
    }

    console.error('Error loading settings:', error);

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
