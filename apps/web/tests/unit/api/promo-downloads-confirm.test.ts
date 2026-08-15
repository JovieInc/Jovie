import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_UPLOAD_POLICIES,
  SUPPORTED_AUDIO_MIME_TYPES,
} from '@/lib/audio/constants';

const hoisted = vi.hoisted(() => {
  const selectLimitMock = vi.fn();
  const selectWhereMock = vi.fn();
  const selectFromMock = vi.fn().mockReturnValue({ where: selectWhereMock });
  const selectMock = vi.fn().mockReturnValue({ from: selectFromMock });

  const insertReturningMock = vi.fn();
  const insertValuesMock = vi
    .fn()
    .mockReturnValue({ returning: insertReturningMock });
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

  return {
    requireAuthMock: vi.fn(),
    getSessionContextMock: vi.fn(),
    handleUploadMock: vi.fn(),
    selectMock,
    selectWhereMock,
    selectLimitMock,
    insertMock,
    insertValuesMock,
    insertReturningMock,
    captureErrorMock: vi.fn(),
  };
});

vi.mock('@vercel/blob/client', () => ({
  handleUpload: hoisted.handleUploadMock,
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuthMock,
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContextMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
    insert: hoisted.insertMock,
  },
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: {
    id: 'release.id',
    creatorProfileId: 'release.creatorProfileId',
  },
}));

vi.mock('@/lib/db/schema/promo-downloads', () => ({
  promoDownloads: {
    releaseId: 'promoDownload.releaseId',
    position: 'promoDownload.position',
  },
}));

vi.mock('@/lib/audio/blob-verifier', () => ({
  AudioBlobVerificationError: class AudioBlobVerificationError extends Error {},
  verifyAudioBlob: vi.fn().mockImplementation(({ fileName }) => {
    const wav = fileName.endsWith('.wav');
    return Promise.resolve({
      pathname: `jovie/audio/promo_download/clerk_user_123/file.${wav ? 'wav' : 'mp3'}`,
      url: `https://cdn.example.com/track.${wav ? 'wav' : 'mp3'}`,
      sizeBytes: 1024,
      contentType: wav ? 'audio/wav' : 'audio/mpeg',
      formatId: wav ? 'wav' : 'mp3',
      canonicalMimeType: wav ? 'audio/wav' : 'audio/mpeg',
      bytesInspected: 1024,
      latencyMs: 1,
    });
  }),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

const RELEASE_ID = '00000000-0000-4000-8000-000000000001';

function confirmRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/promo-downloads/confirm', {
    method: 'POST',
    body: JSON.stringify({
      releaseId: RELEASE_ID,
      title: 'Track',
      blobUrl: 'https://cdn.example.com/track.mp3',
      blobPathname: 'promo-downloads/track.mp3',
      fileName: 'track.mp3',
      fileSizeBytes: 1024,
      ...body,
    }),
  });
}

describe('promo downloads API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAuthMock.mockResolvedValue({
      userId: 'clerk_user_123',
      error: null,
    });
    hoisted.getSessionContextMock.mockResolvedValue({
      user: { isPro: true },
      profile: { id: 'profile_123' },
    });
    // The confirm route awaits `.where(...)` directly for the position lookup
    // and `.where(...).limit(1)` for the ownership lookup, so the where result
    // must be both thenable and chainable.
    const whereResult = Object.assign(Promise.resolve([{ max: -1 }]), {
      limit: hoisted.selectLimitMock,
    });
    hoisted.selectWhereMock.mockReturnValue(whereResult);
    hoisted.selectLimitMock.mockResolvedValue([{ id: RELEASE_ID }]);
    hoisted.insertReturningMock.mockResolvedValue([
      { id: 'promo_download_123' },
    ]);
  });

  it('issues a token scoped to the registry-derived promo policy', async () => {
    hoisted.handleUploadMock.mockResolvedValue({
      type: 'blob.generate-client-token',
    });

    const { POST } = await import(
      '@/app/api/promo-downloads/upload-token/route'
    );
    const response = await POST(
      new Request('http://localhost/api/promo-downloads/upload-token', {
        method: 'POST',
        body: JSON.stringify({ type: 'blob.generate-client-token' }),
      }) as never
    );

    expect(response.status).toBe(200);
    const options = hoisted.handleUploadMock.mock.calls[0][0];
    const token = await options.onBeforeGenerateToken(
      'jovie/audio/promo_download/clerk_user_123/track.mp3'
    );
    expect(token.maximumSizeInBytes).toBe(
      AUDIO_UPLOAD_POLICIES.promo_download.maxFileSizeBytes
    );
    expect(new Set(token.allowedContentTypes)).toEqual(
      new Set(SUPPORTED_AUDIO_MIME_TYPES)
    );
  });

  it('confirms a blank MIME upload and persists the canonical MIME', async () => {
    const { POST } = await import('@/app/api/promo-downloads/confirm/route');
    const response = await POST(
      confirmRequest({ fileName: 'track.mp3', fileMimeType: '' }) as never
    );

    expect(response.status).toBe(201);
    expect(hoisted.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ fileMimeType: 'audio/mpeg' })
    );
  });

  it('confirms an octet-stream MIME upload and persists the canonical MIME', async () => {
    const { POST } = await import('@/app/api/promo-downloads/confirm/route');
    const response = await POST(
      confirmRequest({
        fileName: 'song.wav',
        fileMimeType: 'application/octet-stream',
      }) as never
    );

    expect(response.status).toBe(201);
    expect(hoisted.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ fileMimeType: 'audio/wav' })
    );
  });

  it('rejects a contradictory non-audio MIME even with a supported extension', async () => {
    const { POST } = await import('@/app/api/promo-downloads/confirm/route');
    const response = await POST(
      confirmRequest({
        fileName: 'file.mp3',
        fileMimeType: 'text/plain',
      }) as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Unsupported audio file type',
    });
    expect(hoisted.insertMock).not.toHaveBeenCalled();
  });

  it('rejects an unsupported file type', async () => {
    const { POST } = await import('@/app/api/promo-downloads/confirm/route');
    const response = await POST(
      confirmRequest({
        fileName: 'notes.txt',
        fileMimeType: 'text/plain',
      }) as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Unsupported audio file type',
    });
    expect(hoisted.insertMock).not.toHaveBeenCalled();
  });

  it('rejects files over the promo size policy', async () => {
    const { POST } = await import('@/app/api/promo-downloads/confirm/route');
    const response = await POST(
      confirmRequest({
        fileMimeType: 'audio/mpeg',
        fileSizeBytes:
          AUDIO_UPLOAD_POLICIES.promo_download.maxFileSizeBytes + 1,
      }) as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'File too large' });
    expect(hoisted.insertMock).not.toHaveBeenCalled();
  });

  it('rejects non-Pro creators before inserting', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      user: { isPro: false },
      profile: { id: 'profile_123' },
    });

    const { POST } = await import('@/app/api/promo-downloads/confirm/route');
    const response = await POST(
      confirmRequest({ fileMimeType: 'audio/mpeg' }) as never
    );

    expect(response.status).toBe(403);
    expect(hoisted.insertMock).not.toHaveBeenCalled();
  });
});
