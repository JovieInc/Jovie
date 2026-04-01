import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getCachedAuthMock: vi.fn(),
  verifyOwnershipMock: vi.fn(),
  prepareMock: vi.fn(),
  captureErrorMock: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));

vi.mock('@/lib/submission-agent/service', () => ({
  verifySubmissionProfileOwnership: hoisted.verifyOwnershipMock,
  prepareMetadataSubmissions: hoisted.prepareMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

describe('POST /api/metadata-submissions/prepare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'clerk_123' });
    hoisted.verifyOwnershipMock.mockResolvedValue({ id: 'profile_123' });
    hoisted.prepareMock.mockResolvedValue({
      canonical: { artistName: 'Test Artist' },
      requests: [
        {
          requestId: 'request_123',
          providerId: 'xperi_allmusic_email',
          status: 'awaiting_approval',
          missingFields: [],
        },
      ],
    });
  });

  it('returns prepared requests for owned profiles', async () => {
    const { POST } = await import(
      '@/app/api/metadata-submissions/prepare/route'
    );

    const response = await POST(
      new Request('http://localhost/api/metadata-submissions/prepare', {
        method: 'POST',
        body: JSON.stringify({
          profileId: '11111111-1111-4111-8111-111111111111',
          releaseId: '22222222-2222-4222-8222-222222222222',
          providerIds: ['xperi_allmusic_email'],
        }),
      })
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(hoisted.prepareMock).toHaveBeenCalled();
  });

  it('returns 404 when the authenticated user does not own the profile', async () => {
    hoisted.verifyOwnershipMock.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/metadata-submissions/prepare/route'
    );

    const response = await POST(
      new Request('http://localhost/api/metadata-submissions/prepare', {
        method: 'POST',
        body: JSON.stringify({
          profileId: '11111111-1111-4111-8111-111111111111',
        }),
      })
    );

    expect(response.status).toBe(404);
  });
});
