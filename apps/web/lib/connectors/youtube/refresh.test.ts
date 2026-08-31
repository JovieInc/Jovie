import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    accounts: [] as {
      id: string;
      creatorProfileId: string | null;
      channelId: string;
    }[],
    connectorSetValues: [] as Record<string, unknown>[],
    syncStateSetValues: [] as Record<string, unknown>[],
    lockSetValues: [] as Record<string, unknown>[],
    lockAcquired: true,
    cursor: null as unknown,
    reportedUploadsPageToken: null as string | null,
  };
  const lockReturning = vi.fn(async () =>
    state.lockAcquired ? [{ cursor: state.cursor }] : []
  );
  const where = vi.fn(() => ({
    returning: lockReturning,
  }));
  const orderBy = vi.fn(() => ({
    limit: vi.fn(async () => state.accounts),
  }));
  return {
    ...state,
    state,
    orderBy,
    loadFreshGoogleAccessToken: vi.fn(),
    createYouTubeLibraryProvider: vi.fn(
      (input: { onUploadsPageToken?: (pageToken: string | null) => void }) => {
        input.onUploadsPageToken?.(state.reportedUploadsPageToken);
        return { provider: 'youtube' };
      }
    ),
    syncChannelVideos: vi.fn(),
    reconcileApprovedYouTubeCollaborators: vi.fn(),
    captureError: vi.fn(),
    dbMock: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy,
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => {
          if ('tokenRefreshLockedUntil' in values) {
            state.lockSetValues.push(values);
          } else if (
            'cursor' in values ||
            'lastFullSyncAt' in values ||
            'lastIncrementalSyncAt' in values
          ) {
            state.syncStateSetValues.push(values);
          } else {
            state.connectorSetValues.push(values);
          }
          return { where };
        }),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(async () => undefined),
        })),
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
    mocks.connectorSetValues.splice(0);
    mocks.syncStateSetValues.splice(0);
    mocks.lockSetValues.splice(0);
    mocks.state.lockAcquired = true;
    mocks.state.cursor = null;
    mocks.state.reportedUploadsPageToken = null;
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
      skipped: 0,
    });
  });

  it('prioritizes never-synced channels before stale non-null channels', async () => {
    await runConnectedYouTubeRefreshes(new Date('2026-08-28T12:00:00.000Z'));
    expect(mocks.orderBy).toHaveBeenCalledOnce();
    expect(mocks.orderBy.mock.calls[0]).toHaveLength(2);
  });

  it('fails missing access closed to needs reauthorization', async () => {
    mocks.loadFreshGoogleAccessToken.mockResolvedValueOnce(null);
    await expect(runConnectedYouTubeRefreshes()).resolves.toEqual({
      attempted: 1,
      synced: 0,
      needsReauth: 1,
      failed: 0,
      skipped: 0,
    });
    expect(mocks.syncChannelVideos).not.toHaveBeenCalled();
    expect(mocks.connectorSetValues.at(-1)).toMatchObject({
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
      skipped: 0,
    });
    expect(mocks.createYouTubeLibraryProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'access-token',
        maxVideosPerSync: 50,
        uploadsPageToken: undefined,
      })
    );
    expect(mocks.syncChannelVideos).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 'channel-1', now })
    );
    expect(mocks.reconcileApprovedYouTubeCollaborators).toHaveBeenCalledWith(
      'profile-1',
      now
    );
    expect(mocks.connectorSetValues.at(-1)).toMatchObject({
      lastSyncAt: now,
      lastErrorCode: null,
      lastErrorUserMessage: null,
    });
    expect(mocks.syncStateSetValues.at(-1)).toMatchObject({
      cursor: null,
      lastFullSyncAt: now,
      lastIncrementalSyncAt: now,
    });
  });

  it('resumes the scheduled upload scan from the stored page cursor', async () => {
    const now = new Date('2026-08-28T12:00:00.000Z');
    mocks.state.cursor = { uploadsPageToken: 'page-2' };
    mocks.state.reportedUploadsPageToken = 'page-3';

    await expect(runConnectedYouTubeRefreshes(now)).resolves.toEqual({
      attempted: 1,
      synced: 1,
      needsReauth: 0,
      failed: 0,
      skipped: 0,
    });

    expect(mocks.createYouTubeLibraryProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadsPageToken: 'page-2',
      })
    );
    expect(mocks.syncStateSetValues.at(-1)).toMatchObject({
      cursor: { uploadsPageToken: 'page-3' },
      lastIncrementalSyncAt: now,
    });
  });

  it('records provider failure without aborting the cron loop', async () => {
    mocks.syncChannelVideos.mockRejectedValueOnce(new Error('provider down'));
    await expect(runConnectedYouTubeRefreshes()).resolves.toEqual({
      attempted: 1,
      synced: 0,
      needsReauth: 0,
      failed: 1,
      skipped: 0,
    });
    expect(mocks.connectorSetValues.at(-1)).toMatchObject({
      lastErrorCode: 'youtube_sync_failed',
      lastErrorDevMessage: 'provider down',
    });
    expect(mocks.captureError).toHaveBeenCalledOnce();
  });

  it('skips work when another caller already holds the account sync lock', async () => {
    mocks.state.lockAcquired = false;
    await expect(runConnectedYouTubeRefreshes()).resolves.toEqual({
      attempted: 1,
      synced: 0,
      needsReauth: 0,
      failed: 0,
      skipped: 1,
    });
    expect(mocks.loadFreshGoogleAccessToken).not.toHaveBeenCalled();
    expect(mocks.syncChannelVideos).not.toHaveBeenCalled();
    expect(mocks.connectorSetValues).toEqual([]);
  });

  it('counts a selected account with a missing profile as failed evidence', async () => {
    mocks.accounts.splice(0, mocks.accounts.length, {
      id: 'account-1',
      creatorProfileId: null,
      channelId: 'channel-1',
    });
    await expect(runConnectedYouTubeRefreshes()).resolves.toEqual({
      attempted: 1,
      synced: 0,
      needsReauth: 0,
      failed: 1,
      skipped: 0,
    });
    expect(mocks.loadFreshGoogleAccessToken).not.toHaveBeenCalled();
    expect(mocks.captureError).toHaveBeenCalledWith(
      'Connected YouTube refresh selected an account without a profile',
      expect.any(Error),
      { connectorAccountId: 'account-1', channelId: 'channel-1' }
    );
  });
});
