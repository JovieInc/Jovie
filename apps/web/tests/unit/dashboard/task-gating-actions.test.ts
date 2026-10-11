import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRequireReleasePlanGenerationAccess,
  mockRequireTasksWorkspaceAccess,
} = vi.hoisted(() => ({
  mockRequireReleasePlanGenerationAccess: vi.fn(),
  mockRequireTasksWorkspaceAccess: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  asc: vi.fn(),
  count: vi.fn(),
  eq: vi.fn(),
  ilike: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
  max: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/constants/routes', () => ({
  APP_ROUTES: {
    DASHBOARD_TASKS: '/app/dashboard/tasks',
    DASHBOARD_RELEASES: '/app/dashboard/releases',
  },
}));

vi.mock('@/lib/db', () => ({
  db: {},
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: {},
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {},
}));

vi.mock('@/lib/db/schema/tasks', () => ({
  tasks: {},
}));

vi.mock('@/lib/entitlements/tasks-gate', () => ({
  requireReleasePlanGenerationAccess: mockRequireReleasePlanGenerationAccess,
  requireTasksWorkspaceAccess: mockRequireTasksWorkspaceAccess,
}));

vi.mock('@/lib/release-tasks/default-template', () => ({
  DEFAULT_RELEASE_TASK_TEMPLATE: [],
}));

vi.mock('@/app/app/(shell)/dashboard/requireProfileId', () => ({
  requireProfileId: vi.fn(),
}));

import { instantiateReleaseTasks } from '@/app/app/(shell)/dashboard/releases/task-actions';
import { requireProfileId } from '@/app/app/(shell)/dashboard/requireProfileId';
import {
  SCREEN_CERT_TASKS_SELECTED_ID,
  SCREEN_CERT_TASKS_SELECTED_TITLE,
} from '@/app/app/(shell)/dashboard/tasks/_lib/screen-cert-fixture';
import {
  getTask,
  getTasks,
} from '@/app/app/(shell)/dashboard/tasks/task-actions';
import { SCREEN_CERT_APP_SHELL_PROFILE_ID } from '@/lib/screen-cert/app-shell-fixture-gate';

describe('task action gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks global task actions when the workspace is locked', async () => {
    mockRequireTasksWorkspaceAccess.mockRejectedValueOnce({
      code: 'TASKS_WORKSPACE_LOCKED',
      message: 'Tasks requires a Pro plan.',
    });

    await expect(getTasks()).rejects.toMatchObject({
      code: 'TASKS_WORKSPACE_LOCKED',
    });
  });

  it('blocks release plan generation when the plan is locked', async () => {
    mockRequireReleasePlanGenerationAccess.mockRejectedValueOnce({
      code: 'RELEASE_PLAN_LOCKED',
      message: 'Release plans require a Pro plan.',
    });

    await expect(instantiateReleaseTasks('release_1')).rejects.toMatchObject({
      code: 'RELEASE_PLAN_LOCKED',
    });
  });

  describe('screen-cert fixture gate', () => {
    const originalNoauthSmoke = process.env.PUBLIC_NOAUTH_SMOKE;
    const originalVercelEnv = process.env.VERCEL_ENV;

    beforeEach(() => {
      // isRenderFixtureEnabled() (render-fixture-policy.ts) admits on this
      // flag and fails closed on VERCEL_ENV==='production' — set both
      // explicitly rather than relying on the vitest default environment.
      process.env.PUBLIC_NOAUTH_SMOKE = '1';
      delete process.env.VERCEL_ENV;
    });

    afterEach(() => {
      if (originalNoauthSmoke === undefined) {
        delete process.env.PUBLIC_NOAUTH_SMOKE;
      } else {
        process.env.PUBLIC_NOAUTH_SMOKE = originalNoauthSmoke;
      }
      if (originalVercelEnv === undefined) {
        delete process.env.VERCEL_ENV;
      } else {
        process.env.VERCEL_ENV = originalVercelEnv;
      }
    });

    it('serves the fixture list for the reserved profile without checking workspace access', async () => {
      vi.mocked(requireProfileId).mockResolvedValueOnce(
        SCREEN_CERT_APP_SHELL_PROFILE_ID
      );

      const result = await getTasks();

      expect(
        result.tasks.some(task => task.id === SCREEN_CERT_TASKS_SELECTED_ID)
      ).toBe(true);
      expect(mockRequireTasksWorkspaceAccess).not.toHaveBeenCalled();
    });

    it('never serves the fixture for a real profile id', async () => {
      vi.mocked(requireProfileId).mockResolvedValueOnce('real-profile-id');
      mockRequireTasksWorkspaceAccess.mockRejectedValueOnce({
        code: 'TASKS_WORKSPACE_LOCKED',
      });

      await expect(getTasks()).rejects.toMatchObject({
        code: 'TASKS_WORKSPACE_LOCKED',
      });
    });

    it('never serves the fixture off the render-fixture flag, even for the reserved profile', async () => {
      delete process.env.PUBLIC_NOAUTH_SMOKE;
      vi.mocked(requireProfileId).mockResolvedValueOnce(
        SCREEN_CERT_APP_SHELL_PROFILE_ID
      );
      mockRequireTasksWorkspaceAccess.mockRejectedValueOnce({
        code: 'TASKS_WORKSPACE_LOCKED',
      });

      await expect(getTasks()).rejects.toMatchObject({
        code: 'TASKS_WORKSPACE_LOCKED',
      });
    });

    it('serves the exact fixture task by id for the reserved profile', async () => {
      vi.mocked(requireProfileId).mockResolvedValueOnce(
        SCREEN_CERT_APP_SHELL_PROFILE_ID
      );

      const task = await getTask(SCREEN_CERT_TASKS_SELECTED_ID);

      expect(task.title).toBe(SCREEN_CERT_TASKS_SELECTED_TITLE);
    });

    it('rejects an unknown task id for the reserved profile instead of falling through to the database', async () => {
      vi.mocked(requireProfileId).mockResolvedValueOnce(
        SCREEN_CERT_APP_SHELL_PROFILE_ID
      );

      await expect(getTask('not-a-fixture-task')).rejects.toThrow(
        'Task not found or access denied'
      );
    });
  });
});
