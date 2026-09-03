import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  handleUploadPresignedMock: vi.fn(),
  issueSignedTokenMock: vi.fn(),
}));

vi.mock('@vercel/blob/client', () => ({
  handleUploadPresigned: hoisted.handleUploadPresignedMock,
}));

vi.mock('@vercel/blob', () => ({
  issueSignedToken: hoisted.issueSignedTokenMock,
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuthMock,
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContextMock,
}));

const OWNER = 'clerk_user_123';
const FIVE_HUNDRED_MIB = 500 * 1024 * 1024;

async function callRoute() {
  const { POST } = await import('@/app/api/chat/files/upload-token/route');
  return POST(
    new Request('http://localhost/api/chat/files/upload-token', {
      method: 'POST',
      body: JSON.stringify({ type: 'blob.generate-presigned-url' }),
    }) as never
  );
}

describe('chat files upload token API (JOV-5872)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAuthMock.mockResolvedValue({ userId: OWNER, error: null });
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.issueSignedTokenMock.mockResolvedValue({
      delegationToken: 'delegation',
      clientSigningToken: 'signing',
      validUntil: Date.now() + 60_000,
    });
  });

  it('signs owner-scoped chat paths with the file-policy MIME set and size', async () => {
    hoisted.handleUploadPresignedMock.mockResolvedValue({
      type: 'blob.generate-presigned-url',
    });

    const response = await callRoute();
    expect(response.status).toBe(200);

    const options = hoisted.handleUploadPresignedMock.mock.calls[0][0];
    const pathname = `jovie/files/chat/${OWNER}/uuid-master.mov`;
    const { urlOptions } = await options.getSignedToken(pathname, null, false);

    expect(urlOptions.maximumSizeInBytes).toBe(FIVE_HUNDRED_MIB);
    expect(urlOptions.allowedContentTypes).toContain('image/jpeg');
    expect(urlOptions.allowedContentTypes).toContain('video/quicktime');
    expect(urlOptions.allowedContentTypes).toContain('application/pdf');
    expect(urlOptions.allowedContentTypes).not.toContain(
      'application/octet-stream'
    );
    expect(urlOptions.allowedContentTypes).not.toContain('image/heic');
    expect(hoisted.issueSignedTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname,
        operations: ['put'],
        maximumSizeInBytes: FIVE_HUNDRED_MIB,
      })
    );
  });

  it('restricts account_video paths to video MIME types', async () => {
    hoisted.handleUploadPresignedMock.mockResolvedValue({
      type: 'blob.generate-presigned-url',
    });
    await callRoute();

    const options = hoisted.handleUploadPresignedMock.mock.calls[0][0];
    const { urlOptions } = await options.getSignedToken(
      `jovie/files/account_video/${OWNER}/uuid-walk.webm`,
      null,
      false
    );
    expect(urlOptions.allowedContentTypes).toContain('video/webm');
    expect(urlOptions.allowedContentTypes).not.toContain('image/jpeg');
  });

  it('refuses foreign-owner and root-level pathnames before signing', async () => {
    hoisted.handleUploadPresignedMock.mockResolvedValue({
      type: 'blob.generate-presigned-url',
    });
    await callRoute();

    const options = hoisted.handleUploadPresignedMock.mock.calls[0][0];
    await expect(
      options.getSignedToken(
        'jovie/files/chat/other_user/uuid-a.jpg',
        null,
        false
      )
    ).rejects.toThrow('Invalid file upload pathname');
    await expect(
      options.getSignedToken('IMG_0001.jpg', null, false)
    ).rejects.toThrow('Invalid file upload pathname');
    expect(hoisted.issueSignedTokenMock).not.toHaveBeenCalled();
  });

  it('surfaces the pathname rule as a 400 client error', async () => {
    hoisted.handleUploadPresignedMock.mockRejectedValue(
      new Error('Invalid file upload pathname')
    );

    const response = await callRoute();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid file upload pathname',
    });
  });

  it('requires a creator profile', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({ profile: null });
    hoisted.handleUploadPresignedMock.mockResolvedValue({
      type: 'blob.generate-presigned-url',
    });
    await callRoute();

    const options = hoisted.handleUploadPresignedMock.mock.calls[0][0];
    await expect(
      options.getSignedToken(
        `jovie/files/chat/${OWNER}/uuid-a.jpg`,
        null,
        false
      )
    ).rejects.toThrow('Creator profile not found');
  });
});
