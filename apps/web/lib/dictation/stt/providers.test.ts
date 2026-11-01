import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env-server', () => ({
  env: {
    CLOUDFLARE_ACCOUNT_ID: 'acct',
    CLOUDFLARE_WORKERS_AI_TOKEN: 'cf-token',
    ELEVENLABS_API_KEY: 'xi-key',
  },
}));
process.env.JOVIE_API_STATE = 'memory';

import { cloudflareStt } from './cloudflare';
import { elevenLabsStt } from './elevenlabs';

const clip = {
  audio: new Uint8Array(2048),
  mimeType: 'audio/webm',
  durationMs: 4000,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('STT providers via the client layer', () => {
  it('Workers AI: posts base64 audio with bearer auth', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(json({ result: { text: ' hi ' }, success: true }));
    const text = await cloudflareStt.transcribe(
      clip,
      fetchImpl as unknown as typeof fetch
    );
    expect(text).toBe('hi');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain(
      '/accounts/acct/ai/run/@cf/openai/whisper-large-v3-turbo'
    );
    expect((init.headers as Headers).get('authorization')).toBe(
      'Bearer cf-token'
    );
    expect(JSON.parse(init.body as string).audio).toEqual(expect.any(String));
  });

  it('ElevenLabs: posts multipart with xi-api-key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ text: 'hello' }));
    expect(
      await elevenLabsStt.transcribe(clip, fetchImpl as unknown as typeof fetch)
    ).toBe('hello');
    const [, init] = fetchImpl.mock.calls[0];
    expect((init.headers as Headers).get('xi-api-key')).toBe('xi-key');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('throws on provider errors so the adapter can fall back', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({}, 422));
    await expect(
      elevenLabsStt.transcribe(clip, fetchImpl as unknown as typeof fetch)
    ).rejects.toThrow();
  });
});
