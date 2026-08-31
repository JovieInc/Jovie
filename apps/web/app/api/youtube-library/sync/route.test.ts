import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    selectRows: [] as { id: string; channelId: string }[],
  };
  return {
    ...state,
    validateYouTubeProfileMutationRequest: vi.fn(),
    refreshConnectedYouTubeAccount: vi.fn(),
    dbMock: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => state.selectRows),
          })),
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

  it('requires a fresh connector token', async () => {
    mocks.refreshConnectedYouTubeAccount.mockResolvedValueOnce({
      status: 'needs_reauth',
    });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(mocks.refreshConnectedYouTubeAccount).toHaveBeenCalledWith({
      connectorAccountId: 'account-1',
      creatorProfileId: profileId,
      channelId: 'channel-1',
      source: 'manual',
    });
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
