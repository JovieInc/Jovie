import type { Metadata } from 'next';
import {
  PAGE_TOOLBAR_META_TEXT_CLASS,
  PageToolbar,
} from '@/components/organisms/table';
import { WorkspacePage } from '@/components/organisms/WorkspacePage';
import { APP_ROUTES } from '@/constants/routes';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { loadAppShellRouteContext } from '../app-shell-route-context';
import { LinksPageClient } from './LinksPageClient';
import { loadLinksWorkspaceData } from './links-data';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Links | Jovie',
  description:
    'Jovie finds your stuff, creates trackable links, and measures what happens when they are shared.',
};

export default async function LinksPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.LINKS,
    dashboardErrorLogMessage: 'Dashboard data load failed on links page',
    dashboardErrorMessage: 'Failed to load links. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  const selectedProfile = routeContext.dashboardData.selectedProfile;
  const profileId = routeContext.profileId;
  if (!profileId || !selectedProfile) {
    return <PageErrorState message='Select a profile to see your links.' />;
  }

  const { rows, loadFailed } = await loadLinksWorkspaceData({
    profileId,
    profileHandle:
      selectedProfile.usernameNormalized ?? selectedProfile.username,
    profileTitle:
      selectedProfile.displayName?.trim() || selectedProfile.username,
    releaseProfileContext: {
      userId: routeContext.userId,
      profileId,
      profileHandle:
        selectedProfile.usernameNormalized ?? selectedProfile.username,
      spotifyId: selectedProfile.spotifyId ?? null,
      appleMusicId: selectedProfile.appleMusicId ?? null,
      settings: selectedProfile.settings ?? null,
    },
    route: APP_ROUTES.LINKS,
  });

  return (
    <WorkspacePage
      frame='none'
      contentPadding='none'
      data-testid='links-page'
      toolbar={
        <PageToolbar
          className='border-b border-subtle'
          start={
            <span className={PAGE_TOOLBAR_META_TEXT_CLASS}>
              {rows.length} {rows.length === 1 ? 'link' : 'links'}
              {loadFailed ? ' · some links could not be loaded' : ''}
            </span>
          }
        />
      }
    >
      <LinksPageClient rows={rows} />
    </WorkspacePage>
  );
}
