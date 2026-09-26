import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  verifyFileBlobMock: vi.fn(),
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuthMock,
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContextMock,
}));

vi.mock('@/lib/media/file-blob-verifier', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/media/file-blob-verifier')
  >('@/lib/media/file-blob-verifier');
  return {
    ...actual,
    verifyFileBlob: hoisted.verifyFileBlobMock,
  };
});

const OWNER = 'clerk_user_123';

async function callRoute(body: unknown) {
  const { POST } = await import('@/app/api/chat/files/confirm/route');
  return POST(
    new Request('http://localhost/api/chat/files/confirm', {
      method: 'POST',
      body: JSON.stringify(body),
    }) as never
  );
}

describe('chat files confirm API (JOV-5872)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAuthMock.mockResolvedValue({ userId: OWNER, error: null });
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
  });

  it('verifies the blob and returns its canonical URL + content type', async () => {
    hoisted.verifyFileBlobMock.mockResolvedValue({
      pathname: `jovie/files/chat/${OWNER}/uuid-photo.jpg`,
      url: 'https://blob.example/uuid-photo.jpg',
      sizeBytes: 1024,
      contentType: 'image/jpeg',
      formatId: 'jpeg',
      canonicalMimeType: 'image/jpeg',
      bytesInspected: 4096,
      latencyMs: 5,
    });

    const response = await callRoute({
      blobPathname: `jovie/files/chat/${OWNER}/uuid-photo.jpg`,
      fileName: 'photo.jpg',
      fileMimeType: 'image/jpeg',
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      blobUrl: 'https://blob.example/uuid-photo.jpg',
      contentType: 'image/jpeg',
    });
    expect(hoisted.verifyFileBlobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        blobPathname: `jovie/files/chat/${OWNER}/uuid-photo.jpg`,
        userId: OWNER,
        surface: 'chat',
        fileName: 'photo.jpg',
        fileMimeType: 'image/jpeg',
      })
    );
  });

  it('maps a magic-byte mismatch to a 400 with the rejection code', async () => {
    const { FileBlobVerificationError } = await vi.importActual<
      typeof import('@/lib/media/file-blob-verifier')
    >('@/lib/media/file-blob-verifier');
    hoisted.verifyFileBlobMock.mockRejectedValue(
      new FileBlobVerificationError(
        'file.blob_mismatch',
        'The stored bytes do not match the declared file type.'
      )
    );

    const response = await callRoute({
      blobPathname: `jovie/files/chat/${OWNER}/uuid-photo.jpg`,
      fileName: 'photo.jpg',
      fileMimeType: 'image/jpeg',
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe('file.blob_mismatch');
  });

  it('rejects a malformed request body before verifying', async () => {
    const response = await callRoute({ fileName: '' });
    expect(response.status).toBe(400);
    expect(hoisted.verifyFileBlobMock).not.toHaveBeenCalled();
  });

  it('requires a creator profile', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({ profile: null });

    const response = await callRoute({
      blobPathname: `jovie/files/chat/${OWNER}/uuid-photo.jpg`,
      fileName: 'photo.jpg',
      fileMimeType: 'image/jpeg',
    });

    expect(response.status).toBe(403);
    expect(hoisted.verifyFileBlobMock).not.toHaveBeenCalled();
  });
});
