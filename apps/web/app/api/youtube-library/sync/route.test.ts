import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    selectRows: [] as { id: string; channelId: string; updatedAt: Date }[],
  };
  return {
    ...state,
    validateYouTubeProfileMutationRequest: vi.fn(),
    refreshConnectedYouTubeAccount: vi.fn(),
    dbMock: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => state.selectRows),
        })),
      })),
    },
  };
});

vi.mock('@/lib/connectors/youtube/profile-request', () => ({
  validateYouTubeProfileMutationRequest:
    mocks.validateYouTubeProfileMutationRequest,
}));
vi.mock('@/lib/connectors/youtube/refresh', () => ({
  refreshConnectedYouTubeAccount: mocks.refreshConnectedYouTubeAccount,
}));
vi.mock('@/lib/db', () => ({ db: mocks.dbMock }));

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
      updatedAt: new Date('2026-08-28T11:00:00.000Z'),
    });
    mocks.validateYouTubeProfileMutationRequest.mockResolvedValue({
      ok: true,
      userId: 'user-1',
      creatorProfileId: profileId,
    });
    mocks.refreshConnectedYouTubeAccount.mockResolvedValue({
      status: 'synced',
      result: { imported: 12 },
    });
  });

  it('returns profile validation failures', async () => {
    mocks.validateYouTubeProfileMutationRequest.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.refreshConnectedYouTubeAccount).not.toHaveBeenCalled();
  });

  it('requires a connected YouTube channel', async () => {
    mocks.selectRows.splice(0);
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Connect YouTube before importing videos',
    });
    expect(mocks.refreshConnectedYouTubeAccount).not.toHaveBeenCalled();
  });

  it('prioritizes reconnect guidance when no channels sync and one needs reauth', async () => {
    mocks.selectRows.splice(
      0,
      mocks.selectRows.length,
      {
        id: 'account-1',
        channelId: 'channel-1',
        updatedAt: new Date('2026-08-28T11:00:00.000Z'),
      },
      {
        id: 'account-2',
        channelId: 'channel-2',
        updatedAt: new Date('2026-08-28T11:01:00.000Z'),
      }
    );
    mocks.refreshConnectedYouTubeAccount
      .mockResolvedValueOnce({
        status: 'needs_reauth',
      })
      .mockResolvedValueOnce({
        status: 'failed',
        error: new Error('provider detail'),
      });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Reconnect YouTube to refresh access',
    });
    expect(mocks.refreshConnectedYouTubeAccount).toHaveBeenCalledTimes(2);
  });

  it('syncs the owned channel through the shared refresh helper', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ imported: 12 });
    expect(mocks.refreshConnectedYouTubeAccount).toHaveBeenCalledWith({
      connectorAccountId: 'account-1',
      creatorProfileId: profileId,
      channelId: 'channel-1',
      source: 'manual',
      observedUpdatedAt: new Date('2026-08-28T11:00:00.000Z'),
      deadlineMs: expect.any(Number),
    });
  });

  it('syncs every connected YouTube channel for the profile', async () => {
    mocks.selectRows.splice(
      0,
      mocks.selectRows.length,
      {
        id: 'account-1',
        channelId: 'channel-1',
        updatedAt: new Date('2026-08-28T11:00:00.000Z'),
      },
      {
        id: 'account-2',
        channelId: 'channel-2',
        updatedAt: new Date('2026-08-28T11:01:00.000Z'),
      }
    );
    mocks.refreshConnectedYouTubeAccount
      .mockResolvedValueOnce({
        status: 'synced',
        result: { imported: 12, channelId: 'channel-1' },
      })
      .mockResolvedValueOnce({
        status: 'synced',
        result: { imported: 4, channelId: 'channel-2' },
      });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      attempted: 2,
      synced: 2,
      needsReauth: 0,
      failed: 0,
      busy: 0,
      results: [
        { imported: 12, channelId: 'channel-1' },
        { imported: 4, channelId: 'channel-2' },
      ],
    });
    expect(mocks.refreshConnectedYouTubeAccount).toHaveBeenCalledTimes(2);
    expect(mocks.refreshConnectedYouTubeAccount).toHaveBeenNthCalledWith(2, {
      connectorAccountId: 'account-2',
      creatorProfileId: profileId,
      channelId: 'channel-2',
      source: 'manual',
      observedUpdatedAt: new Date('2026-08-28T11:01:00.000Z'),
      deadlineMs: expect.any(Number),
    });
  });

  it('returns a bounded conflict when the account is already syncing', async () => {
    mocks.refreshConnectedYouTubeAccount.mockResolvedValueOnce({
      status: 'busy',
    });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'YouTube sync already in progress',
    });
  });

  it('returns a bounded error without leaking provider details', async () => {
    mocks.refreshConnectedYouTubeAccount.mockResolvedValueOnce({
      status: 'failed',
      error: new Error('provider detail'),
    });
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'YouTube sync failed' });
  });
});
