import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: mockCaptureWarning,
}));

function createSelectChain(result: unknown[] = []) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
  mockDbSelect.mockReturnValue(chain);
  return chain;
}

function createProfileRejectingSelectChain(error: Error) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockRejectedValue(error),
  };
  mockDbSelect.mockReturnValue(chain);
  return chain;
}

function createUserRejectingSelectChain(error: Error) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockRejectedValue(error),
  };
  mockDbSelect.mockReturnValue(chain);
  return chain;
}

describe('press photo queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ready press photos for a profile', async () => {
    const photos = [
      {
        id: 'photo-1',
        blobUrl: 'https://example.com/original.avif',
        smallUrl: 'https://example.com/small.avif',
        mediumUrl: 'https://example.com/medium.avif',
        largeUrl: 'https://example.com/large.avif',
        originalFilename: 'press.avif',
        width: 1600,
        height: 900,
        status: 'ready',
        sortOrder: 0,
      },
    ];
    createSelectChain(photos);

    const { getPressPhotosByProfileId } = await import(
      '@/lib/db/queries/press-photos'
    );
    const result = await getPressPhotosByProfileId('profile-123');

    expect(result).toEqual(photos);
  });

  it('returns an empty array when the press-photo schema is unavailable', async () => {
    createProfileRejectingSelectChain(
      new Error('column "photo_type" does not exist')
    );

    const { getPressPhotosByProfileId } = await import(
      '@/lib/db/queries/press-photos'
    );
    const result = await getPressPhotosByProfileId('profile-123');

    expect(result).toEqual([]);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      '[press-photos] profile_photos press fields unavailable, returning empty',
      expect.any(Error),
      { profileId: 'profile-123' }
    );
  });

  it('returns an empty array for dashboard reads when the press-photo schema is unavailable', async () => {
    createUserRejectingSelectChain(
      new Error('column "photo_type" does not exist')
    );

    const { getPressPhotosByUserId } = await import(
      '@/lib/db/queries/press-photos'
    );
    const result = await getPressPhotosByUserId('user-123', 'profile-123');

    expect(result).toEqual([]);
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      '[press-photos] profile_photos press fields unavailable, returning empty',
      expect.any(Error),
      { userId: 'user-123', creatorProfileId: 'profile-123' }
    );
  });

  it('rethrows non-schema errors', async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error('connection timeout')),
    });

    const { getPressPhotosByProfileId } = await import(
      '@/lib/db/queries/press-photos'
    );

    await expect(getPressPhotosByProfileId('profile-123')).rejects.toThrow(
      'connection timeout'
    );
  });
});
