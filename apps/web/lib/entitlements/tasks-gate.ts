import 'server-only';

import { getCurrentUserEntitlements } from './server';

export type TasksUpgradeRequiredCode =
  | 'TASKS_WORKSPACE_LOCKED'
  | 'RELEASE_PLAN_LOCKED';

export class TasksUpgradeRequiredError extends Error {
  readonly code: TasksUpgradeRequiredCode;

  constructor(code: TasksUpgradeRequiredCode, message: string) {
    super(message);
    this.name = 'TasksUpgradeRequiredError';
    this.code = code;
  }
}

export async function canAccessTasksWorkspace(): Promise<boolean> {
  const entitlements = await getCurrentUserEntitlements();
  return entitlements.canAccessTasksWorkspace;
}

export async function canGenerateReleasePlans(): Promise<boolean> {
  const entitlements = await getCurrentUserEntitlements();
  return entitlements.canGenerateReleasePlans;
}

export async function requireTasksWorkspaceAccess(): Promise<void> {
  if (await canAccessTasksWorkspace()) {
    return;
  }

  throw new TasksUpgradeRequiredError(
    'TASKS_WORKSPACE_LOCKED',
    'Tasks requires a Pro plan.'
  );
}

export async function requireReleasePlanGenerationAccess(): Promise<void> {
  if (await canGenerateReleasePlans()) {
    return;
  }

  throw new TasksUpgradeRequiredError(
    'RELEASE_PLAN_LOCKED',
    'Release plans require a Pro plan.'
  );
}
