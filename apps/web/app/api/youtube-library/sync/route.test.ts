import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    validateYouTubeProfileMutationRequest: vi.fn(async () => ({
      ok: true,
      userId: 'user-1',
      creatorProfileId: 'profile-1',
    })),
    refreshConnectedYouTubeAccount: vi.fn(),
    dbMock: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => [
            { id: 'account-1', channelId: 'channel-1', updatedAt: new Date(0) },
            { id: 'account-2', channelId: 'channel-2', updatedAt: new Date(0) },
          ]),
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

describe('POST /api/youtube-library/sync', () => {
  it('syncs every connected channel through the bounded refresh helper', async () => {
    mocks.refreshConnectedYouTubeAccount
      .mockResolvedValueOnce({ status: 'synced', result: { imported: 12 } })
      .mockResolvedValueOnce({ status: 'synced', result: { imported: 4 } });

    await POST(
      new Request('http://localhost/api/youtube-library/sync', {
        method: 'POST',
      })
    );

    expect(mocks.refreshConnectedYouTubeAccount).toHaveBeenCalledTimes(2);
    expect(mocks.refreshConnectedYouTubeAccount).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        connectorAccountId: 'account-2',
        source: 'manual',
        observedUpdatedAt: expect.any(Date),
        deadlineMs: expect.any(Number),
      })
    );
  });
});
