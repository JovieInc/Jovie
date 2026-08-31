import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    accounts: [
      {
        id: 'account-1',
        creatorProfileId: 'profile-1',
        channelId: 'channel-1',
        updatedAt: new Date('2026-08-28T11:00:00.000Z'),
      },
    ] as {
      id: string;
      creatorProfileId: string | null;
      channelId: string;
      updatedAt: Date;
    }[],
    connectorSetValues: [] as Record<string, unknown>[],
    syncStateSetValues: [] as Record<string, unknown>[],
    lockAcquired: true,
    cursor: null as unknown,
    reportedUploadsPageToken: null as string | null,
  };
  const lockReturning = vi.fn(async () =>
    state.lockAcquired ? [{ cursor: state.cursor }] : []
  );
  const where = vi.fn(() => ({ returning: lockReturning }));
  return {
    state,
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
            orderBy: vi.fn(() => ({
              limit: vi.fn(async () => state.accounts),
            })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => {
          if ('cursor' in values || 'lastFullSyncAt' in values) {
            state.syncStateSetValues.push(values);
          } else if (!('tokenRefreshLockedUntil' in values)) {
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
  const now = new Date('2026-08-28T12:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.accounts.splice(0, mocks.state.accounts.length, {
      id: 'account-1',
      creatorProfileId: 'profile-1',
      channelId: 'channel-1',
      updatedAt: new Date('2026-08-28T11:00:00.000Z'),
    });
    mocks.state.connectorSetValues.splice(0);
    mocks.state.syncStateSetValues.splice(0);
    mocks.state.lockAcquired = true;
    mocks.state.cursor = null;
    mocks.state.reportedUploadsPageToken = null;
    mocks.loadFreshGoogleAccessToken.mockResolvedValue('access-token');
    mocks.syncChannelVideos.mockResolvedValue({ imported: 1 });
    mocks.reconcileApprovedYouTubeCollaborators.mockResolvedValue(undefined);
  });

  it('fails missing access closed to needs reauthorization', async () => {
    mocks.loadFreshGoogleAccessToken.mockResolvedValueOnce(null);

    await expect(runConnectedYouTubeRefreshes(now)).resolves.toMatchObject({
      attempted: 1,
      needsReauth: 1,
      failed: 0,
    });

    expect(mocks.syncChannelVideos).not.toHaveBeenCalled();
    expect(mocks.state.connectorSetValues.at(-1)).toMatchObject({
      lastErrorCode: 'youtube_reauth_required',
      lastErrorDevMessage: null,
    });
  });

  it('syncs through bounded scheduled provider settings and persists the cursor', async () => {
    mocks.state.cursor = { uploadsPageToken: 'page-2' };
    mocks.state.reportedUploadsPageToken = 'page-3';

    await expect(
      runConnectedYouTubeRefreshes(now, { deadlineMs: now.getTime() + 50_000 })
    ).resolves.toMatchObject({ attempted: 1, synced: 1, failed: 0 });

    expect(mocks.createYouTubeLibraryProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'access-token',
        maxVideosPerSync: 50,
        maxAnalyticsRequests: 2,
        timeoutMs: 5000,
        uploadsPageToken: 'page-2',
        deadlineMs: now.getTime() + 50_000,
      })
    );
    expect(mocks.syncChannelVideos).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 'channel-1', now })
    );
    expect(mocks.reconcileApprovedYouTubeCollaborators).toHaveBeenCalledWith(
      'profile-1',
      now
    );
    expect(mocks.state.syncStateSetValues.at(-1)).toMatchObject({
      cursor: { uploadsPageToken: 'page-3' },
      lastIncrementalSyncAt: now,
    });
  });

  it('records provider failure without aborting the cron loop', async () => {
    mocks.syncChannelVideos.mockRejectedValueOnce(new Error('provider down'));

    await expect(runConnectedYouTubeRefreshes(now)).resolves.toMatchObject({
      attempted: 1,
      failed: 1,
      skipped: 0,
    });

    expect(mocks.state.connectorSetValues.at(-1)).toMatchObject({
      lastErrorCode: 'youtube_sync_failed',
      lastErrorDevMessage: 'provider down',
    });
    expect(mocks.captureError).toHaveBeenCalledOnce();
  });

  it('skips work when the account sync or token refresh lock is busy', async () => {
    mocks.state.lockAcquired = false;
    await expect(runConnectedYouTubeRefreshes(now)).resolves.toMatchObject({
      skipped: 1,
    });
    expect(mocks.loadFreshGoogleAccessToken).not.toHaveBeenCalled();

    const error = new Error('refresh lock held');
    error.name = 'RefreshLockBusyError';
    mocks.state.lockAcquired = true;
    mocks.loadFreshGoogleAccessToken.mockRejectedValueOnce(error);
    await expect(runConnectedYouTubeRefreshes(now)).resolves.toMatchObject({
      skipped: 1,
    });
    expect(mocks.state.connectorSetValues).toEqual([]);
    expect(mocks.captureError).not.toHaveBeenCalled();
  });
});
