import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class LibraryRelationshipWriteError extends Error {
    readonly code: 'not_found' | 'conflict';
    constructor(code: 'not_found' | 'conflict', message: string) {
      super(message);
      this.name = 'LibraryRelationshipWriteError';
      this.code = code;
    }
  }
  return {
    requireLibraryProfileAccess: vi.fn(),
    tagMerchInYouTubeVideo: vi.fn(),
    untagMerchInYouTubeVideo: vi.fn(),
    LibraryRelationshipWriteError,
  };
});

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/library/track-drawer.server', () => ({
  requireLibraryProfileAccess: mocks.requireLibraryProfileAccess,
  tagMerchInYouTubeVideo: mocks.tagMerchInYouTubeVideo,
  untagMerchInYouTubeVideo: mocks.untagMerchInYouTubeVideo,
  LibraryRelationshipWriteError: mocks.LibraryRelationshipWriteError,
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

function authError(status: 401 | 403) {
  return {
    error: NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status }
    ),
  };
}

describe('library relationships route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireLibraryProfileAccess.mockResolvedValue({
      userId: 'app-user-id',
    });
  });

  it('rejects unauthenticated relationship writes', async () => {
    mocks.requireLibraryProfileAccess.mockResolvedValue(authError(401));
    const response = await POST(request('POST'));
    expect(response.status).toBe(401);
    expect(mocks.tagMerchInYouTubeVideo).not.toHaveBeenCalled();
  });

  it('rejects invalid relationship payloads', async () => {
    const response = await POST(
      new Request('http://localhost/api/library/relationships', {
        method: 'POST',
        body: JSON.stringify({ creatorProfileId, videoId }),
      })
    );
    expect(response.status).toBe(400);
    expect(mocks.requireLibraryProfileAccess).not.toHaveBeenCalled();
    expect(mocks.tagMerchInYouTubeVideo).not.toHaveBeenCalled();
  });

  it('does not write relationships across profiles', async () => {
    mocks.requireLibraryProfileAccess.mockResolvedValue(authError(403));
    const response = await POST(request('POST'));
    expect(response.status).toBe(403);
    expect(mocks.tagMerchInYouTubeVideo).not.toHaveBeenCalled();
  });

  it('records an artist-confirmed video to merch relationship', async () => {
    mocks.tagMerchInYouTubeVideo.mockResolvedValue({
      id: 'relationship-id',
    });
    const response = await POST(request('POST'));
    expect(response.status).toBe(200);
    expect(mocks.tagMerchInYouTubeVideo).toHaveBeenCalledWith({
      creatorProfileId,
      videoId,
      merchCardId,
    });
  });

  it('returns not found when the requested relationship target is absent', async () => {
    mocks.tagMerchInYouTubeVideo.mockRejectedValue(
      new mocks.LibraryRelationshipWriteError(
        'not_found',
        'Video or merch product not found'
      )
    );
    const response = await POST(request('POST'));
    expect(response.status).toBe(404);
  });

  it('soft-removes an existing video to merch relationship', async () => {
    mocks.untagMerchInYouTubeVideo.mockResolvedValue(undefined);
    const response = await DELETE(request('DELETE'));
    expect(response.status).toBe(200);
    expect(mocks.untagMerchInYouTubeVideo).toHaveBeenCalledWith({
      creatorProfileId,
      videoId,
      merchCardId,
    });
  });

  it('returns conflict when there is no active relationship to remove', async () => {
    mocks.untagMerchInYouTubeVideo.mockRejectedValue(
      new mocks.LibraryRelationshipWriteError(
        'conflict',
        'Active relationship not found'
      )
    );
    const response = await DELETE(request('DELETE'));
    expect(response.status).toBe(409);
  });
});
