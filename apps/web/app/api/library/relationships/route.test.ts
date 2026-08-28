import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  getExactProfileAccess: vi.fn(),
  removeYouTubeVideoMerchTag: vi.fn(),
  tagYouTubeVideoWithMerch: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.getCachedAuth }));
vi.mock('@/lib/auth/profile-access', () => ({
  getExactProfileAccess: mocks.getExactProfileAccess,
}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/library/graph-store', () => ({
  removeYouTubeVideoMerchTag: mocks.removeYouTubeVideoMerchTag,
  tagYouTubeVideoWithMerch: mocks.tagYouTubeVideoWithMerch,
}));

import { DELETE, POST } from './route';

const creatorProfileId = '11111111-1111-4111-8111-111111111111';
const videoId = '22222222-2222-4222-8222-222222222222';
const merchCardId = '33333333-3333-4333-8333-333333333333';

function request(method: 'POST' | 'DELETE') {
  return new Request('http://localhost/api/library/relationships', {
    method,
    body: JSON.stringify({ creatorProfileId, videoId, merchCardId }),
  });
}

describe('library relationships route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedAuth.mockResolvedValue({ userId: 'app-user-id' });
    mocks.getExactProfileAccess.mockResolvedValue({
      ok: true,
      profileId: creatorProfileId,
      ownerUserId: 'app-user-id',
    });
  });

  it('does not write relationships across profiles', async () => {
    mocks.getExactProfileAccess.mockResolvedValue({
      ok: false,
      reason: 'forbidden',
    });
    const response = await POST(request('POST'));
    expect(response.status).toBe(403);
    expect(mocks.tagYouTubeVideoWithMerch).not.toHaveBeenCalled();
  });

  it('records an artist-confirmed video to merch relationship', async () => {
    mocks.tagYouTubeVideoWithMerch.mockResolvedValue({
      id: 'relationship-id',
    });
    const response = await POST(request('POST'));
    expect(response.status).toBe(201);
    expect(mocks.tagYouTubeVideoWithMerch).toHaveBeenCalledWith({
      creatorProfileId,
      videoId,
      merchCardId,
      actorUserId: 'app-user-id',
    });
  });

  it('soft-removes an existing video to merch relationship', async () => {
    mocks.removeYouTubeVideoMerchTag.mockResolvedValue(true);
    const response = await DELETE(request('DELETE'));
    expect(response.status).toBe(200);
    expect(mocks.removeYouTubeVideoMerchTag).toHaveBeenCalledWith({
      creatorProfileId,
      videoId,
      merchCardId,
    });
  });
});
