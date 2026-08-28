import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    selectRows: [] as { id: string; channelId: string }[],
    setValues: [] as Record<string, unknown>[],
  };
  return {
    ...state,
    getCachedAuth: vi.fn(),
    getExactProfileAccess: vi.fn(),
    loadFreshGoogleAccessToken: vi.fn(),
    createYouTubeLibraryProvider: vi.fn(() => ({ provider: 'youtube' })),
    syncChannelVideos: vi.fn(),
    reconcileApprovedYouTubeCollaborators: vi.fn(),
    captureError: vi.fn(),
    dbMock: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => state.selectRows),
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

vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.getCachedAuth }));
vi.mock('@/lib/auth/profile-access', () => ({
  getExactProfileAccess: mocks.getExactProfileAccess,
}));
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

import { POST } from './route';

const profileId = '11111111-1111-4111-8111-111111111111';

function request() {
  return new Request('http://localhost/api/youtube-library/sync', {
    method: 'POST',
    body: JSON.stringify({ creatorProfileId: profileId }),
  });
}

describe('POST /api/youtube-library/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectRows.splice(0, mocks.selectRows.length, {
      id: 'account-1',
      channelId: 'channel-1',
    });
    mocks.setValues.splice(0);
    mocks.getCachedAuth.mockResolvedValue({ userId: 'user-1' });
    mocks.getExactProfileAccess.mockResolvedValue({ ok: true });
    mocks.loadFreshGoogleAccessToken.mockResolvedValue('access-token');
    mocks.syncChannelVideos.mockResolvedValue({ imported: 12 });
    mocks.reconcileApprovedYouTubeCollaborators.mockResolvedValue(undefined);
  });

  it('requires exact profile access', async () => {
    mocks.getExactProfileAccess.mockResolvedValueOnce({ ok: false });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.syncChannelVideos).not.toHaveBeenCalled();
  });

  it('requires a fresh connector token', async () => {
    mocks.loadFreshGoogleAccessToken.mockResolvedValueOnce(null);
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(mocks.syncChannelVideos).not.toHaveBeenCalled();
  });

  it('syncs the owned channel and refreshes collaborator edges', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ imported: 12 });
    expect(mocks.syncChannelVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: profileId,
        channelId: 'channel-1',
      })
    );
    expect(mocks.reconcileApprovedYouTubeCollaborators).toHaveBeenCalledWith(
      profileId
    );
    expect(mocks.setValues.at(-1)).toMatchObject({
      lastErrorCode: null,
      lastErrorUserMessage: null,
    });
  });

  it('records a bounded error without leaking provider details', async () => {
    mocks.syncChannelVideos.mockRejectedValueOnce(new Error('provider detail'));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'YouTube sync failed' });
    expect(mocks.setValues.at(-1)).toMatchObject({
      lastErrorCode: 'youtube_sync_failed',
      lastErrorDevMessage: 'provider detail',
    });
    expect(mocks.captureError).toHaveBeenCalledOnce();
  });
});
