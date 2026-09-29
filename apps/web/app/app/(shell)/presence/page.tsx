import type { Metadata } from 'next';
import { APP_ROUTES } from '@/constants/routes';
import {
  loadAppShellRouteContext,
  requireAppShellDashboardUserId,
} from '../app-shell-route-context';
import { loadProfilesWorkspaceData } from '../profiles/data';
import { ProfilesWorkspace } from '../profiles/ProfilesWorkspace';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Presence',
  description:
    'Monitor your public profiles, social networks, and presence signals',
};

export default async function PresencePage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.PRESENCE,
    authFailure: 'notFound',
    requiredFlag: 'PROFILES_WORKSPACE',
    dashboardErrorLogMessage: 'Dashboard data load failed on Presence page',
    dashboardErrorMessage: 'Failed to load Presence. Please refresh the page.',
  });
  if (!routeContext.ok) return routeContext.error;

  const identityId = routeContext.activeIdentityId;
  if (!identityId) return <ProfilesWorkspace data={null} />;

  const data = await loadProfilesWorkspaceData({
    clerkUserId: routeContext.userId,
    databaseUserId: requireAppShellDashboardUserId(
      routeContext,
      APP_ROUTES.PRESENCE
    ),
    profileId: identityId,
  });

  return <ProfilesWorkspace data={data} />;
}
