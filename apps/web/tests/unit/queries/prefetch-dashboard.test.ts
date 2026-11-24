import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { audienceWarmFilterParams } from '@/lib/queries/audience-members-params';
import { queryKeys } from '@/lib/queries/keys';
import { prefetchForRoute } from '@/lib/queries/prefetch-dashboard';
import { DEFAULT_TASK_WORKSPACE_FILTERS } from '@/lib/tasks/query-defaults';

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(async () => []),
  getTasks: vi.fn(async () => ({ nextCursor: null, tasks: [] })),
  loadTourDates: vi.fn(async () => []),
  loadReleaseMatrix: vi.fn(async (profileId: string) => [
    { id: `release-${profileId}` },
  ]),
}));

vi.mock('@/lib/releases/release-matrix-loader', () => ({
  loadReleaseMatrix: mocks.loadReleaseMatrix,
}));

vi.mock('@/app/app/(shell)/dashboard/tour-dates/actions', () => ({
  loadTourDates: mocks.loadTourDates,
}));

vi.mock('@/lib/queries/fetch', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/fetch')>(
    '@/lib/queries/fetch'
  );
  return { ...actual, fetchWithTimeout: mocks.fetchWithTimeout };
});

vi.mock('@/app/app/(shell)/dashboard/tasks/task-actions', () => ({
  getTasks: mocks.getTasks,
}));

describe('prefetchForRoute', () => {
  afterEach(() => {
    mocks.getTasks.mockClear();
    mocks.fetchWithTimeout.mockClear();
    mocks.loadTourDates.mockClear();
    mocks.loadReleaseMatrix.mockClear();
  });

  it('warms the canonical contacts workspace cache', async () => {
    const queryClient = new QueryClient();

    prefetchForRoute('contacts', queryClient, 'profile-123');

    await vi.waitFor(() => {
      expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
        '/api/dashboard/contacts?profileId=profile-123',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  it('warms events and releases for the canonical calendar workspace', async () => {
    const queryClient = new QueryClient();

    prefetchForRoute('calendar', queryClient, 'profile-123');

    await vi.waitFor(() => {
      expect(mocks.loadTourDates).toHaveBeenCalledWith('profile-123');
      expect(mocks.loadReleaseMatrix).toHaveBeenCalledWith('profile-123');
    });
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

  it('warms Audience under the infinite-query key and URL shape the table reads', async () => {
    const queryClient = new QueryClient();
    const filters = audienceWarmFilterParams();

    prefetchForRoute('audience', queryClient, 'profile-123');

    await vi.waitFor(() => {
      expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\/api\/dashboard\/audience\/members\?.*profileId=profile-123/
        ),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    const warmUrl = String(mocks.fetchWithTimeout.mock.calls[0]?.[0] ?? '');
    expect(warmUrl).toContain('sort=lastSeen');
    expect(warmUrl).toContain('direction=desc');
    expect(warmUrl).toContain('view=all');
    expect(warmUrl).toContain('pageSize=50');

    // Bare members(profileId) must stay empty — that was the dead-warm bug.
    expect(
      queryClient.getQueryData(queryKeys.audience.members('profile-123'))
    ).toBeUndefined();

    await vi.waitFor(() => {
      expect(
        queryClient.getQueryData(
          queryKeys.audience.members('profile-123', filters)
        )
      ).toBeDefined();
    });
  });

  it('does not warm dspEnrichment.presence for Identity (presence route)', () => {
    const queryClient = new QueryClient();
    const prefetchSpy = vi.spyOn(queryClient, 'prefetchQuery');
    const prefetchInfiniteSpy = vi.spyOn(queryClient, 'prefetchInfiniteQuery');

    prefetchForRoute('presence', queryClient, 'profile-123');

    expect(prefetchSpy).not.toHaveBeenCalled();
    expect(prefetchInfiniteSpy).not.toHaveBeenCalled();
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled();
  });
});
