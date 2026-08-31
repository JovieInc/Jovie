import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    selectRows: [
      {
        id: 'account-1',
        channelId: 'channel-1',
        updatedAt: new Date('2026-08-28T11:00:00.000Z'),
      },
    ] as { id: string; channelId: string; updatedAt: Date }[],
  };
  return {
    state,
    validateYouTubeProfileMutationRequest: vi.fn(),
    refreshConnectedYouTubeAccount: vi.fn(),
    dbMock: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(async () => state.selectRows) })),
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
const request = () =>
  new Request('http://localhost/api/youtube-library/sync', {
    method: 'POST',
    body: JSON.stringify({ creatorProfileId: profileId }),
  });

describe('POST /api/youtube-library/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.selectRows.splice(0, mocks.state.selectRows.length, {
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

  it('syncs every connected channel through the bounded refresh helper', async () => {
    mocks.state.selectRows.push({
      id: 'account-2',
      channelId: 'channel-2',
      updatedAt: new Date('2026-08-28T11:01:00.000Z'),
    });
    mocks.refreshConnectedYouTubeAccount
      .mockResolvedValueOnce({ status: 'synced', result: { imported: 12 } })
      .mockResolvedValueOnce({ status: 'synced', result: { imported: 4 } });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      attempted: 2,
      synced: 2,
      failed: 0,
      results: [{ imported: 12 }, { imported: 4 }],
    });
    expect(mocks.refreshConnectedYouTubeAccount).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        connectorAccountId: 'account-2',
        source: 'manual',
        observedUpdatedAt: new Date('2026-08-28T11:01:00.000Z'),
        deadlineMs: expect.any(Number),
      })
    );
  });
});
