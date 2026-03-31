import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  withDbSessionTxMock: vi.fn(),
  captureErrorMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: hoisted.withDbSessionTxMock,
}));

vi.mock('@/lib/db/queries/press-photos', () => ({
  getPressPhotosByUserId: vi.fn(),
}));

vi.mock('@/lib/db/queries/shared', () => ({
  getUserByClerkId: vi.fn(),
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'id', userId: 'userId' },
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

describe('GET /api/dashboard/press-photos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('captures errors before returning 500', async () => {
    const thrownError = new Error('Press photo query failed');
    hoisted.withDbSessionTxMock.mockRejectedValue(thrownError);

    const { GET } = await import('@/app/api/dashboard/press-photos/route');
    const response = await GET(
      new Request(
        'http://localhost/api/dashboard/press-photos?profileId=profile_123'
      )
    );

    expect(response.status).toBe(500);
    expect(hoisted.loggerErrorMock).toHaveBeenCalledWith(
      '[press-photos] Failed to load press photos:',
      thrownError
    );
    expect(hoisted.captureErrorMock).toHaveBeenCalledWith(
      'Dashboard press photos fetch failed',
      thrownError,
      {
        route: '/api/dashboard/press-photos',
        method: 'GET',
      }
    );
  });
});
