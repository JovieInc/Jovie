import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireLibraryProfileAccess: vi.fn(),
  loadYouTubeOptimizationSnapshot: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/library/track-drawer.server', () => ({
  requireLibraryProfileAccess: mocks.requireLibraryProfileAccess,
  loadYouTubeOptimizationSnapshot: mocks.loadYouTubeOptimizationSnapshot,
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
    mocks.requireLibraryProfileAccess.mockResolvedValue({
      userId: 'app-user-id',
    });
  });

  it('rejects cross-profile reads', async () => {
    mocks.requireLibraryProfileAccess.mockResolvedValue({
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const response = await GET(request(), {
      params: Promise.resolve({ videoId }),
    });
    expect(response.status).toBe(403);
    expect(mocks.loadYouTubeOptimizationSnapshot).not.toHaveBeenCalled();
  });

  it('returns the scoped thumbnail, metric, and experiment history', async () => {
    mocks.loadYouTubeOptimizationSnapshot.mockResolvedValue({
      thumbnails: [],
      metrics: [],
      experiments: [],
    });
    const response = await GET(request(), {
      params: Promise.resolve({ videoId }),
    });
    expect(response.status).toBe(200);
    expect(mocks.loadYouTubeOptimizationSnapshot).toHaveBeenCalledWith({
      creatorProfileId: profileId,
      videoId,
    });
  });
});
