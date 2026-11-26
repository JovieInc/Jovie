import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  entitlements: vi.fn(),
  session: vi.fn(),
  handleUpload: vi.fn(),
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: mocks.requireAuth,
}));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mocks.entitlements,
}));
vi.mock('@/lib/auth/session', () => ({
  getSessionContext: mocks.session,
}));
vi.mock('@vercel/blob/client', () => ({
  handleUploadPresigned: mocks.handleUpload,
}));
vi.mock('@/lib/blob-presigned', () => ({
  issueBlobPutUploadToken: vi.fn(),
}));
vi.mock('@/lib/audio/blob-path', () => ({
  getAudioBlobPathPrefix: () => 'promo/',
}));

describe('POST /api/promo-downloads/upload-token entitlements gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({
      userId: 'clerk_1',
      error: null,
    });
    mocks.entitlements.mockResolvedValue({ isPro: true });
    mocks.session.mockResolvedValue({
      profile: { id: 'profile_1' },
    });
    mocks.handleUpload.mockResolvedValue({ token: 'ok' });
  });

  it('returns 403 when entitlements.isPro is false', async () => {
    mocks.entitlements.mockResolvedValue({ isPro: false });

    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/promo-downloads/upload-token', {
        method: 'POST',
        body: JSON.stringify({}),
      }) as never
    );

    expect(response.status).toBe(403);
    expect(mocks.entitlements).toHaveBeenCalledOnce();
    expect(mocks.handleUpload).not.toHaveBeenCalled();
  });

  it('issues upload tokens for pro members', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/promo-downloads/upload-token', {
        method: 'POST',
        body: JSON.stringify({}),
      }) as never
    );

    expect(response.status).toBe(200);
    expect(mocks.handleUpload).toHaveBeenCalledOnce();
  });
});
