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
  title: 'Identity',
  description:
    'Manage who you are and how you are represented across public surfaces',
};

export default async function PresencePage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.PRESENCE,
    authFailure: 'notFound',
    requiredFlag: 'PROFILES_WORKSPACE',
    dashboardErrorLogMessage: 'Dashboard data load failed on Identity page',
    dashboardErrorMessage: 'Failed to load Identity. Please refresh the page.',
  });
  if (!routeContext.ok) return routeContext.error;

  const identityId = routeContext.activeIdentityId;
  const scope = {
    actorId: routeContext.userId,
    workspaceId: identityId ?? 'no-identity',
    target: 'creator' as const,
  };
  if (!identityId) return <ProfilesWorkspace data={null} scope={scope} />;

  const data = await loadProfilesWorkspaceData({
    clerkUserId: routeContext.userId,
    databaseUserId: requireAppShellDashboardUserId(
      routeContext,
      APP_ROUTES.PRESENCE
    ),
    profileId: identityId,
  });

  return <ProfilesWorkspace data={data} scope={scope} />;
}
