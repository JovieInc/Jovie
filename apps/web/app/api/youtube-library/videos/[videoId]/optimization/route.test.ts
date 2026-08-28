import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  getExactProfileAccess: vi.fn(),
  getYouTubeOptimizationSnapshotForProfile: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.getCachedAuth }));
vi.mock('@/lib/auth/profile-access', () => ({
  getExactProfileAccess: mocks.getExactProfileAccess,
}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/youtube-library/queries', () => ({
  getYouTubeOptimizationSnapshotForProfile:
    mocks.getYouTubeOptimizationSnapshotForProfile,
}));

import { GET } from './route';

const profileId = '11111111-1111-4111-8111-111111111111';
const videoId = '22222222-2222-4222-8222-222222222222';

function request() {
  return new Request(
    `http://localhost/api/youtube-library/videos/${videoId}/optimization?creatorProfileId=${profileId}`
  );
}

describe('YouTube optimization snapshot route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedAuth.mockResolvedValue({ userId: 'app-user-id' });
    mocks.getExactProfileAccess.mockResolvedValue({
      ok: true,
      profileId,
      ownerUserId: 'app-user-id',
    });
  });

  it('rejects cross-profile reads', async () => {
    mocks.getExactProfileAccess.mockResolvedValue({
      ok: false,
      reason: 'forbidden',
    });
    const response = await GET(request(), {
      params: Promise.resolve({ videoId }),
    });
    expect(response.status).toBe(403);
    expect(
      mocks.getYouTubeOptimizationSnapshotForProfile
    ).not.toHaveBeenCalled();
  });

  it('returns the scoped thumbnail, metric, and experiment history', async () => {
    mocks.getYouTubeOptimizationSnapshotForProfile.mockResolvedValue({
      thumbnails: [],
      metrics: [],
      experiments: [],
    });
    const response = await GET(request(), {
      params: Promise.resolve({ videoId }),
    });
    expect(response.status).toBe(200);
    expect(mocks.getYouTubeOptimizationSnapshotForProfile).toHaveBeenCalledWith(
      { creatorProfileId: profileId, videoId }
    );
  });
});
