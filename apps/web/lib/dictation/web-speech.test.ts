import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdaptiveTranscriber } from './adaptive-transcriber';
import { createWebSpeechProvider } from './web-speech';

class Recognition {
  static current: Recognition;
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  constructor() {
    Recognition.current = this;
  }
}
afterEach(() => {
  Reflect.deleteProperty(window, 'SpeechRecognition');
});
describe('Web Speech provider', () => {
  it('banks native text before a reconnect', async () => {
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: Recognition,
    });
    const onTranscript = vi.fn();
    const transcriber = createAdaptiveTranscriber({ onTranscript });
    transcriber.start();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    Recognition.current.onresult?.({ results: [[{ transcript: 'Hello' }]] });
    Recognition.current.onerror?.({ error: 'network' });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    Recognition.current.onresult?.({ results: [[{ transcript: 'world' }]] });
    expect(onTranscript).toHaveBeenLastCalledWith('Hello world');
    transcriber.dispose();
  });

  it('preserves native transcript accumulation, stop and cancellation', () => {
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: Recognition,
    });
    const p = createWebSpeechProvider({ lang: 'fr-FR', browserWindow: window });
    expect(p.health()).toBe(true);
    const controller = new AbortController();
    const stream = p.openStream?.(null, controller.signal);
    if (!stream || stream instanceof Promise)
      throw new Error('Expected synchronous Web Speech');
    const receive = vi.fn();
    stream.subscribe(receive);
    expect(Recognition.current.lang).toBe('fr-FR');
    expect(Recognition.current.continuous).toBe(true);
    Recognition.current.onresult?.({ results: [[{ transcript: 'Bonjour' }]] });
    expect(receive).toHaveBeenCalledWith({ type: 'partial', text: 'Bonjour' });
    stream.commit();
    stream.close();
    expect(Recognition.current.stop).toHaveBeenCalledOnce();
    const onResult = Recognition.current.onresult;
    controller.abort();
    onResult?.({ results: [[{ transcript: 'late' }]] });
    expect(receive).toHaveBeenCalledTimes(1);
  });
  it('reports unsupported browsers and Electron without asking for a mic', () => {
    expect(createWebSpeechProvider().health()).toBe(false);
    expect(createAdaptiveTranscriber({ onTranscript() {} }).isSupported).toBe(
      false
    );
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: Recognition,
    });
    expect(
      createAdaptiveTranscriber({ onTranscript() {} }, { runtime: 'electron' })
        .isSupported
    ).toBe(false);
  });
});
