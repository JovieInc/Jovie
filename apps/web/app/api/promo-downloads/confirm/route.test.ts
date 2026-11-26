import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  entitlements: vi.fn(),
  session: vi.fn(),
  capture: vi.fn(),
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
vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.capture,
}));
vi.mock('@/lib/audio/blob-verifier', () => ({
  AudioBlobVerificationError: class extends Error {},
  verifyAudioBlob: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
          orderBy: () => Promise.resolve([]),
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve([]),
      }),
    }),
  },
}));

describe('POST /api/promo-downloads/confirm entitlements gate', () => {
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
  });

  it('returns 403 when entitlements.isPro is false', async () => {
    mocks.entitlements.mockResolvedValue({ isPro: false });

    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/promo-downloads/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releaseId: '11111111-1111-4111-8111-111111111111',
          title: 'Track',
          blobUrl: 'https://blob.example/file.mp3',
          blobPathname: 'promo/file.mp3',
          fileName: 'file.mp3',
          fileMimeType: 'audio/mpeg',
        }),
      }) as never
    );

    expect(response.status).toBe(403);
    expect(mocks.entitlements).toHaveBeenCalledOnce();
    expect(mocks.session).not.toHaveBeenCalled();
  });
});
