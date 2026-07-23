import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  getSessionContextMock: vi.fn(),
  handleUploadMock: vi.fn(),
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  insertValuesMock: vi.fn(),
  captureErrorMock: vi.fn(),
  headMock: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  head: hoisted.headMock,
}));

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
    position: 'promo.position',
    releaseId: 'promo.releaseId',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  eq: vi.fn((left: unknown, right: unknown) => [left, right]),
  sql: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

const RELEASE_ID = '00000000-0000-4000-8000-000000000001';

function createConfirmRequest(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/promo-downloads/confirm', {
    method: 'POST',
    body: JSON.stringify({
      releaseId: RELEASE_ID,
      title: 'Club mix',
      blobUrl: 'https://cdn.example.com/club-mix.mp3',
      blobPathname: 'promo/club-mix.mp3',
      fileName: 'club-mix.mp3',
      fileMimeType: 'audio/mpeg',
      fileSizeBytes: 1024,
      ...overrides,
    }),
  }) as never;
}

describe('promo download audio policy', () => {
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
    hoisted.headMock.mockResolvedValue({
      size: 1024,
      pathname: `promo-downloads/${RELEASE_ID}/club-mix-test.mp3`,
      contentType: 'audio/mpeg',
      url: 'https://cdn.example.com/club-mix.mp3',
    });
  });

  it('derives the Blob token policy from the canonical registry', async () => {
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
    hoisted.selectMock.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: RELEASE_ID }]),
        }),
      }),
    });
    const token = await options.onBeforeGenerateToken(
      `promo-downloads/${RELEASE_ID}/club-mix.m4a`,
      JSON.stringify({ releaseId: RELEASE_ID })
    );
    expect(token.maximumSizeInBytes).toBe(157_286_400);
    expect(token.allowedContentTypes).toEqual(
      expect.arrayContaining(['audio/mpeg', 'audio/m4a', 'audio/x-m4a'])
    );
  });

  it('rejects unsupported MIME before reading account or release data', async () => {
    const { POST } = await import('@/app/api/promo-downloads/confirm/route');
    const response = await POST(
      createConfirmRequest({ fileMimeType: 'audio/ogg' })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('Unsupported audio type'),
    });
    expect(hoisted.getSessionContextMock).not.toHaveBeenCalled();
    expect(hoisted.selectMock).not.toHaveBeenCalled();
    expect(hoisted.insertMock).not.toHaveBeenCalled();
  });

  it('rejects missing or oversized byte counts before persistence', async () => {
    const { POST } = await import('@/app/api/promo-downloads/confirm/route');

    const missingSize = await POST(
      createConfirmRequest({ fileSizeBytes: undefined })
    );
    expect(missingSize.status).toBe(400);

    const oversized = await POST(
      createConfirmRequest({ fileSizeBytes: 157_286_401 })
    );
    expect(oversized.status).toBe(400);
    await expect(oversized.json()).resolves.toEqual({
      error: 'Audio must be 150 MB or smaller.',
    });
    expect(hoisted.insertMock).not.toHaveBeenCalled();
  });

  it('persists canonical audio metadata after ownership and plan checks', async () => {
    hoisted.selectMock
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: RELEASE_ID }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ max: -1 }]),
        }),
      });
    hoisted.insertValuesMock.mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'promo_123' }]),
      }),
    });
    hoisted.insertMock.mockReturnValue({ values: hoisted.insertValuesMock });

    const { POST } = await import('@/app/api/promo-downloads/confirm/route');
    const response = await POST(
      createConfirmRequest({
        blobPathname: `promo-downloads/${RELEASE_ID}/club-mix-test.mp3`,
      })
    );

    expect(response.status).toBe(201);
    expect(hoisted.headMock).toHaveBeenCalledWith(
      'https://cdn.example.com/club-mix.mp3',
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) })
    );
    expect(hoisted.insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileMimeType: 'audio/mpeg',
        fileSizeBytes: 1024,
      })
    );
  });

  it('returns the existing record when the same Blob is confirmed again', async () => {
    const existingRecord = { id: 'promo_existing' };
    hoisted.selectMock
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: RELEASE_ID }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ max: 0 }]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existingRecord]),
          }),
        }),
      });
    hoisted.insertValuesMock.mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });
    hoisted.insertMock.mockReturnValue({ values: hoisted.insertValuesMock });

    const { POST } = await import('@/app/api/promo-downloads/confirm/route');
    const response = await POST(
      createConfirmRequest({
        blobPathname: `promo-downloads/${RELEASE_ID}/club-mix-test.mp3`,
        title: 'A different replay title',
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      promoDownload: existingRecord,
    });
  });

  it('rejects a Blob outside the owned release namespace', async () => {
    hoisted.selectMock.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: RELEASE_ID }]),
        }),
      }),
    });

    const { POST } = await import('@/app/api/promo-downloads/confirm/route');
    const response = await POST(
      createConfirmRequest({ blobPathname: 'promo-downloads/other/mix.mp3' })
    );

    expect(response.status).toBe(400);
    expect(hoisted.headMock).not.toHaveBeenCalled();
    expect(hoisted.insertMock).not.toHaveBeenCalled();
  });

  it('rejects caller metadata that differs from authoritative Blob metadata', async () => {
    hoisted.selectMock.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: RELEASE_ID }]),
        }),
      }),
    });

    const { POST } = await import('@/app/api/promo-downloads/confirm/route');
    const response = await POST(
      createConfirmRequest({
        blobPathname: `promo-downloads/${RELEASE_ID}/club-mix-test.mp3`,
        fileSizeBytes: 512,
      })
    );

    expect(response.status).toBe(400);
    expect(hoisted.insertMock).not.toHaveBeenCalled();
  });

  it('maps a timed-out Blob metadata lookup to a bounded verification error', async () => {
    hoisted.selectMock.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: RELEASE_ID }]),
        }),
      }),
    });
    hoisted.headMock.mockRejectedValueOnce(
      new DOMException('The operation was aborted', 'TimeoutError')
    );

    const { POST } = await import('@/app/api/promo-downloads/confirm/route');
    const response = await POST(
      createConfirmRequest({
        blobPathname: `promo-downloads/${RELEASE_ID}/club-mix-test.mp3`,
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Uploaded audio could not be verified.',
    });
    expect(hoisted.insertMock).not.toHaveBeenCalled();
  });
});
