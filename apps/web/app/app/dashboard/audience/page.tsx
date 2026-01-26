import { redirect } from 'next/navigation';
import type { SearchParams } from 'nuqs/server';
import { DashboardAudienceClient } from '@/components/dashboard/organisms/DashboardAudienceClient';
import { PageErrorState } from '@/components/feedback/PageErrorState';
import { APP_URL } from '@/constants/app';
import { getCachedAuth } from '@/lib/auth/cached';
import { audienceSearchParams } from '@/lib/nuqs';
import {
  trimLeadingSlashes,
  trimTrailingSlashes,
} from '@/lib/utils/string-utils';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { getDashboardData } from '../actions';
import { getAudienceServerData } from './audience-data';

// User-specific page - always render fresh
export const dynamic = 'force-dynamic';

export default async function AudiencePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { userId } = await getCachedAuth();

  // Handle unauthenticated users
  if (!userId) {
    redirect('/signin?redirect_url=/app/dashboard/audience');
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

    const profileUrl =
      artist?.handle && artist.handle.length > 0
        ? `${trimTrailingSlashes(APP_URL)}/${trimLeadingSlashes(artist.handle)}`
        : undefined;

    // Parse search params using nuqs for type-safe URL state
    const parsedParams = await audienceSearchParams.parse(searchParams);

    const audienceData = await getAudienceServerData({
      userId,
      selectedProfileId: artist?.id ?? null,
      searchParams: {
        page: String(parsedParams.page),
        pageSize: String(parsedParams.pageSize),
        sort: parsedParams.sort,
        direction: parsedParams.direction,
      },
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
        profileUrl={profileUrl}
      />
    );
  } catch (error) {
    // Check if this is a Next.js redirect error (which is expected)
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      // Re-throw redirect errors so they work properly
      throw error;
    }

    console.error('Error loading audience data:', error);

    return (
      <PageErrorState message='Failed to load audience data. Please refresh the page.' />
    );
  }
}
