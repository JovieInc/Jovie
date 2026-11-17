import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { uploadPresigned } = vi.hoisted(() => ({ uploadPresigned: vi.fn() }));
vi.mock('@vercel/blob/client', () => ({ uploadPresigned }));

import {
  deleteTeleprompterTakeClient,
  resolveTakeContentType,
  setTeleprompterTakeKeptClient,
  uploadTeleprompterTake,
} from './client';

const TAKE_ID = '0b1e2c3d-4f50-4a6b-8c7d-9e0f1a2b3c4d';
const summary = { takeId: TAKE_ID, kept: true };

function respond(status: number, body: unknown) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('teleprompter take client', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps supported recorder types and falls back to webm', () => {
    expect(resolveTakeContentType('video/mp4;codecs=avc1')).toBe('video/mp4');
    expect(resolveTakeContentType('video/webm;codecs=vp9')).toBe('video/webm');
    expect(resolveTakeContentType('')).toBe('video/webm');
  });

  it('uploads privately to the owner path, then saves the metadata', async () => {
    fetchMock.mockResolvedValue(respond(201, { take: summary }));
    const blob = new Blob(['abc'], { type: 'video/webm' });

    const take = await uploadTeleprompterTake({
      ownerId: 'user_1',
      blob,
      metadata: {
        takeId: TAKE_ID,
        durationMs: 1000,
        takeNumber: 1,
        title: 'Intro',
        kind: 'promo',
        source: 'script',
      },
    });

    expect(take).toEqual(summary);
    expect(uploadPresigned).toHaveBeenCalledWith(
      `jovie/teleprompter/takes/user_1/${TAKE_ID}.webm`,
      blob,
      expect.objectContaining({ access: 'private', contentType: 'video/webm' })
    );
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse(init.body)).toMatchObject({
      takeId: TAKE_ID,
      contentType: 'video/webm',
      byteSize: 3,
    });
  });

  it('marks a take kept and deletes it', async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { take: summary }));
    expect(await setTeleprompterTakeKeptClient(TAKE_ID, true)).toEqual(summary);

    fetchMock.mockResolvedValueOnce(respond(200, { ok: true }));
    await deleteTeleprompterTakeClient(TAKE_ID);
    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/teleprompter/takes/${TAKE_ID}`,
      { method: 'DELETE' }
    );
  });

  it('throws the server error code, or the status when the body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(respond(404, { error: 'take-not-found' }));
    await expect(setTeleprompterTakeKeptClient(TAKE_ID, false)).rejects.toThrow(
      'take-not-found'
    );

    fetchMock.mockResolvedValueOnce(respond(502, 'bad gateway'));
    await expect(deleteTeleprompterTakeClient(TAKE_ID)).rejects.toThrow(
      'take-request-failed-502'
    );
  });
});
