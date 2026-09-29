// Mock for the release task-instantiation server actions
// (@/app/app/(shell)/dashboard/releases/{catalog-task-actions,task-actions}).
// Both real modules start with 'use server' and touch the DB directly, so
// they cannot run in Storybook's browser Vite build. Real call sites only
// invoke these from a "create release" success handler, never on mount, so
// a deterministic empty-list stub is enough to keep the module graph
// resolvable without misrepresenting real task data.

export async function instantiateReleaseTasksFromCatalog(
  ..._args: unknown[]
): Promise<unknown[]> {
  console.log('[Storybook Mock] instantiateReleaseTasksFromCatalog called');
  return [];
}

export async function instantiateReleaseTasks(
  ..._args: unknown[]
): Promise<unknown[]> {
  console.log('[Storybook Mock] instantiateReleaseTasks called');
  return [];
}
