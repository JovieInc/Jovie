import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const selectLimitMock = vi.fn();
  const selectOrderByMock = vi.fn().mockReturnValue({ limit: selectLimitMock });
  const selectWhereMock = vi
    .fn()
    .mockReturnValue({ orderBy: selectOrderByMock });
  const selectInnerJoinSecondMock = vi
    .fn()
    .mockReturnValue({ where: selectWhereMock });
  const selectInnerJoinFirstMock = vi.fn().mockReturnValue({
    innerJoin: selectInnerJoinSecondMock,
  });
  const selectFromMock = vi.fn().mockReturnValue({
    innerJoin: selectInnerJoinFirstMock,
  });
  const selectMock = vi.fn().mockReturnValue({ from: selectFromMock });

  const updateWhereMock = vi.fn();
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
  const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

  return {
    requireAuthMock: vi.fn(),
    getSessionContextMock: vi.fn(),
    handleUploadMock: vi.fn(),
    resolvePrimaryRecordingForReleaseMock: vi.fn(),
    selectMock,
    selectLimitMock,
    updateMock,
    updateSetMock,
    updateWhereMock,
    revalidateTagMock: vi.fn(),
    captureErrorMock: vi.fn(),
  };
});

vi.mock('@vercel/blob/client', () => ({
  handleUpload: hoisted.handleUploadMock,
}));

vi.mock('next/cache', () => ({
  revalidateTag: hoisted.revalidateTagMock,
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuthMock,
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContextMock,
}));

vi.mock('@/lib/cache/tags', () => ({
  createSmartLinkContentTag: (profileId: string) =>
    `smart-link-content:${profileId}`,
}));

vi.mock('@/lib/audio/resolve-release-recording', () => ({
  resolvePrimaryRecordingForRelease:
    hoisted.resolvePrimaryRecordingForReleaseMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
    update: hoisted.updateMock,
  },
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: {
    id: 'release.id',
    creatorProfileId: 'release.creatorProfileId',
  },
  discogReleaseTracks: {
    releaseId: 'releaseTrack.releaseId',
    recordingId: 'releaseTrack.recordingId',
    discNumber: 'releaseTrack.discNumber',
    trackNumber: 'releaseTrack.trackNumber',
  },
  discogRecordings: {
    id: 'recording.id',
    creatorProfileId: 'recording.creatorProfileId',
    previewUrl: 'recording.previewUrl',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

describe('library audio upload API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAuthMock.mockResolvedValue({
      userId: 'clerk_user_123',
      error: null,
    });
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
  });

  it('generates a Blob client upload token for authenticated creators', async () => {
    hoisted.handleUploadMock.mockResolvedValue({
      type: 'blob.generate-client-token',
    });

    const { POST } = await import('@/app/api/library/audio/upload-token/route');
    const response = await POST(
      new Request('http://localhost/api/library/audio/upload-token', {
        method: 'POST',
        body: JSON.stringify({ type: 'blob.generate-client-token' }),
      }) as never
    );

    expect(response.status).toBe(200);
    expect(hoisted.handleUploadMock).toHaveBeenCalledTimes(1);
    const options = hoisted.handleUploadMock.mock.calls[0][0];
    const token = await options.onBeforeGenerateToken('take-me-over.mp3');
    expect(token.maximumSizeInBytes).toBe(150 * 1024 * 1024);
    expect(token.allowedContentTypes).toContain('audio/mpeg');
  });

  it('attaches uploaded audio to the first recording for an owned release', async () => {
    hoisted.resolvePrimaryRecordingForReleaseMock.mockResolvedValue({
      recordingId: 'recording_123',
      previewUrl: null,
      audioUrl: null,
      durationMs: null,
      metadata: {},
    });
    hoisted.updateWhereMock.mockResolvedValue({ rowCount: 1 });

    const { POST } = await import('@/app/api/library/audio/confirm/route');
    const response = await POST(
      new Request('http://localhost/api/library/audio/confirm', {
        method: 'POST',
        body: JSON.stringify({
          releaseId: '00000000-0000-4000-8000-000000000001',
          blobUrl: 'https://cdn.example.com/take-me-over.mp3',
          blobPathname: 'library/audio/take-me-over.mp3',
          fileName: 'take-me-over.mp3',
          fileMimeType: 'audio/mpeg',
          fileSizeBytes: 1024,
        }),
      }) as never
    );

    expect(response.status).toBe(200);
    expect(hoisted.updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        previewUrl: 'https://cdn.example.com/take-me-over.mp3',
        audioUrl: 'https://cdn.example.com/take-me-over.mp3',
        audioFormat: 'audio/mpeg',
      })
    );
    expect(hoisted.revalidateTagMock).toHaveBeenCalledWith(
      'releases:clerk_user_123:profile_123',
      'max'
    );
  });

  it('refuses to overwrite existing release audio', async () => {
    hoisted.resolvePrimaryRecordingForReleaseMock.mockResolvedValue({
      recordingId: 'recording_123',
      previewUrl: 'https://cdn.example.com/existing.mp3',
      audioUrl: 'https://cdn.example.com/existing.mp3',
      durationMs: 180_000,
      metadata: {},
    });

    const { POST } = await import('@/app/api/library/audio/confirm/route');
    const response = await POST(
      new Request('http://localhost/api/library/audio/confirm', {
        method: 'POST',
        body: JSON.stringify({
          releaseId: '00000000-0000-4000-8000-000000000001',
          blobUrl: 'https://cdn.example.com/take-me-over.mp3',
          blobPathname: 'library/audio/take-me-over.mp3',
          fileName: 'take-me-over.mp3',
          fileMimeType: 'audio/mpeg',
          fileSizeBytes: 1024,
        }),
      }) as never
    );

    expect(response.status).toBe(409);
    expect(hoisted.updateMock).not.toHaveBeenCalled();
  });

  it('returns 403 without resolving or mutating a recording when the caller has no creator profile', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({ profile: null });

    const { POST } = await import('@/app/api/library/audio/confirm/route');
    const response = await POST(
      new Request('http://localhost/api/library/audio/confirm', {
        method: 'POST',
        body: JSON.stringify({
          releaseId: '00000000-0000-4000-8000-000000000001',
          blobUrl: 'https://cdn.example.com/take-me-over.mp3',
          blobPathname: 'library/audio/take-me-over.mp3',
          fileName: 'take-me-over.mp3',
          fileMimeType: 'audio/mpeg',
          fileSizeBytes: 1024,
        }),
      }) as never
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Creator profile not found',
    });
    expect(
      hoisted.resolvePrimaryRecordingForReleaseMock
    ).not.toHaveBeenCalled();
    expect(hoisted.updateMock).not.toHaveBeenCalled();
  });

  it('returns 404 without mutating when the release is not owned by the requesting profile', async () => {
    // resolvePrimaryRecordingForRelease scopes its join by creatorProfileId, so a
    // release owned by someone else resolves to no row — same as "not found".
    hoisted.resolvePrimaryRecordingForReleaseMock.mockResolvedValue(null);

    const { POST } = await import('@/app/api/library/audio/confirm/route');
    const response = await POST(
      new Request('http://localhost/api/library/audio/confirm', {
        method: 'POST',
        body: JSON.stringify({
          releaseId: '00000000-0000-4000-8000-000000000002',
          blobUrl: 'https://cdn.example.com/take-me-over.mp3',
          blobPathname: 'library/audio/take-me-over.mp3',
          fileName: 'take-me-over.mp3',
          fileMimeType: 'audio/mpeg',
          fileSizeBytes: 1024,
        }),
      }) as never
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Release recording not found',
    });
    expect(hoisted.updateMock).not.toHaveBeenCalled();
    expect(hoisted.revalidateTagMock).not.toHaveBeenCalled();
  });
});
