import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  listTeleprompterTakes: vi.fn(),
  saveTeleprompterTake: vi.fn(),
  setTeleprompterTakeKept: vi.fn(),
  deleteTeleprompterTake: vi.fn(),
  openTeleprompterTakeMedia: vi.fn(),
  handleUploadPresigned: vi.fn(),
  issueBlobPutUploadToken: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/require-auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/blob-presigned', () => ({
  issueBlobPutUploadToken: mocks.issueBlobPutUploadToken,
}));
vi.mock('@vercel/blob/client', () => ({
  handleUploadPresigned: mocks.handleUploadPresigned,
}));
vi.mock('@/lib/teleprompter/takes/server', () => {
  class TeleprompterTakeError extends Error {
    constructor(
      readonly code: string,
      readonly status: number
    ) {
      super(code);
    }
  }
  return {
    TeleprompterTakeError,
    listTeleprompterTakes: mocks.listTeleprompterTakes,
    saveTeleprompterTake: mocks.saveTeleprompterTake,
    setTeleprompterTakeKept: mocks.setTeleprompterTakeKept,
    deleteTeleprompterTake: mocks.deleteTeleprompterTake,
    openTeleprompterTakeMedia: mocks.openTeleprompterTakeMedia,
  };
});

import { GET as GET_MEDIA } from '@/app/api/teleprompter/takes/[takeId]/media/route';
import { DELETE, PATCH } from '@/app/api/teleprompter/takes/[takeId]/route';
import { GET, POST } from '@/app/api/teleprompter/takes/route';
import { POST as POST_TOKEN } from '@/app/api/teleprompter/takes/upload-token/route';
import { TeleprompterTakeError } from '@/lib/teleprompter/takes/server';

const TAKE_ID = '0b1e2c3d-4f50-4a6b-8c7d-9e0f1a2b3c4d';
const record = {
  schemaVersion: 1,
  takeId: TAKE_ID,
  videoPathname: `jovie/teleprompter/takes/user_1/${TAKE_ID}.webm`,
  contentType: 'video/webm',
  byteSize: 1024,
  durationMs: 5000,
  takeNumber: 1,
  title: 'Intro',
  kind: 'promo',
  source: 'script',
  kept: false,
  createdAt: '2026-11-08T00:00:00.000Z',
  updatedAt: '2026-11-08T00:00:00.000Z',
};
const params = { params: Promise.resolve({ takeId: TAKE_ID }) };
const listRequest = new NextRequest('https://jov.ie/api/teleprompter/takes');

function jsonRequest(method: string, body: unknown) {
  return new NextRequest('https://jov.ie/api/teleprompter/takes', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('teleprompter take routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ userId: 'user_1', error: null });
  });

  it('returns the auth error before touching storage', async () => {
    mocks.requireAuth.mockImplementation(async () => ({
      userId: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }));
    const denied = await GET(listRequest);
    expect(denied.status).toBe(401);
    expect(await denied.json()).toEqual({ error: 'Unauthorized' });
    expect((await DELETE(jsonRequest('DELETE', {}), params)).status).toBe(401);
    expect(mocks.listTeleprompterTakes).not.toHaveBeenCalled();
  });

  it('lists the owner takes as summaries without blob paths', async () => {
    mocks.listTeleprompterTakes.mockResolvedValue([record]);

    const response = await GET(listRequest);
    const body = await response.json();

    expect(mocks.listTeleprompterTakes).toHaveBeenCalledWith('user_1');
    expect(body.takes[0]).toMatchObject({
      takeId: TAKE_ID,
      mediaUrl: `/api/teleprompter/takes/${TAKE_ID}/media`,
    });
    expect(body.takes[0].videoPathname).toBeUndefined();
  });

  it('maps a take error to its status and an unknown error to 500', async () => {
    mocks.listTeleprompterTakes.mockRejectedValueOnce(
      new TeleprompterTakeError('take-not-found', 404)
    );
    const known = await GET(listRequest);
    expect(known.status).toBe(404);
    expect(await known.json()).toEqual({ error: 'take-not-found' });

    mocks.listTeleprompterTakes.mockRejectedValueOnce(new Error('blob down'));
    const unknown = await GET(listRequest);
    expect(unknown.status).toBe(500);
    expect(mocks.captureError).toHaveBeenCalled();
  });

  it('saves a valid take and rejects bad JSON or an invalid body', async () => {
    mocks.saveTeleprompterTake.mockResolvedValue(record);
    const valid = {
      takeId: TAKE_ID,
      contentType: 'video/webm',
      byteSize: 1024,
      durationMs: 5000,
      takeNumber: 1,
      title: 'Intro',
      kind: 'promo',
      source: 'script',
    };

    expect((await POST(jsonRequest('POST', valid))).status).toBe(201);
    expect(mocks.saveTeleprompterTake).toHaveBeenCalledWith(
      'user_1',
      expect.objectContaining({ takeId: TAKE_ID })
    );
    expect((await POST(jsonRequest('POST', '{nope'))).status).toBe(400);
    expect((await POST(jsonRequest('POST', { takeId: 'x' }))).status).toBe(422);

    mocks.saveTeleprompterTake.mockRejectedValueOnce(new Error('write failed'));
    expect((await POST(jsonRequest('POST', valid))).status).toBe(500);
  });

  it('keeps, rejects and deletes a take by id', async () => {
    mocks.setTeleprompterTakeKept.mockResolvedValue({ ...record, kept: true });

    const kept = await PATCH(jsonRequest('PATCH', { kept: true }), params);
    expect((await kept.json()).take.kept).toBe(true);
    expect(mocks.setTeleprompterTakeKept).toHaveBeenCalledWith(
      'user_1',
      TAKE_ID,
      true
    );
    expect((await PATCH(jsonRequest('PATCH', '{'), params)).status).toBe(400);
    expect(
      (await PATCH(jsonRequest('PATCH', { kept: 'yes' }), params)).status
    ).toBe(422);
    mocks.setTeleprompterTakeKept.mockRejectedValueOnce(
      new TeleprompterTakeError('take-not-found', 404)
    );
    expect(
      (await PATCH(jsonRequest('PATCH', { kept: false }), params)).status
    ).toBe(404);

    mocks.deleteTeleprompterTake.mockResolvedValue(undefined);
    const deleted = await DELETE(jsonRequest('DELETE', {}), params);
    expect(await deleted.json()).toEqual({ ok: true });
    mocks.deleteTeleprompterTake.mockRejectedValueOnce(new Error('nope'));
    expect((await DELETE(jsonRequest('DELETE', {}), params)).status).toBe(500);
  });

  it('streams media privately and passes a range through as 206', async () => {
    mocks.openTeleprompterTakeMedia.mockResolvedValue({
      stream: new ReadableStream(),
      blob: { contentType: 'video/webm', etag: '"e1"' },
      headers: new Headers({
        'accept-ranges': 'bytes',
        'content-length': '10',
        'content-range': 'bytes 0-9/100',
      }),
    });

    const response = await GET_MEDIA(
      new NextRequest('https://jov.ie/x', { headers: { range: 'bytes=0-9' } }),
      params
    );

    expect(mocks.openTeleprompterTakeMedia).toHaveBeenCalledWith(
      'user_1',
      TAKE_ID,
      'bytes=0-9'
    );
    expect(response.status).toBe(206);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-range')).toBe('bytes 0-9/100');

    mocks.openTeleprompterTakeMedia.mockRejectedValueOnce(
      new TeleprompterTakeError('take-media-unavailable', 404)
    );
    expect(
      (await GET_MEDIA(new NextRequest('https://jov.ie/x'), params)).status
    ).toBe(404);
  });

  it('signs uploads only for the owner path', async () => {
    mocks.issueBlobPutUploadToken.mockResolvedValue('signed');
    mocks.handleUploadPresigned.mockImplementation(
      async ({
        getSignedToken,
        body,
      }: {
        getSignedToken: (pathname: string) => Promise<string>;
        body: { pathname: string };
      }) => ({ token: await getSignedToken(body.pathname) })
    );
    const tokenRequest = (pathname: string) =>
      new NextRequest('https://jov.ie/api/teleprompter/takes/upload-token', {
        method: 'POST',
        body: JSON.stringify({ pathname }),
      });

    const owned = await POST_TOKEN(tokenRequest(record.videoPathname));
    expect(await owned.json()).toEqual({ token: 'signed' });
    expect(mocks.issueBlobPutUploadToken).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: record.videoPathname })
    );

    const foreign = await POST_TOKEN(
      tokenRequest(`jovie/teleprompter/takes/user_2/${TAKE_ID}.webm`)
    );
    expect(foreign.status).toBe(422);
    expect(await foreign.json()).toEqual({ error: 'invalid-take-path' });
  });
});
