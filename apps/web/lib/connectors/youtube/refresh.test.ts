import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    accounts: [] as {
      id: string;
      creatorProfileId: string | null;
      channelId: string;
    }[],
    setValues: [] as Record<string, unknown>[],
  };
  return {
    ...state,
    loadFreshGoogleAccessToken: vi.fn(),
    createYouTubeLibraryProvider: vi.fn(() => ({ provider: 'youtube' })),
    syncChannelVideos: vi.fn(),
    reconcileApprovedYouTubeCollaborators: vi.fn(),
    captureError: vi.fn(),
    dbMock: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(async () => state.accounts),
            })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => {
          state.setValues.push(values);
          return { where: vi.fn(async () => undefined) };
        }),
      })),
    },
  };
});

vi.mock('@/lib/connectors/google-calendar/access-token', () => ({
  loadFreshGoogleAccessToken: mocks.loadFreshGoogleAccessToken,
}));
vi.mock('@/lib/connectors/youtube/provider', () => ({
  createYouTubeLibraryProvider: mocks.createYouTubeLibraryProvider,
}));
vi.mock('@/lib/db', () => ({ db: mocks.dbMock }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('@/lib/library/graph-store', () => ({
  reconcileApprovedYouTubeCollaborators:
    mocks.reconcileApprovedYouTubeCollaborators,
}));
vi.mock('@/lib/youtube-library/sync', () => ({
  syncChannelVideos: mocks.syncChannelVideos,
}));

import { runConnectedYouTubeRefreshes } from './refresh';

describe('connected YouTube refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accounts.splice(0, mocks.accounts.length, {
      id: 'account-1',
      creatorProfileId: 'profile-1',
      channelId: 'channel-1',
    });
    mocks.setValues.splice(0);
    mocks.loadFreshGoogleAccessToken.mockResolvedValue('access-token');
    mocks.syncChannelVideos.mockResolvedValue({ imported: 1 });
    mocks.reconcileApprovedYouTubeCollaborators.mockResolvedValue(undefined);
  });

  it('does no work when no connected channel is stale', async () => {
    mocks.accounts.splice(0);
    await expect(runConnectedYouTubeRefreshes()).resolves.toEqual({
      attempted: 0,
      synced: 0,
      needsReauth: 0,
      failed: 0,
    });
  });

  it('fails missing access closed to needs reauthorization', async () => {
    mocks.loadFreshGoogleAccessToken.mockResolvedValueOnce(null);
    await expect(runConnectedYouTubeRefreshes()).resolves.toEqual({
      attempted: 1,
      synced: 0,
      needsReauth: 1,
      failed: 0,
    });
    expect(mocks.syncChannelVideos).not.toHaveBeenCalled();
    expect(mocks.setValues.at(-1)).toMatchObject({
      lastErrorCode: 'youtube_reauth_required',
      lastErrorDevMessage: null,
    });
  });

  it('syncs one bounded channel and refreshes collaborator edges', async () => {
    const now = new Date('2026-08-28T12:00:00.000Z');
    await expect(runConnectedYouTubeRefreshes(now)).resolves.toEqual({
      attempted: 1,
      synced: 1,
      needsReauth: 0,
      failed: 0,
    });
    expect(mocks.syncChannelVideos).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 'channel-1', now })
    );
    expect(mocks.reconcileApprovedYouTubeCollaborators).toHaveBeenCalledWith(
      'profile-1',
      now
    );
    expect(mocks.setValues.at(-1)).toMatchObject({
      lastSyncAt: now,
      lastErrorCode: null,
      lastErrorUserMessage: null,
    });
  });

  it('records provider failure without aborting the cron loop', async () => {
    mocks.syncChannelVideos.mockRejectedValueOnce(new Error('provider down'));
    await expect(runConnectedYouTubeRefreshes()).resolves.toEqual({
      attempted: 1,
      synced: 0,
      needsReauth: 0,
      failed: 1,
    });
    expect(mocks.setValues.at(-1)).toMatchObject({
      lastErrorCode: 'youtube_sync_failed',
      lastErrorDevMessage: 'provider down',
    });
    expect(mocks.captureError).toHaveBeenCalledOnce();
  });
});
