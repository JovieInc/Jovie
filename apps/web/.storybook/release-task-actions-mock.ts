// Mock for the release task server actions
// (@/app/app/(shell)/dashboard/releases/{catalog-task-actions,task-actions}).
// Both real modules start with 'use server' and touch the DB directly, so
// they cannot run in Storybook's browser Vite build. Both aliases point here,
// so this file must export every name either real module exports; a missing
// name is a SyntaxError at import time that fails the whole story file
// (tests/unit/storybook/release-task-actions-mock.test.ts guards the set).
// Stories seed task data through the react-query cache, so reads resolve to
// deterministic empty results and writes resolve without inventing records.

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

export async function getReleaseTasks(..._args: unknown[]): Promise<unknown[]> {
  return [];
}

export async function updateReleaseTask(
  ..._args: unknown[]
): Promise<{ success: true }> {
  return { success: true };
}

export async function addReleaseTask(..._args: unknown[]): Promise<never> {
  throw new Error('[Storybook Mock] addReleaseTask is not available');
}

export async function deleteReleaseTask(
  ..._args: unknown[]
): Promise<{ success: true }> {
  return { success: true };
}

export async function getReleaseTaskSummary(
  ..._args: unknown[]
): Promise<Map<string, { total: number; done: number }>> {
  return new Map();
}

export async function recomputeTaskDueDates(
  ..._args: unknown[]
): Promise<void> {}

export async function getReleaseSelectionExplanation(
  ..._args: unknown[]
): Promise<{ ctx: null; explanation: [] }> {
  return { ctx: null, explanation: [] };
}

export async function listReleaseSkillClusters(): Promise<unknown[]> {
  return [];
}

export async function listReleaseTaskCatalog(): Promise<unknown[]> {
  return [];
}

export async function addCatalogTaskToRelease(
  ..._args: unknown[]
): Promise<unknown[]> {
  return [];
}
