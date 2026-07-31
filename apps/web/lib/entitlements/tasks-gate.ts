import 'server-only';

import { logEntitlementDenial } from './demand-signal';
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

function throwTasksUpgradeRequired(
  code: TasksUpgradeRequiredCode,
  message: string,
  gate: 'canAccessTasksWorkspace' | 'canGenerateReleasePlans'
): never {
  // Demand signal for server-action callers (chat panel, mutations).
  // Chat tools already log via locked stubs / fail-soft boundary.
  logEntitlementDenial({
    gate,
    source: 'server-action',
    code,
    planRequired: 'Pro',
    message,
  });

  throw new TasksUpgradeRequiredError(code, message);
}

export async function requireTasksWorkspaceAccess(): Promise<void> {
  if (await canAccessTasksWorkspace()) {
    return;
  }

  throwTasksUpgradeRequired(
    'TASKS_WORKSPACE_LOCKED',
    'Tasks requires a Pro plan.',
    'canAccessTasksWorkspace'
  );
}

export async function requireReleasePlanGenerationAccess(): Promise<void> {
  if (await canGenerateReleasePlans()) {
    return;
  }

  throwTasksUpgradeRequired(
    'RELEASE_PLAN_LOCKED',
    'Release plans require a Pro plan.',
    'canGenerateReleasePlans'
  );
}
