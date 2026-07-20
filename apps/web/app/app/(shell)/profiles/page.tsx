import { APP_ROUTES } from '@/constants/routes';
import {
  loadAppShellRouteContext,
  requireAppShellDashboardUserId,
} from '../app-shell-route-context';
import { loadProfilesWorkspaceData } from './data';
import { ProfilesWorkspace } from './ProfilesWorkspace';

export const runtime = 'nodejs';

export default async function ProfilesPage() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.PROFILES,
    authFailure: 'notFound',
    requiredFlag: 'PROFILES_WORKSPACE',
    dashboardErrorLogMessage: 'Dashboard data load failed on profiles page',
    dashboardErrorMessage: 'Failed to load profiles. Please refresh the page.',
  });
  if (!routeContext.ok) return routeContext.error;

  const profileId = routeContext.profileId;
  if (!profileId) return <ProfilesWorkspace data={null} />;

  const data = await loadProfilesWorkspaceData({
    clerkUserId: routeContext.userId,
    databaseUserId: requireAppShellDashboardUserId(
      routeContext,
      APP_ROUTES.PROFILES
    ),
    profileId,
  });

  return <ProfilesWorkspace data={data} />;
}
