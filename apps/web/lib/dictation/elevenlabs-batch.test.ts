import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createElevenLabsBatchProvider,
  recordingToWavChunks,
} from './elevenlabs-batch';
import { fishBatchProvider } from './fish-batch';

afterEach(() => vi.unstubAllGlobals());
describe('ElevenLabs batch fallback', () => {
  it('uploads bounded converted chunks in order and combines the whole recording once', async () => {
    const chunks = [new Blob(['a']), new Blob(['b'])];
    const convert = vi.fn(async () => chunks);
    const fetchAudio = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'Hello' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'world' })));
    const p = createElevenLabsBatchProvider({ fetch: fetchAudio, convert });
    expect(
      await p.transcribe?.(
        new Blob(['recording']),
        new AbortController().signal
      )
    ).toBe('Hello world');
    expect(fetchAudio).toHaveBeenCalledTimes(2);
    expect(fetchAudio.mock.calls[0][1].body).toBe(chunks[0]);
  });
  it('preserves terminal caps without sending remaining chunks', async () => {
    const fetchAudio = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 'dictation_cap_reached' }), {
          status: 429,
        })
    );
    const p = createElevenLabsBatchProvider({
      fetch: fetchAudio,
      convert: async () => [new Blob(), new Blob()],
    });
    await expect(
      p.transcribe?.(new Blob(), new AbortController().signal)
    ).rejects.toMatchObject({ code: 'dictation_cap_reached' });
    expect(fetchAudio).toHaveBeenCalledOnce();
  });
  it('drops cancelled conversions without uploading and keeps Fish unregistered', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchAudio = vi.fn();
    const p = createElevenLabsBatchProvider({
      fetch: fetchAudio,
      convert: async () => [new Blob()],
    });
    await expect(
      p.transcribe?.(new Blob(), controller.signal)
    ).rejects.toThrow();
    expect(fetchAudio).not.toHaveBeenCalled();
    expect(fishBatchProvider.health()).toBe(false);
    expect(fishBatchProvider.capabilities.streaming).toBe(false);
    await expect(
      fishBatchProvider.transcribe?.(new Blob(), controller.signal)
    ).rejects.toMatchObject({ code: 'provider-down' });
  });
  it('decodes the MediaRecorder buffer, resamples mono and splits bounded WAV uploads', async () => {
    const close = vi.fn(async () => {});
    vi.stubGlobal(
      'AudioContext',
      class {
        decodeAudioData = vi.fn(async () => ({ duration: 101 }));
        close = close;
      }
    );
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        destination = {};
        createBufferSource = () => ({ buffer: null, connect() {}, start() {} });
        startRendering = async () => ({
          getChannelData: () => new Float32Array(101 * 16000),
        });
      }
    );
    const chunks = await recordingToWavChunks({
      arrayBuffer: async () => new ArrayBuffer(4),
    } as Blob);
    expect(chunks.map(chunk => chunk.size)).toEqual([3200044, 32044]);
    expect(close).toHaveBeenCalledOnce();
  });
});
