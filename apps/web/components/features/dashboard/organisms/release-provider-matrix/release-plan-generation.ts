import { instantiateReleaseTasksFromCatalog } from '@/app/app/(shell)/dashboard/releases/catalog-task-actions';
import { instantiateReleaseTasks } from '@/app/app/(shell)/dashboard/releases/task-actions';
import { APP_ROUTES } from '@/constants/routes';
import type { ReleaseContext } from '@/lib/release-tasks/applicability';

export async function generateReleasePlanTasks(
  releaseId: string,
  context?: ReleaseContext
): Promise<string> {
  if (context) {
    await instantiateReleaseTasksFromCatalog(releaseId, context);
  } else {
    await instantiateReleaseTasks(releaseId);
  }

  return APP_ROUTES.DASHBOARD_RELEASE_TASKS.replace('[releaseId]', releaseId);
}
