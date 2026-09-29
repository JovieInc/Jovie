import { TasksPageClient } from '@/components/features/dashboard/tasks/TasksPageClient';
import { TasksWorkspaceUpgradeInterstitial } from '@/components/features/dashboard/tasks/TasksUpgradeInterstitial';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { queryKeys } from '@/lib/queries';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState, getQueryClient } from '@/lib/queries/server';
import { isScreenCertAppShellFixtureProfile } from '@/lib/screen-cert/app-shell-fixture-gate';
import { DEFAULT_TASK_WORKSPACE_FILTERS } from '@/lib/tasks/query-defaults';
import { loadAppShellRouteContext } from '../app-shell-route-context';
import { getTasks } from '../dashboard/tasks/task-actions';

export async function TasksRoute() {
  const routeContext = await loadAppShellRouteContext({
    route: APP_ROUTES.TASKS,
    dashboardErrorLogMessage: 'Dashboard data load failed on tasks page',
    dashboardErrorMessage:
      'Failed to load tasks data. Please refresh the page.',
  });
  if (!routeContext.ok) {
    return routeContext.error;
  }

  // Screen-cert fixture (tasks producer, apps/web/app/app/(shell)/dashboard/tasks/_lib/screen-cert-fixture.ts):
  // getCurrentUserEntitlements() degrades to free-tier under the noop DB
  // (billing lookup fails closed), which would otherwise route the reserved
  // fixture profile into the Pro upgrade interstitial instead of the real
  // Tasks UI this producer captures. The reservation is exact-profile-id and
  // fails closed off VERCEL_ENV==='production', so this never widens who
  // skips the real entitlements check.
  const isFixtureRequest = isScreenCertAppShellFixtureProfile(
    routeContext.profileId
  );
  if (!isFixtureRequest) {
    const entitlements = await getCurrentUserEntitlements();
    if (!entitlements.canAccessTasksWorkspace) {
      return <TasksWorkspaceUpgradeInterstitial />;
    }
  }

  const profileId = routeContext.profileId;
  if (profileId) {
    const queryClient = getQueryClient();
    try {
      await queryClient.fetchQuery({
        queryKey: queryKeys.tasks.list(
          profileId,
          DEFAULT_TASK_WORKSPACE_FILTERS
        ),
        queryFn: () => getTasks(DEFAULT_TASK_WORKSPACE_FILTERS),
      });
    } catch (error) {
      void captureError('Tasks prefetch failed on tasks page', error, {
        route: APP_ROUTES.TASKS,
      });
    }
  }

  return (
    <HydrateClient state={getDehydratedState()}>
      <TasksPageClient />
    </HydrateClient>
  );
}
