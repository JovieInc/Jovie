import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queries/keys';
import { prefetchForRoute } from '@/lib/queries/prefetch-dashboard';

const mocks = vi.hoisted(() => ({
  loadReleaseMatrix: vi.fn(async (profileId: string) => [
    { id: `release-${profileId}` },
  ]),
}));

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  loadReleaseMatrix: mocks.loadReleaseMatrix,
}));

vi.mock('@/app/app/(shell)/dashboard/presence/actions', () => ({
  loadDspPresenceForProfile: vi.fn(async () => []),
}));

vi.mock('@/app/app/(shell)/dashboard/tasks/task-actions', () => ({
  getTasks: vi.fn(async () => []),
}));

describe('prefetchForRoute', () => {
  afterEach(() => {
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
});
