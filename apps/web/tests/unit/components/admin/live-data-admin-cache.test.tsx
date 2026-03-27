import { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import {
  markCachedCreatorsPending,
  patchCachedCreator,
  removeCachedCreator,
} from '@/lib/queries/creator-cache';
import { queryKeys } from '@/lib/queries/keys';

const refreshSpy = vi.fn();
const notifySuccessSpy = vi.fn();
const notifyErrorSpy = vi.fn();
const mutateSpy = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshSpy,
  }),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    success: notifySuccessSpy,
    handleError: notifyErrorSpy,
  }),
}));

vi.mock('@/lib/queries', () => ({
  useIngestRefreshMutation: () => ({
    mutate: mutateSpy,
    isPending: false,
  }),
}));

function createProfile(
  overrides: Partial<AdminCreatorProfileRow> = {}
): AdminCreatorProfileRow {
  return {
    id: 'creator-1',
    username: 'alice',
    usernameNormalized: 'alice',
    avatarUrl: null,
    displayName: 'Alice',
    isVerified: false,
    isFeatured: false,
    marketingOptOut: false,
    isClaimed: false,
    claimToken: null,
    claimTokenExpiresAt: null,
    userId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ingestionStatus: 'idle',
    lastIngestionError: null,
    location: null,
    hometown: null,
    activeSinceYear: null,
    socialLinks: [],
    ...overrides,
  };
}

function seedCreatorsList(
  queryClient: QueryClient,
  profiles: AdminCreatorProfileRow[]
) {
  queryClient.setQueryData(queryKeys.creators.list({ sort: 'created_desc' }), {
    pages: [{ rows: profiles, total: profiles.length }],
    pageParams: [1],
  });
}

describe('creator cache helpers', () => {
  it('patches cached creator rows in-place', () => {
    const queryClient = new QueryClient();
    seedCreatorsList(queryClient, [createProfile()]);

    patchCachedCreator(queryClient, 'creator-1', profile => ({
      ...profile,
      isFeatured: true,
    }));

    const cached = queryClient.getQueryData<{
      pages: Array<{ rows: AdminCreatorProfileRow[] }>;
    }>(queryKeys.creators.list({ sort: 'created_desc' }));

    expect(cached?.pages[0]?.rows[0]?.isFeatured).toBe(true);
  });

  it('marks refreshed creators as pending without removing them', () => {
    const queryClient = new QueryClient();
    seedCreatorsList(queryClient, [createProfile()]);

    markCachedCreatorsPending(queryClient, ['creator-1']);

    const cached = queryClient.getQueryData<{
      pages: Array<{ rows: AdminCreatorProfileRow[] }>;
    }>(queryKeys.creators.list({ sort: 'created_desc' }));

    expect(cached?.pages[0]?.rows[0]?.ingestionStatus).toBe('pending');
  });

  it('removes deleted creators and decrements total', () => {
    const queryClient = new QueryClient();
    seedCreatorsList(queryClient, [createProfile()]);

    removeCachedCreator(queryClient, 'creator-1');

    const cached = queryClient.getQueryData<{
      pages: Array<{ rows: AdminCreatorProfileRow[]; total: number }>;
    }>(queryKeys.creators.list({ sort: 'created_desc' }));

    expect(cached?.pages[0]?.rows).toEqual([]);
    expect(cached?.pages[0]?.total).toBe(0);
  });
});

describe('useIngestRefresh', () => {
  it('keeps refresh local to cache updates instead of routing refresh', async () => {
    mutateSpy.mockImplementation(
      (
        _variables: { profileId: string },
        options?: { onSuccess?: () => void }
      ) => {
        options?.onSuccess?.();
      }
    );

    const onRefreshComplete = vi.fn();
    const { useIngestRefresh } = await import(
      '@/components/features/admin/admin-creator-profiles/useIngestRefresh'
    );

    const { result } = renderHook(() =>
      useIngestRefresh({
        selectedId: 'creator-1',
        onRefreshComplete,
      })
    );

    act(() => {
      result.current.refreshIngest('creator-1');
    });

    expect(refreshSpy).not.toHaveBeenCalled();
    expect(notifySuccessSpy).toHaveBeenCalledWith('Ingestion refresh queued');
    expect(onRefreshComplete).toHaveBeenCalledWith('creator-1');
  });
});
