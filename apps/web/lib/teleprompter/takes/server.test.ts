import { beforeEach, describe, expect, it, vi } from 'vitest';

const { store, mockDel, mockGet, mockHead, mockList, mockPut } = vi.hoisted(
  () => {
    const store = new Map<
      string,
      { body: string; uploadedAt: Date; size: number }
    >();
    // A fixed, ticking clock for uploads so list order never depends on
    // the real time.
    let uploadClock = Date.UTC(2026, 10, 7, 23, 0, 0);
    const streamOf = (body: string) =>
      new Response(body).body as ReadableStream<Uint8Array>;
    return {
      store,
      mockPut: vi.fn(async (pathname: string, body: string) => {
        store.set(pathname, {
          body,
          uploadedAt: new Date((uploadClock += 1000)),
          size: body.length,
        });
        return { pathname };
      }),
      mockGet: vi.fn(async (pathname: string) => {
        const entry = store.get(pathname);
        if (!entry) return null;
        return {
          statusCode: 200,
          stream: streamOf(entry.body),
          headers: new Headers(),
          blob: { contentType: 'application/json', etag: 'etag', pathname },
        };
      }),
      mockHead: vi.fn(async (pathname: string) => {
        const entry = store.get(pathname);
        if (!entry) throw new Error('not found');
        return { pathname, size: entry.size, uploadedAt: entry.uploadedAt };
      }),
      mockList: vi.fn(async ({ prefix }: { prefix: string }) => ({
        blobs: [...store.entries()]
          .filter(([pathname]) => pathname.startsWith(prefix))
          .map(([pathname, entry]) => ({
            pathname,
            uploadedAt: entry.uploadedAt,
          })),
        hasMore: false,
      })),
      mockDel: vi.fn(async (pathnames: string[]) => {
        for (const pathname of pathnames) store.delete(pathname);
      }),
    };
  }
);

vi.mock('@vercel/blob', () => ({
  del: mockDel,
  get: mockGet,
  head: mockHead,
  list: mockList,
  put: mockPut,
}));
vi.mock('@/lib/blob-config', () => ({ getBlobCommandOptions: () => ({}) }));

import {
  deleteTeleprompterTake,
  listTeleprompterTakes,
  loadOwnedTeleprompterTake,
  saveTeleprompterTake,
  setTeleprompterTakeKept,
  TeleprompterTakeError,
} from './server';

const OWNER = 'user_owner';
const TAKE_ID = '1b4e28ba-2fa1-41d2-883f-0016d3cca427';
const VIDEO = `jovie/teleprompter/takes/${OWNER}/${TAKE_ID}.webm`;
const VIDEO_UPLOADED_AT = new Date('2026-11-07T22:59:00Z');

const input = {
  takeId: TAKE_ID,
  contentType: 'video/webm' as const,
  byteSize: 5,
  durationMs: 42_000,
  takeNumber: 1,
  title: 'Release day shout-out',
  kind: 'promo' as const,
  source: 'script' as const,
  script: 'Tonight I play it live.',
};

describe('teleprompter take storage', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    store.set(VIDEO, { body: 'video', uploadedAt: VIDEO_UPLOADED_AT, size: 5 });
  });

  it('writes a private sidecar once the video is uploaded', async () => {
    const record = await saveTeleprompterTake(
      OWNER,
      input,
      new Date('2026-11-07T23:00:00Z')
    );
    expect(record).toMatchObject({
      takeId: TAKE_ID,
      videoPathname: VIDEO,
      kept: false,
    });
    expect(mockPut).toHaveBeenCalledWith(
      `jovie/teleprompter/takes/${OWNER}/${TAKE_ID}.json`,
      expect.any(String),
      expect.objectContaining({ access: 'private', addRandomSuffix: false })
    );
  });

  it('refuses metadata for a video that was never uploaded or does not match', async () => {
    store.delete(VIDEO);
    await expect(saveTeleprompterTake(OWNER, input)).rejects.toMatchObject({
      code: 'take-video-missing',
      status: 422,
    });
    store.set(VIDEO, {
      body: 'video!',
      uploadedAt: VIDEO_UPLOADED_AT,
      size: 6,
    });
    await expect(saveTeleprompterTake(OWNER, input)).rejects.toMatchObject({
      code: 'take-video-size-mismatch',
    });
  });

  it('keeps the kept flag and created time when the same take is saved again', async () => {
    await saveTeleprompterTake(OWNER, input, new Date('2026-11-07T23:00:00Z'));
    await setTeleprompterTakeKept(OWNER, TAKE_ID, true);
    const again = await saveTeleprompterTake(
      OWNER,
      input,
      new Date('2026-11-07T23:05:00Z')
    );
    expect(again.kept).toBe(true);
    expect(again.createdAt).toBe('2026-11-07T23:00:00.000Z');
  });

  it('never reads another owner take', async () => {
    await saveTeleprompterTake(OWNER, input);
    await expect(
      loadOwnedTeleprompterTake('user_other', TAKE_ID)
    ).rejects.toBeInstanceOf(TeleprompterTakeError);
    await expect(
      loadOwnedTeleprompterTake(OWNER, '../../etc')
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it('lists only the owner sidecars, newest first', async () => {
    await saveTeleprompterTake(OWNER, input, new Date('2026-11-07T23:00:00Z'));
    const second = '2b4e28ba-2fa1-41d2-883f-0016d3cca427';
    store.set(`jovie/teleprompter/takes/${OWNER}/${second}.webm`, {
      body: 'video',
      uploadedAt: VIDEO_UPLOADED_AT,
      size: 5,
    });
    await saveTeleprompterTake(
      OWNER,
      { ...input, takeId: second, takeNumber: 2 },
      new Date('2026-11-07T23:10:00Z')
    );
    const takes = await listTeleprompterTakes(OWNER);
    expect(takes.map(take => take.takeNumber)).toEqual([2, 1]);
    expect(await listTeleprompterTakes('user_other')).toEqual([]);
  });

  it('keeps the newest takes inside the limit after an old one is kept', async () => {
    const newer = '3c5f39cb-3ab2-42e3-994f-1127e4ddb538';
    const prefix = `jovie/teleprompter/takes/${OWNER}/`;
    store.set(`${prefix}${TAKE_ID}.webm`, {
      body: 'video',
      uploadedAt: new Date('2026-11-07T23:00:00Z'),
      size: 5,
    });
    store.set(`${prefix}${newer}.webm`, {
      body: 'video',
      uploadedAt: new Date('2026-11-07T23:10:00Z'),
      size: 5,
    });
    await saveTeleprompterTake(OWNER, input, new Date('2026-11-07T23:00:00Z'));
    await saveTeleprompterTake(
      OWNER,
      { ...input, takeId: newer, takeNumber: 2 },
      new Date('2026-11-07T23:10:00Z')
    );
    await setTeleprompterTakeKept(OWNER, TAKE_ID, true);
    // The rewrite left the old take's sidecar newer than the new take's.
    const sidecarAt = {
      [TAKE_ID]: '2026-11-09T09:00:00Z',
      [newer]: '2026-11-07T23:10:00Z',
    };
    for (const [takeId, at] of Object.entries(sidecarAt)) {
      const sidecar = store.get(`${prefix}${takeId}.json`);
      if (sidecar) sidecar.uploadedAt = new Date(at);
    }

    const takes = await listTeleprompterTakes(OWNER, 1);
    expect(takes.map(take => take.takeNumber)).toEqual([2]);
  });

  it('deletes the video and the sidecar together', async () => {
    await saveTeleprompterTake(OWNER, input);
    await deleteTeleprompterTake(OWNER, TAKE_ID);
    expect(mockDel).toHaveBeenCalledWith(
      [VIDEO, `jovie/teleprompter/takes/${OWNER}/${TAKE_ID}.json`],
      {}
    );
    expect(store.size).toBe(0);
  });
});
