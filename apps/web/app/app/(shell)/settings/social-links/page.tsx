import { redirect } from 'next/navigation';

import { DashboardSettings } from '@/components/dashboard/DashboardSettings';
import { getCachedAuth } from '@/lib/auth/cached';
import { queryKeys } from '@/lib/queries/keys';
import { getQueryClient } from '@/lib/queries/server';
import {
  getDashboardData,
  getProfileSocialLinks,
} from '../../dashboard/actions';

export const runtime = 'nodejs';

export default async function SettingsSocialLinksPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/settings/social-links');
  }

  const dashboardData = await getDashboardData();
  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  // Prefetch social links so the client component gets an instant cache hit.
  // Map to DashboardSocialLink shape (id/platform/url) to match the client hook.
  const profileId = dashboardData.selectedProfile?.id;
  if (profileId) {
    const queryClient = getQueryClient();
    await queryClient.prefetchQuery({
      queryKey: queryKeys.dashboard.socialLinks(profileId),
      queryFn: async () => {
        const links = await getProfileSocialLinks(profileId);
        return links.map(l => ({ id: l.id, platform: l.platform, url: l.url }));
      },
    });
  }

  return <DashboardSettings focusSection='social-links' />;
}
