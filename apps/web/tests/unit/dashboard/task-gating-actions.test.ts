import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { getTasks } from '@/app/app/(shell)/dashboard/tasks/task-actions';

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
});
