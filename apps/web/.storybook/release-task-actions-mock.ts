// Mock for release task server actions (task-actions.ts and
// catalog-task-actions.ts). The real modules pull in the DB and
// @anthropic-ai/sdk (via lib/release-tasks/classify-task-cluster), which is
// Node-only and breaks the browser preview bundle.

export const instantiateReleaseTasks = async (..._args: unknown[]) =>
  Promise.resolve([]);

export const instantiateReleaseTasksFromCatalog = async (..._args: unknown[]) =>
  Promise.resolve([]);

export const getReleaseTasks = async (..._args: unknown[]) =>
  Promise.resolve([]);

export const getReleaseTaskSummary = async (..._args: unknown[]) =>
  Promise.resolve(null);

export const addReleaseTask = async (..._args: unknown[]) => Promise.resolve();

export const updateReleaseTask = async (..._args: unknown[]) =>
  Promise.resolve();

export const deleteReleaseTask = async (..._args: unknown[]) =>
  Promise.resolve();

export const addCatalogTaskToRelease = async (..._args: unknown[]) =>
  Promise.resolve();

export const listReleaseTaskCatalog = async (..._args: unknown[]) =>
  Promise.resolve([]);

export const listReleaseSkillClusters = async (..._args: unknown[]) =>
  Promise.resolve([]);

export default {
  instantiateReleaseTasks,
  instantiateReleaseTasksFromCatalog,
  getReleaseTasks,
  getReleaseTaskSummary,
  addReleaseTask,
  updateReleaseTask,
  deleteReleaseTask,
  addCatalogTaskToRelease,
  listReleaseTaskCatalog,
  listReleaseSkillClusters,
};
