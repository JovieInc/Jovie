import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSessionContext,
  captureCreatorIdea,
  listCreatorDocuments,
  requireCreatorDocumentAccess,
} = vi.hoisted(() => ({
  getSessionContext: vi.fn(),
  captureCreatorIdea: vi.fn(),
  listCreatorDocuments: vi.fn(),
  requireCreatorDocumentAccess: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext,
  isUnauthorizedSessionError: (error: unknown) =>
    error instanceof Error && error.message === 'Unauthorized',
}));
vi.mock('@/lib/db/creator-documents/store', () => ({
  captureCreatorIdea,
  listCreatorDocuments,
}));
vi.mock('@/lib/creator-documents/access', () => ({
  requireCreatorDocumentAccess,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { GET, POST } from './route';

describe('/api/library/documents privacy boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes idea capture to the authenticated creator profile', async () => {
    getSessionContext.mockResolvedValueOnce({
      profile: { id: '22222222-2222-4222-8222-222222222222' },
      user: { id: 'user_1' },
    });
    captureCreatorIdea.mockResolvedValueOnce({
      documentId: '11111111-1111-4111-8111-111111111111',
      deduplicated: false,
    });

    const response = await POST(
      new Request('https://jov.ie/api/library/documents', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Private idea',
          body: 'Creator-only body',
          idempotencyKey: 'capture-key-123',
          creatorProfileId: 'attacker-controlled-profile',
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(captureCreatorIdea).toHaveBeenCalledWith({
      creatorProfileId: '22222222-2222-4222-8222-222222222222',
      userId: 'user_1',
      title: 'Private idea',
      body: 'Creator-only body',
      idempotencyKey: 'capture-key-123',
    });
    expect(requireCreatorDocumentAccess).toHaveBeenCalledWith({
      userId: 'user_1',
      profileId: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('does not list private documents without a session', async () => {
    getSessionContext.mockRejectedValueOnce(new Error('Unauthorized'));
    const response = await GET();
    expect(response.status).toBe(401);
    expect(listCreatorDocuments).not.toHaveBeenCalled();
  });

  it('returns 200 when an identical private capture is deduplicated', async () => {
    getSessionContext.mockResolvedValueOnce({
      profile: { id: '22222222-2222-4222-8222-222222222222' },
      user: { id: '33333333-3333-4333-8333-333333333333' },
    });
    captureCreatorIdea.mockResolvedValueOnce({
      documentId: '11111111-1111-4111-8111-111111111111',
      deduplicated: true,
    });

    const response = await POST(
      new Request('https://jov.ie/api/library/documents', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Private idea',
          body: 'Creator-only body',
          idempotencyKey: 'capture-key-123',
        }),
      })
    );

    expect(response.status).toBe(200);
  });
});
