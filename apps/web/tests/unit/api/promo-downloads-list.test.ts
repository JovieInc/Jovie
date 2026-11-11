import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const orderByMock = vi.fn();
  const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  const selectMock = vi.fn().mockReturnValue({ from: fromMock });
  return {
    requireAuthMock: vi.fn(),
    getSessionContextMock: vi.fn(),
    selectMock,
    whereMock,
    orderByMock,
    eqMock: vi.fn((column: string, value: unknown) => ({ column, value })),
    captureErrorMock: vi.fn(),
  };
});

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuthMock,
}));
vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContextMock,
}));
vi.mock('@/lib/db', () => ({ db: { select: hoisted.selectMock } }));
vi.mock('@/lib/db/schema/content', () => ({ discogReleases: {} }));
vi.mock('@/lib/db/schema/promo-downloads', () => ({
  promoDownloads: {
    id: 'pd.id',
    title: 'pd.title',
    fileName: 'pd.fileName',
    fileMimeType: 'pd.fileMimeType',
    fileSizeBytes: 'pd.fileSizeBytes',
    isActive: 'pd.isActive',
    position: 'pd.position',
    releaseId: 'pd.releaseId',
    creatorProfileId: 'pd.creatorProfileId',
    fileUrl: 'pd.fileUrl',
  },
}));
vi.mock('@/lib/audio/blob-verifier', () => ({
  AudioBlobVerificationError: class extends Error {},
  verifyAudioBlob: vi.fn(),
}));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...parts: unknown[]) => parts),
  asc: vi.fn((column: string) => `asc(${column})`),
  eq: hoisted.eqMock,
  sql: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureErrorMock,
}));

const RELEASE_ID = '00000000-0000-4000-8000-000000000001';
const listRequest = (query: string) =>
  new NextRequest(`http://localhost/api/promo-downloads/confirm?${query}`);

describe('GET /api/promo-downloads/confirm (list)', () => {
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
    hoisted.orderByMock.mockResolvedValue([
      {
        id: 'pd_1',
        title: 'Track',
        fileName: 'track.mp3',
        fileMimeType: 'audio/mpeg',
        fileSizeBytes: 1024,
        isActive: false,
        position: 0,
      },
    ]);
  });

  it("lists the caller's files for the release, without the blob pathname", async () => {
    const { GET } = await import('@/app/api/promo-downloads/confirm/route');
    const res = await GET(listRequest(`releaseId=${RELEASE_ID}&list=true`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files).toHaveLength(1);
    expect(body.files[0].id).toBe('pd_1');
    const selected = hoisted.selectMock.mock.calls[0][0];
    expect(Object.keys(selected)).not.toContain('fileUrl');
    expect(hoisted.eqMock).toHaveBeenCalledWith('pd.releaseId', RELEASE_ID);
    expect(hoisted.eqMock).toHaveBeenCalledWith(
      'pd.creatorProfileId',
      'profile_123'
    );
    expect(hoisted.orderByMock).toHaveBeenCalledWith('asc(pd.position)');
  });

  it('rejects a request without a valid release id', async () => {
    const { GET } = await import('@/app/api/promo-downloads/confirm/route');
    const res = await GET(listRequest('releaseId=nope&list=true'));
    expect(res.status).toBe(400);
    expect(hoisted.selectMock).not.toHaveBeenCalled();
  });

  it('refuses a caller with no creator profile', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      user: { isPro: true },
      profile: null,
    });
    const { GET } = await import('@/app/api/promo-downloads/confirm/route');
    const res = await GET(listRequest(`releaseId=${RELEASE_ID}&list=true`));
    expect(res.status).toBe(403);
    expect(hoisted.selectMock).not.toHaveBeenCalled();
  });

  it('returns the auth error when signed out', async () => {
    hoisted.requireAuthMock.mockResolvedValue({
      userId: null,
      error: new Response(null, { status: 401 }),
    });
    const { GET } = await import('@/app/api/promo-downloads/confirm/route');
    const res = await GET(listRequest(`releaseId=${RELEASE_ID}&list=true`));
    expect(res.status).toBe(401);
  });
});
