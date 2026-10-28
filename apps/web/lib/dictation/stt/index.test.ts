import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env-server', () => ({ env: {} }));

import {
  DEFAULT_ORDER,
  resolveSttProviders,
  transcribeDictationClip,
} from './index';
import type { SttClip, SttProvider } from './types';

const clip: SttClip = {
  audio: new Uint8Array(2048),
  mimeType: 'audio/webm',
  durationMs: 6000,
};

function provider(
  id: string,
  perMinuteUsd: number,
  impl: () => Promise<string>,
  available = true
): SttProvider {
  return { id, perMinuteUsd, available: () => available, transcribe: impl };
}

describe('dictation STT adapter', () => {
  it('orders providers by config and skips unconfigured ones', () => {
    const a = provider('cloudflare', 0.0005, async () => 'a', false);
    const b = provider('elevenlabs', 0.0067, async () => 'b');
    expect(resolveSttProviders(undefined, [a, b]).map(p => p.id)).toEqual([
      'elevenlabs',
    ]);
    expect(
      resolveSttProviders('elevenlabs,cloudflare,nope', [a, b]).map(p => p.id)
    ).toEqual(['elevenlabs']);
  });

  it('defaults to ElevenLabs first, Cloudflare as the fallback', () => {
    expect(DEFAULT_ORDER).toBe('elevenlabs,cloudflare');
    const cf = provider('cloudflare', 0.0005, async () => 'a');
    const xi = provider('elevenlabs', 0.0067, async () => 'b');
    expect(resolveSttProviders(undefined, [cf, xi]).map(p => p.id)).toEqual([
      'elevenlabs',
      'cloudflare',
    ]);
  });

  it('falls back to the next provider and logs cost per clip', async () => {
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const first = provider('cloudflare', 0.0005, async () => {
      throw new Error('cloudflare stt 500');
    });
    const second = provider('elevenlabs', 0.006, async () => 'hello');
    const text = await transcribeDictationClip(clip, {
      providers: [first, second],
    });
    expect(text).toBe('hello');
    const lines = out.mock.calls.map(c => JSON.parse(String(c[0])));
    out.mockRestore();
    expect(lines[0]).toMatchObject({ provider: 'cloudflare', ok: false });
    expect(lines[1]).toMatchObject({
      provider: 'elevenlabs',
      ok: true,
      costUsd: 0.0006,
      durationMs: 6000,
    });
  });

  it('throws when no provider is configured', async () => {
    await expect(
      transcribeDictationClip(clip, { providers: [] })
    ).rejects.toThrow(/no dictation STT provider/);
  });
});
