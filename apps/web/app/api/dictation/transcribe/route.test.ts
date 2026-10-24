import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, cap, transcribe } = vi.hoisted(() => ({
  auth: vi.fn(),
  cap: vi.fn(),
  transcribe: vi.fn(),
}));
vi.mock('@/lib/auth/cached', () => ({ getOptionalAuth: auth }));
vi.mock('@/lib/dictation/quota.server', () => ({ reserveDictationAudio: cap }));
vi.mock('@/lib/dictation/elevenlabs.server', () => ({
  transcribeDictationAudio: transcribe,
}));

import { encodeWav } from '@/lib/dictation/wav';
import { POST } from './route';

function request(
  body = encodeWav(new Float32Array(16001)),
  headers: Record<string, string> = {}
) {
  return new Request('https://jov.ie/api/dictation/transcribe', {
    method: 'POST',
    body,
    headers: { 'content-type': 'audio/wav', ...headers },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  auth.mockResolvedValue({ userId: 'account' });
  cap.mockResolvedValue(null);
  transcribe.mockResolvedValue('Hello');
});
describe('batch dictation route', () => {
  it('requires auth before reading audio or spending quota', async () => {
    auth.mockResolvedValue({ userId: null });
    expect((await POST(request())).status).toBe(401);
    expect(cap).not.toHaveBeenCalled();
  });
  it('reserves measured seconds in the same account bucket before transcription', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: 'Hello' });
    expect(cap).toHaveBeenCalledWith('account', 2);
    expect(transcribe).toHaveBeenCalledOnce();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it.each(['dictation_cap_reached', 'provider-down'])(
    'fails closed on quota %s',
    async code => {
      cap.mockResolvedValue(code);
      const response = await POST(request());
      expect(response.status).toBe(
        code === 'dictation_cap_reached' ? 429 : 503
      );
      expect(await response.json()).toEqual({ code });
      expect(transcribe).not.toHaveBeenCalled();
    }
  );
  it('rejects incompatible audio and forged duration headers without paid calls', async () => {
    expect(
      (await POST(request(undefined, { 'content-type': 'audio/webm' }))).status
    ).toBe(415);
    const buffer = encodeWav(new Float32Array(16000));
    new DataView(buffer).setUint32(40, 1, true);
    expect((await POST(request(buffer))).status).toBe(400);
    expect(transcribe).not.toHaveBeenCalled();
  });
  it('bounds actual body bytes even without a Content-Length', async () => {
    expect((await POST(request(new ArrayBuffer(4000001)))).status).toBe(429);
    expect(cap).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });
  it('bounds declared body bytes and hides upstream failures', async () => {
    expect(
      (await POST(request(undefined, { 'content-length': '4000001' }))).status
    ).toBe(429);
    transcribe.mockRejectedValue(new Error('private provider response'));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'provider-down' });
  });
});
