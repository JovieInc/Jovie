import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), runJam: vi.fn() }));
vi.mock('@/lib/admin/middleware', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({ userId: 'u1', actorUserId: null }),
}));
vi.mock('@/lib/copy-jam/jam.server', () => ({ runJam: mocks.runJam }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { CopyJamAiUnavailableError } from '@/lib/copy-jam/ai.server';
import { POST } from './route';

vi.mock('@/lib/copy-jam/ai.server', () => ({
  CopyJamAiUnavailableError: class extends Error {},
}));

const send = (body: BodyInit, type: string) =>
  POST(
    new Request('https://jov.ie/api/admin/copy-jam/jam', {
      method: 'POST',
      body,
      headers: { 'content-type': type },
    })
  );

describe('/api/admin/copy-jam/jam', () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset().mockResolvedValue(null);
    mocks.runJam
      .mockReset()
      .mockResolvedValue({ applied: [], unmatched: [], transcript: '' });
  });

  it('rejects non-admins', async () => {
    mocks.requireAdmin.mockResolvedValue(
      NextResponse.json({}, { status: 403 })
    );
    expect((await send('x', 'audio/webm')).status).toBe(403);
    expect(mocks.runJam).not.toHaveBeenCalled();
  });

  it('runs a jam from audio and from a transcript', async () => {
    expect(
      (await send(new Uint8Array([1, 2, 3]), 'audio/webm;codecs=opus')).status
    ).toBe(200);
    expect(mocks.runJam).toHaveBeenLastCalledWith(
      expect.objectContaining({
        by: 'u1',
        source: 'ovie-voice',
        audio: expect.any(ArrayBuffer),
      })
    );
    expect(
      (
        await send(
          JSON.stringify({ transcript: 'home 1 great' }),
          'application/json'
        )
      ).status
    ).toBe(200);
  });

  it('415s other media, 400s an empty transcript, 503s when voice is not set up', async () => {
    expect((await send('x', 'text/plain')).status).toBe(415);
    expect(
      (await send(JSON.stringify({ transcript: '' }), 'application/json'))
        .status
    ).toBe(400);
    mocks.runJam.mockRejectedValue(new CopyJamAiUnavailableError());
    expect((await send(new Uint8Array([1]), 'audio/webm')).status).toBe(503);
  });
});
