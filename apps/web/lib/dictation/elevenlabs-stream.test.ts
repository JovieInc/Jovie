import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createElevenLabsStreamProvider,
  normalizeScribeError,
} from './elevenlabs-stream';
import type { SttEvent } from './types';

class FakeSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
  });
  receive(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
}
function setup() {
  const socket = new FakeSocket();
  const socketFactory = vi.fn((_url: string) => socket as unknown as WebSocket);
  const fetchToken = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          token: 'single-use-fixture',
          expiresAt: Date.now() + 900000,
          wsUrl: 'wss://api.elevenlabs.io/v1/speech-to-text/realtime',
          modelId: 'scribe_v2_realtime',
          maxSessionSec: 600,
        }),
        { status: 200 }
      )
  );
  const dispose = vi.fn();
  let push: (audio: Int16Array) => void = () => {};
  const capture = vi.fn(
    async (
      _mic: MediaStream,
      send: (samples: Int16Array) => void,
      _signal: AbortSignal
    ) => {
      push = send;
      return dispose;
    }
  );
  const provider = createElevenLabsStreamProvider({
    fetch: fetchToken,
    socket: socketFactory,
    capture,
  });
  const controller = new AbortController();
  const mic = {} as MediaStream;
  return {
    provider,
    socket,
    socketFactory,
    fetchToken,
    dispose,
    capture,
    controller,
    mic,
    push: (audio: Int16Array) => push(audio),
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe('ElevenLabs stream', () => {
  it('uses single-use tokens, PCM16 little endian and auto language detection', async () => {
    const s = setup();
    const stream = await s.provider.openStream?.(s.mic, s.controller.signal);
    if (!stream) throw new Error('stream missing');
    const receive = vi.fn();
    stream.subscribe(receive);
    s.socket.open();
    await Promise.resolve();
    const url = new URL(s.socketFactory.mock.calls[0][0]);
    expect(url.searchParams.get('token')).toBe('single-use-fixture');
    expect(url.searchParams.has('language_code')).toBe(false);
    expect(url.searchParams.get('audio_format')).toBe('pcm_16000');
    s.push(new Int16Array([0, 32767, -32768]));
    expect(JSON.parse(s.socket.send.mock.calls[0][0])).toEqual({
      message_type: 'input_audio_chunk',
      audio_base_64: 'AAD/fwCA',
      sample_rate: 16000,
      commit: false,
    });
    s.socket.receive({ message_type: 'partial_transcript', text: 'Hello' });
    s.socket.receive({
      message_type: 'committed_transcript',
      text: 'Hello',
      segment_id: 'a',
    });
    expect(receive).toHaveBeenCalledWith({ type: 'partial', text: 'Hello' });
    expect(receive).toHaveBeenCalledWith({
      type: 'committed',
      text: 'Hello',
      segmentId: 'a',
    });
    stream.abort();
    expect(s.dispose).toHaveBeenCalled();
  });
  it('flushes pending final results before closing and ignores results after abort', async () => {
    const s = setup();
    const stream = await s.provider.openStream?.(s.mic, s.controller.signal);
    if (!stream) throw new Error('stream missing');
    const events: SttEvent[] = [];
    stream.subscribe(e => events.push(e));
    s.socket.open();
    await Promise.resolve();
    stream.commit();
    stream.close();
    expect(s.socket.send).toHaveBeenCalledOnce();
    expect(s.socket.close).not.toHaveBeenCalled();
    s.socket.receive({ message_type: 'committed_transcript', text: 'Final' });
    expect(events.map(e => e.type)).toEqual(['committed', 'closed']);
    expect(s.socket.close).toHaveBeenCalledOnce();
    s.socket.receive({ message_type: 'partial_transcript', text: 'Late' });
    expect(events).toHaveLength(2);
  });
  it('auto-stops at the approved session limit without restarting', async () => {
    const s = setup();
    const stream = await s.provider.openStream?.(s.mic, s.controller.signal);
    if (!stream) throw new Error('stream missing');
    const receive = vi.fn();
    stream.subscribe(receive);
    s.socket.open();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(600000);
    expect(s.dispose).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(receive).toHaveBeenCalledWith({ type: 'closed' });
  });
  it.each(['rate_limited', 'dictation_cap_reached'])(
    'preserves terminal token-route code %s',
    async code => {
      const s = setup();
      s.fetchToken.mockImplementation(
        async () => new Response(JSON.stringify({ code }), { status: 429 })
      );
      await expect(
        s.provider.openStream?.(s.mic, s.controller.signal)
      ).rejects.toMatchObject({ code });
      expect(s.socketFactory).not.toHaveBeenCalled();
    }
  );
  it('surfaces disconnects and cleans up capture', async () => {
    const s = setup();
    const stream = await s.provider.openStream?.(s.mic, s.controller.signal);
    if (!stream) throw new Error('stream missing');
    const receive = vi.fn();
    stream.subscribe(receive);
    s.socket.open();
    await Promise.resolve();
    s.socket.onclose?.();
    expect(receive).toHaveBeenCalledWith({ type: 'error', code: 'network' });
    expect(s.dispose).toHaveBeenCalled();
  });
  it('aborts an in-flight token request without creating a socket', async () => {
    const s = setup();
    s.controller.abort();
    await expect(
      s.provider.openStream?.(s.mic, s.controller.signal)
    ).rejects.toThrow();
    expect(s.socketFactory).not.toHaveBeenCalled();
  });
  it.each([
    ['rate_limited', 'rate_limited'],
    ['quota_exceeded', 'quota'],
    ['auth_error', 'token'],
    ['session_time_limit_exceeded', 'dictation_cap_reached'],
    ['error', 'provider-down'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeScribeError(input)).toBe(expected);
  });
});
