import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAlbumArtUserMock: vi.fn(),
  parseAlbumArtRequestBodyMock: vi.fn(),
  getOwnedChatProfileMock: vi.fn(),
  generateAlbumArtForChatMock: vi.fn(),
  captureErrorMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@/app/api/chat/album-art/shared', () => ({
  requireAlbumArtUser: hoisted.requireAlbumArtUserMock,
  parseAlbumArtRequestBody: hoisted.parseAlbumArtRequestBodyMock,
}));

vi.mock('@/lib/chat/profile-ownership', () => ({
  getOwnedChatProfile: hoisted.getOwnedChatProfileMock,
}));

vi.mock('@/lib/services/album-art/generate', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/services/album-art/generate')>();
  return {
    ...actual,
    generateAlbumArtForChat: hoisted.generateAlbumArtForChatMock,
  };
});

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: hoisted.loggerErrorMock },
}));

describe('POST /api/chat/album-art/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when the authenticated user does not own the profile', async () => {
    hoisted.requireAlbumArtUserMock.mockResolvedValue({
      ok: true,
      userId: 'user_123',
    });
    hoisted.parseAlbumArtRequestBodyMock.mockResolvedValue({
      ok: true,
      data: {
        profileId: 'a0000000-0000-4000-8000-000000000001',
        releaseTitle: 'Midnight Drive',
      },
    });
    hoisted.getOwnedChatProfileMock.mockResolvedValue(null);

    const { POST } = await import('@/app/api/chat/album-art/generate/route');
    const response = await POST(
      new Request('http://localhost/api/chat/album-art/generate')
    );

    expect(response.status).toBe(404);
  });

  it('passes the canonical artist name into the shared generation service', async () => {
    hoisted.requireAlbumArtUserMock.mockResolvedValue({
      ok: true,
      userId: 'user_123',
    });
    hoisted.parseAlbumArtRequestBodyMock.mockResolvedValue({
      ok: true,
      data: {
        profileId: 'a0000000-0000-4000-8000-000000000001',
        releaseTitle: 'Midnight Drive',
      },
    });
    hoisted.getOwnedChatProfileMock.mockResolvedValue({
      id: 'a0000000-0000-4000-8000-000000000001',
      internalUserId: 'internal_1',
      displayName: 'Tim White',
      bio: null,
      username: 'tim',
    });
    hoisted.generateAlbumArtForChatMock.mockResolvedValue({
      success: false,
      retryable: false,
      error: 'Album art is temporarily unavailable.',
    });

    const { POST } = await import('@/app/api/chat/album-art/generate/route');
    const response = await POST(
      new Request('http://localhost/api/chat/album-art/generate')
    );

    expect(response.status).toBe(200);
    expect(hoisted.generateAlbumArtForChatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        artistName: 'Tim White',
        clerkUserId: 'user_123',
      })
    );
  });
});
