import { redirect } from 'next/navigation';
import { TasksPageClient } from '@/components/features/dashboard/tasks/TasksPageClient';
import { TasksWorkspaceUpgradeInterstitial } from '@/components/features/dashboard/tasks/TasksUpgradeInterstitial';
import { APP_ROUTES } from '@/constants/routes';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { captureError } from '@/lib/error-tracking';
import { queryKeys } from '@/lib/queries';
import { HydrateClient } from '@/lib/queries/HydrateClient';
import { getDehydratedState, getQueryClient } from '@/lib/queries/server';
import { DEFAULT_TASK_WORKSPACE_FILTERS } from '@/lib/tasks/query-defaults';
import { getDashboardShellData } from '../dashboard/actions';
import { getTaskBoard, getTasks } from '../dashboard/tasks/task-actions';

export async function TasksRoute() {
  const { userId } = await getCachedAuth();
  if (!userId) {
    const signInParams = new URLSearchParams({
      redirect_url: APP_ROUTES.TASKS,
    });
    redirect(`${APP_ROUTES.SIGNIN}?${signInParams.toString()}`);
  }

  const dashboardData = await getDashboardShellData(userId);
  if (dashboardData.dashboardLoadError) {
    void captureError(
      'Dashboard data load failed on tasks page',
      dashboardData.dashboardLoadError,
      { route: APP_ROUTES.TASKS }
    );
    return (
      <PageErrorState message='Failed to load tasks data. Please refresh the page.' />
    );
  }

  if (dashboardData.needsOnboarding) {
    redirect(APP_ROUTES.START);
  }

  const entitlements = await getCurrentUserEntitlements();
  if (!entitlements.canAccessTasksWorkspace) {
    return <TasksWorkspaceUpgradeInterstitial />;
  }

  const profileId = dashboardData.selectedProfile?.id;
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
