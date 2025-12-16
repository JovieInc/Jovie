import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { DashboardAudienceClient } from '@/components/dashboard/organisms/DashboardAudienceClient';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { getDashboardData } from '../actions';
import {
  getAudienceServerData,
  getAudienceUrlSearchParams,
} from './audience-data';

export default async function AudiencePage({
  searchParams = {},
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { userId } = await auth();

  // Handle unauthenticated users
  if (!userId) {
    redirect('/sign-in?redirect_url=/app/dashboard/audience');
  }

  try {
    // Fetch dashboard data server-side
    const dashboardData = await getDashboardData();

    // Handle redirects for users who need onboarding
    if (dashboardData.needsOnboarding) {
      redirect('/onboarding');
    }

    const artist = dashboardData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
      : null;

    const getOne = (key: string): string | undefined => {
      const value = searchParams[key];
      if (Array.isArray(value)) return value[0];
      return value;
    };

    const rlsBypassEnabled =
      process.env.NODE_ENV !== 'production' &&
      process.env.ALLOW_AUDIENCE_RLS_BYPASS === '1' &&
      getOne('rlsBypass') === '1';

    const modeOverride = (() => {
      if (process.env.NODE_ENV === 'production') return undefined;
      const raw = getOne('audienceMode');
      if (raw === 'members' || raw === 'subscribers') return raw;
      return undefined;
    })();

    const audienceData = await getAudienceServerData({
      userId,
      selectedProfileId: artist?.id ?? null,
      searchParams: getAudienceUrlSearchParams(searchParams),
      rlsBypass: rlsBypassEnabled,
      modeOverride,
    });

    return (
      <DashboardAudienceClient
        mode={audienceData.mode}
        initialRows={audienceData.rows}
        total={audienceData.total}
        page={audienceData.page}
        pageSize={audienceData.pageSize}
        sort={audienceData.sort}
        direction={audienceData.direction}
      />
    );
  } catch (error) {
    // Check if this is a Next.js redirect error (which is expected)
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      // Re-throw redirect errors so they work properly
      throw error;
    }

    console.error('Error loading audience data:', error);

    // On actual error, show a simple error message
    return (
      <div className='flex items-center justify-center'>
        <div className='w-full max-w-lg rounded-xl border border-subtle bg-surface-1 p-6 text-center shadow-sm'>
          <h1 className='mb-3 text-2xl font-semibold text-primary-token'>
            Something went wrong
          </h1>
          <p className='mb-4 text-secondary-token'>
            Failed to load audience data. Please refresh the page.
          </p>
        </div>
      </div>
    );
  }
}
