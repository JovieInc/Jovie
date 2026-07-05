import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/releases/release-matrix-loader', () => ({
  loadReleaseMatrix: vi.fn().mockResolvedValue([{ id: 'rel-1' }]),
}));
vi.mock('@/app/app/(shell)/dashboard/tour-dates/actions', () => ({
  loadTourDates: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/app/app/(shell)/dashboard/presence/actions', () => ({
  loadDspPresenceForProfile: vi.fn(),
}));
vi.mock('@/app/app/(shell)/dashboard/tasks/task-actions', () => ({
  getTasks: vi.fn(),
}));
vi.mock('./fetch', () => ({
  createQueryFn: vi.fn(() => vi.fn()),
  fetchWithTimeout: vi.fn().mockResolvedValue([{ id: 'contact-1' }]),
}));
// Avoid the heavy @/lib/queries barrel that useEventsQuery pulls in.
vi.mock('./useEventsQuery', () => ({
  tourDateToEventRecord: (td: unknown) => td,
}));

import { queryKeys } from './keys';
import { prefetchChatEntityPanelData } from './prefetch-dashboard';

// Perceived-instant guard (JOV-3800): chat entity panels must be warmed under
// the exact query keys the panel hooks read, so opening a panel from an
// entity chip paints content instead of a loading state.
describe('prefetchChatEntityPanelData', () => {
  it('warms releases, contacts, and events caches under the hook query keys', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    prefetchChatEntityPanelData(queryClient, 'profile-1');

    await vi.waitFor(() => {
      expect(
        queryClient.getQueryData(queryKeys.releases.matrix('profile-1'))
      ).toEqual([{ id: 'rel-1' }]);
      expect(
        queryClient.getQueryData(queryKeys.contacts.list('profile-1'))
      ).toEqual([{ id: 'contact-1' }]);
      expect(
        queryClient.getQueryData(queryKeys.events.list('profile-1'))
      ).toEqual([]);
    });
  });
});
