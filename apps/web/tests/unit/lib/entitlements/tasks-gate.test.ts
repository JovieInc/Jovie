import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

describe('tasks entitlement gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads task workspace access from current user entitlements', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue({
      canAccessTasksWorkspace: true,
      canGenerateReleasePlans: false,
    });

    const { canAccessTasksWorkspace, canGenerateReleasePlans } = await import(
      '@/lib/entitlements/tasks-gate'
    );

    await expect(canAccessTasksWorkspace()).resolves.toBe(true);
    await expect(canGenerateReleasePlans()).resolves.toBe(false);
  });

  it('allows paid users through task workspace guards', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue({
      canAccessTasksWorkspace: true,
      canGenerateReleasePlans: true,
    });

    const { requireReleasePlanGenerationAccess, requireTasksWorkspaceAccess } =
      await import('@/lib/entitlements/tasks-gate');

    await expect(requireTasksWorkspaceAccess()).resolves.toBeUndefined();
    await expect(requireReleasePlanGenerationAccess()).resolves.toBeUndefined();
  });

  it('throws typed upgrade errors for locked task capabilities', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue({
      canAccessTasksWorkspace: false,
      canGenerateReleasePlans: false,
    });

    const {
      requireReleasePlanGenerationAccess,
      requireTasksWorkspaceAccess,
      TasksUpgradeRequiredError,
    } = await import('@/lib/entitlements/tasks-gate');

    await expect(requireTasksWorkspaceAccess()).rejects.toMatchObject({
      name: 'TasksUpgradeRequiredError',
      code: 'TASKS_WORKSPACE_LOCKED',
      message: 'Tasks requires a Pro plan.',
    });
    await expect(requireReleasePlanGenerationAccess()).rejects.toMatchObject({
      name: 'TasksUpgradeRequiredError',
      code: 'RELEASE_PLAN_LOCKED',
      message: 'Release plans require a Pro plan.',
    });

    await expect(requireTasksWorkspaceAccess()).rejects.toBeInstanceOf(
      TasksUpgradeRequiredError
    );
  });
});
