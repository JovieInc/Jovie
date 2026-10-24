import { describe, expect, it, vi } from 'vitest';
import { createAdaptiveTranscriber } from './adaptive-transcriber';
import { createDictationRegistry } from './registry';
import {
  DICTATION_MIC_CONSTRAINTS,
  type DictationProvider,
  type SttEvent,
} from './types';

function provider(id: string) {
  const listeners: ((event: SttEvent) => void)[] = [];
  const abort = vi.fn();
  const commit = vi.fn();
  const instance: DictationProvider = {
    id,
    capabilities: {
      streaming: true,
      partials: true,
      batch: false,
      languages: ['auto'],
      maxSessionSec: 600,
      fullDuplexSafe: false,
      runsIn: ['web', 'electron'],
    },
    health: () => true,
    openStream: vi.fn(() => ({
      subscribe(listener: (event: SttEvent) => void) {
        listeners.push(listener);
        return () => {};
      },
      push() {},
      commit,
      close() {},
      abort,
    })),
  };
  return {
    instance,
    listeners,
    abort,
    commit,
    emit: (event: SttEvent) => listeners.at(-1)?.(event),
  };
}
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
function setup() {
  const first = provider('elevenlabs-stream');
  const second = provider('elevenlabs-batch');
  const stop = vi.fn();
  const getMicrophone = vi.fn(
    async () => ({ getTracks: () => [{ stop }] }) as unknown as MediaStream
  );
  const onTranscript = vi.fn();
  const onError = vi.fn();
  const onEnd = vi.fn();
  const onFallback = vi.fn();
  const cancelTts = vi.fn();
  const transcriber = createAdaptiveTranscriber(
    { onTranscript, onError, onEnd },
    {
      providers: [second.instance, first.instance],
      getMicrophone,
      onFallback,
      activeTts: () => ({ write() {}, flush() {}, cancel: cancelTts }),
    }
  );
  return {
    first,
    second,
    transcriber,
    onTranscript,
    onError,
    onEnd,
    onFallback,
    stop,
    getMicrophone,
    cancelTts,
  };
}
describe('adaptive dictation', () => {
  it('orders providers and excludes browser speech in Electron even if misdeclared', () => {
    const web = provider('web-speech').instance;
    const batch = provider('elevenlabs-batch').instance;
    expect(createDictationRegistry([web, batch], 'electron')).toEqual([batch]);
    expect(createDictationRegistry([web, batch], 'web')).toEqual([batch, web]);
    expect(DICTATION_MIC_CONSTRAINTS).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  });
  it('reconnects silently once, then fails over and preserves segment dedupe', async () => {
    const s = setup();
    s.transcriber.start();
    await flush();
    s.first.emit({ type: 'committed', segmentId: 'a', text: 'Hello' });
    s.first.emit({ type: 'error', code: 'network' });
    await flush();
    expect(s.first.instance.openStream).toHaveBeenCalledTimes(2);
    s.first.emit({ type: 'committed', segmentId: 'a', text: 'Hello' });
    s.first.emit({ type: 'partial', text: 'world' });
    expect(s.onTranscript).toHaveBeenLastCalledWith('Hello world');
    s.first.emit({ type: 'error', code: 'provider-down' });
    await flush();
    expect(s.second.instance.openStream).toHaveBeenCalledTimes(1);
    expect(s.onError).not.toHaveBeenCalled();
    s.second.emit({ type: 'closed' });
    expect(s.stop).toHaveBeenCalledOnce();
    expect(s.onEnd).toHaveBeenCalledOnce();
  });
  it.each([
    'not-allowed',
    'service-not-allowed',
    'audio-capture',
    'quota',
    'rate_limited',
    'dictation_cap_reached',
  ] as const)('does not fail over for %s', async code => {
    const s = setup();
    s.transcriber.start();
    await flush();
    s.first.emit({ type: 'error', code });
    await flush();
    expect(s.second.instance.openStream).not.toHaveBeenCalled();
    expect(s.first.instance.openStream).toHaveBeenCalledOnce();
    if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(code))
      expect(s.onFallback).not.toHaveBeenCalled();
    else expect(s.onFallback).toHaveBeenCalledWith(code);
    expect(s.stop).toHaveBeenCalledOnce();
  });
  it('exhausts both providers and ends in text', async () => {
    const s = setup();
    s.transcriber.start();
    await flush();
    for (const p of [s.first, s.first, s.second, s.second]) {
      p.emit({ type: 'error', code: 'network' });
      await flush();
    }
    expect(s.onError).toHaveBeenCalledWith('network');
    expect(s.onEnd).toHaveBeenCalledOnce();
  });
  it('skips unhealthy providers', async () => {
    const s = setup();
    s.first.instance.health = () => false;
    s.transcriber.start();
    await flush();
    expect(s.first.instance.openStream).not.toHaveBeenCalled();
    expect(s.second.instance.openStream).toHaveBeenCalledOnce();
  });
  it('drops results from cancelled and superseded streams and cancels TTS on speech', async () => {
    const s = setup();
    s.transcriber.start();
    await flush();
    s.first.emit({ type: 'speech' });
    expect(s.cancelTts).toHaveBeenCalledOnce();
    const old = s.first.listeners[0];
    s.transcriber.start();
    await flush();
    old({ type: 'partial', text: 'stale' });
    expect(s.onTranscript).not.toHaveBeenCalled();
    s.transcriber.cancel();
    s.first.emit({ type: 'committed', segmentId: 'b', text: 'late' });
    expect(s.onTranscript).not.toHaveBeenCalled();
  });
  it('accepts final results after graceful stop', async () => {
    const s = setup();
    s.transcriber.start();
    await flush();
    s.transcriber.stop();
    expect(s.first.commit).toHaveBeenCalledOnce();
    s.first.emit({ type: 'committed', segmentId: 'a', text: 'final' });
    expect(s.onTranscript).toHaveBeenCalledWith('final');
  });
  it('releases a microphone that resolves after cancellation', async () => {
    let resolve: (mic: MediaStream) => void = () => {};
    const stop = vi.fn();
    const p = provider('elevenlabs-stream');
    const transcriber = createAdaptiveTranscriber(
      { onTranscript: vi.fn() },
      {
        providers: [p.instance],
        getMicrophone: () =>
          new Promise(r => {
            resolve = r;
          }),
      }
    );
    transcriber.start();
    await flush();
    transcriber.cancel();
    resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await flush();
    expect(stop).toHaveBeenCalledOnce();
    expect(p.instance.openStream).not.toHaveBeenCalled();
  });
});
