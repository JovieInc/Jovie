import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  withDbSessionTxMock: vi.fn(),
  captureErrorMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  del: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: hoisted.withDbSessionTxMock,
}));

vi.mock('@/lib/cache', () => ({
  invalidateProfileCache: vi.fn(),
}));

vi.mock('@/lib/db/queries/shared', () => ({
  getUserByClerkId: vi.fn(),
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'id', usernameNormalized: 'usernameNormalized' },
  profilePhotos: {
    id: 'id',
    blobUrl: 'blobUrl',
    smallUrl: 'smallUrl',
    mediumUrl: 'mediumUrl',
    largeUrl: 'largeUrl',
    creatorProfileId: 'creatorProfileId',
    userId: 'userId',
    photoType: 'photoType',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: hoisted.loggerErrorMock },
}));

describe('DELETE /api/images/press-photos/[photoId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('captures outer delete failures before returning 500', async () => {
    const thrownError = new Error('Delete failed');
    hoisted.withDbSessionTxMock.mockRejectedValue(thrownError);

    const { DELETE } = await import(
      '@/app/api/images/press-photos/[photoId]/route'
    );
    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ photoId: 'photo_123' }),
    });

    expect(response.status).toBe(500);
    expect(hoisted.loggerErrorMock).toHaveBeenCalledWith(
      '[press-photos] Failed to delete press photo:',
      thrownError
    );
    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'Press photo delete failed',
      thrownError,
      {
        route: '/api/images/press-photos/[photoId]',
        method: 'DELETE',
      }
    );
  });
});
