import { TasksPageClient } from '@/components/features/dashboard/tasks/TasksPageClient';
import { TasksWorkspaceUpgradeInterstitial } from '@/components/features/dashboard/tasks/TasksUpgradeInterstitial';
import { APP_ROUTES } from '@/constants/routes';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { queryKeys } from '@/lib/queries';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState, getQueryClient } from '@/lib/queries/server';
import { DEFAULT_TASK_WORKSPACE_FILTERS } from '@/lib/tasks/query-defaults';
import { loadAppShellRouteContext } from '../app-shell-route-context';
import { getTaskBoard, getTasks } from '../dashboard/tasks/task-actions';

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

  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.canAccessTasksWorkspace) {
    return <TasksWorkspaceUpgradeInterstitial />;
  }

  const profileId = routeContext.profileId;
  if (profileId) {
    const queryClient = getQueryClient();
    try {
      await Promise.all([
        queryClient.fetchQuery({
          queryKey: queryKeys.tasks.list(
            profileId,
            DEFAULT_TASK_WORKSPACE_FILTERS
          ),
          queryFn: () => getTasks(DEFAULT_TASK_WORKSPACE_FILTERS),
        }),
        queryClient.fetchQuery({
          queryKey: queryKeys.tasks.board(
            profileId,
            DEFAULT_TASK_WORKSPACE_FILTERS
          ),
          queryFn: () => getTaskBoard(DEFAULT_TASK_WORKSPACE_FILTERS),
        }),
      ]);
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
