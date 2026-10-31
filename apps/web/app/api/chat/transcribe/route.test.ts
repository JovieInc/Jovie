import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  limit: vi.fn(),
  transcribe: vi.fn(),
}));

vi.mock('@/lib/auth/require-auth', () => ({ requireAuth: mocks.requireAuth }));
vi.mock('@/lib/rate-limit/limiters', () => ({
  chatTranscribeLimiter: { limit: mocks.limit },
}));
vi.mock('@/lib/dictation/stt', () => ({
  transcribeDictationClip: mocks.transcribe,
  estimateDurationMs: () => 1000,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { POST } from './route';

function req(body: BodyInit, type = 'audio/webm') {
  return new Request('http://localhost/api/chat/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': type },
    body,
  }) as never;
}

describe('POST /api/chat/transcribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ userId: 'u1', error: null });
    mocks.limit.mockResolvedValue({ success: true });
  });

  it('returns the transcript', async () => {
    mocks.transcribe.mockResolvedValue('hello');
    const res = await POST(req(new Uint8Array(2048)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: 'hello' });
    expect(mocks.transcribe.mock.calls[0][0].mimeType).toBe('audio/webm');
  });

  it('rejects unauthenticated callers', async () => {
    mocks.requireAuth.mockResolvedValue({
      userId: null,
      error: new Response(null, { status: 401 }),
    });
    expect((await POST(req(new Uint8Array(8)))).status).toBe(401);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it('rate limits, rejects non-audio and empty bodies', async () => {
    mocks.limit.mockResolvedValueOnce({ success: false });
    expect((await POST(req(new Uint8Array(8)))).status).toBe(429);
    expect((await POST(req('x', 'text/plain'))).status).toBe(415);
    expect((await POST(req(new Uint8Array(0)))).status).toBe(400);
  });

  it('returns 502 when transcription fails', async () => {
    mocks.transcribe.mockRejectedValue(new Error('boom'));
    expect((await POST(req(new Uint8Array(2048)))).status).toBe(502);
  });
});
