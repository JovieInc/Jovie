import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queries/keys';
import { prefetchForRoute } from '@/lib/queries/prefetch-dashboard';
import { DEFAULT_TASK_WORKSPACE_FILTERS } from '@/lib/tasks/query-defaults';

const mocks = vi.hoisted(() => ({
  getTasks: vi.fn(async () => ({ nextCursor: null, tasks: [] })),
  loadReleaseMatrix: vi.fn(async (profileId: string) => [
    { id: `release-${profileId}` },
  ]),
}));

vi.mock('@/lib/releases/release-matrix-loader', () => ({
  loadReleaseMatrix: mocks.loadReleaseMatrix,
}));

vi.mock('@/app/app/(shell)/dashboard/presence/actions', () => ({
  loadDspPresenceForProfile: vi.fn(async () => []),
}));

vi.mock('@/app/app/(shell)/dashboard/tasks/task-actions', () => ({
  getTasks: mocks.getTasks,
}));

describe('prefetchForRoute', () => {
  afterEach(() => {
    mocks.getTasks.mockClear();
    mocks.loadReleaseMatrix.mockClear();
  });

  it('warms the release matrix cache for the library route', async () => {
    const queryClient = new QueryClient();

    prefetchForRoute('library', queryClient, 'profile-123');

    await vi.waitFor(() => {
      expect(mocks.loadReleaseMatrix).toHaveBeenCalledWith('profile-123');
    });

    await vi.waitFor(() => {
      expect(
        queryClient.getQueryData(queryKeys.releases.matrix('profile-123'))
      ).toEqual([{ id: 'release-profile-123' }]);
    });
  });

  it('warms the canonical tasks workspace cache for the tasks route', async () => {
    const queryClient = new QueryClient();

    prefetchForRoute('tasks', queryClient, 'profile-123');

    await vi.waitFor(() => {
      expect(mocks.getTasks).toHaveBeenCalledWith(
        DEFAULT_TASK_WORKSPACE_FILTERS
      );
    });

    await vi.waitFor(() => {
      expect(
        queryClient.getQueryData(
          queryKeys.tasks.list('profile-123', DEFAULT_TASK_WORKSPACE_FILTERS)
        )
      ).toEqual({ nextCursor: null, tasks: [] });
    });
  });
});
