import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getUxLatencySummaries,
  resetUxLatencyForTests,
} from '@/lib/monitoring/interaction-latency';
import {
  createWebSpeechTranscriber,
  isWebSpeechTranscriptionSupported,
} from './transcriber';

class MockSpeechRecognition extends EventTarget {
  static instances: MockSpeechRecognition[] = [];
  static startImplementation: () => void = () => {};

  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: Event) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  start = vi.fn(() => MockSpeechRecognition.startImplementation());
  stop = vi.fn();

  constructor() {
    super();
    MockSpeechRecognition.instances.push(this);
  }
}

function installMockSpeechRecognition() {
  Object.defineProperty(window, 'SpeechRecognition', {
    configurable: true,
    value: MockSpeechRecognition,
  });
}

function removeMockSpeechRecognition() {
  MockSpeechRecognition.instances = [];
  MockSpeechRecognition.startImplementation = () => {};
  Reflect.deleteProperty(window, 'SpeechRecognition');
  Reflect.deleteProperty(window, 'webkitSpeechRecognition');
}

function speechResultEvent(...transcripts: Array<string | undefined>): Event {
  return {
    results: transcripts.map(transcript => ({
      0: transcript === undefined ? undefined : { transcript, confidence: 1 },
      length: transcript === undefined ? 0 : 1,
      item: () =>
        transcript === undefined ? undefined : { transcript, confidence: 1 },
    })),
  } as unknown as Event;
}

describe('transcriber', () => {
  afterEach(() => {
    removeMockSpeechRecognition();
    resetUxLatencyForTests();
    vi.restoreAllMocks();
  });

  it('detects Web Speech support in the browser', () => {
    installMockSpeechRecognition();
    expect(isWebSpeechTranscriptionSupported(window)).toBe(true);
    expect(isWebSpeechTranscriptionSupported(null as unknown as Window)).toBe(
      false
    );

    Reflect.deleteProperty(window, 'SpeechRecognition');
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      configurable: true,
      value: MockSpeechRecognition,
    });
    expect(isWebSpeechTranscriptionSupported(window)).toBe(true);
  });

  it('starts and stops browser recognition', () => {
    installMockSpeechRecognition();
    const onStatusChange = vi.fn();
    const transcriber = createWebSpeechTranscriber({
      onTranscript: vi.fn(),
      onStatusChange,
    });

    expect(transcriber.isSupported).toBe(true);
    expect(transcriber.provenance).toEqual({
      source: 'speech-recognition',
      provider: 'web-speech',
      execution: 'provider-managed',
      locale: 'en-US',
      modelId: undefined,
    });
    transcriber.start();
    expect(transcriber.status).toBe('listening');
    expect(onStatusChange).toHaveBeenCalledWith('listening');
    expect(MockSpeechRecognition.instances).toHaveLength(1);
    expect(MockSpeechRecognition.instances[0]?.start).toHaveBeenCalledTimes(1);
    expect(MockSpeechRecognition.instances[0]).toMatchObject({
      continuous: true,
      interimResults: true,
      lang: 'en-US',
    });

    transcriber.stop();
    expect(transcriber.status).toBe('processing');
    expect(onStatusChange).toHaveBeenLastCalledWith('processing');
    expect(MockSpeechRecognition.instances[0]?.stop).toHaveBeenCalledTimes(1);
  });

  it('forwards transcript and permission errors', () => {
    installMockSpeechRecognition();
    const onTranscript = vi.fn();
    const onError = vi.fn();
    const onStatusChange = vi.fn();
    const transcriber = createWebSpeechTranscriber({
      onTranscript,
      onError,
      onStatusChange,
    });

    transcriber.start();
    const recognition = MockSpeechRecognition.instances[0];
    expect(recognition).toBeDefined();

    recognition?.onresult?.({
      results: [
        {
          0: { transcript: 'hello world', confidence: 1 },
          length: 1,
          item: (index: number) =>
            ({
              0: { transcript: 'hello world', confidence: 1 },
              length: 1,
              item: () => ({ transcript: 'hello world', confidence: 1 }),
            })[index],
        },
      ],
    } as unknown as Event);

    recognition?.onerror?.({ error: 'not-allowed' } as unknown as Event);

    expect(onError).toHaveBeenCalledWith('permission-denied');
    expect(transcriber.status).toBe('failed');
    expect(onStatusChange.mock.calls.map(call => call[0])).toEqual([
      'listening',
      'partial',
      'failed',
    ]);
    expect(onTranscript).toHaveBeenCalledWith('hello world', {
      source: 'speech-recognition',
      provider: 'web-speech',
      execution: 'provider-managed',
      locale: 'en-US',
      modelId: undefined,
    });
  });

  it.each([
    ['service-not-allowed', 'service-not-allowed'],
    ['audio-capture', 'audio-capture'],
    ['no-speech', 'no-speech'],
    ['network', 'network'],
    ['unexpected-provider-error', 'unknown'],
  ] as const)('normalizes provider error %s', (providerError, expectedError) => {
    installMockSpeechRecognition();
    const onError = vi.fn();
    const transcriber = createWebSpeechTranscriber({
      onTranscript: vi.fn(),
      onError,
    });

    transcriber.start();
    MockSpeechRecognition.instances[0]?.onerror?.({
      error: providerError,
    } as unknown as Event);

    expect(onError).toHaveBeenCalledWith(expectedError);
    expect(transcriber.status).toBe('failed');
  });

  it('allows omitted optional callbacks on error and end', () => {
    installMockSpeechRecognition();
    const failed = createWebSpeechTranscriber({ onTranscript: vi.fn() });
    failed.start();
    expect(() =>
      MockSpeechRecognition.instances[0]?.onerror?.({
        error: 'network',
      } as unknown as Event)
    ).not.toThrow();

    const ended = createWebSpeechTranscriber({ onTranscript: vi.fn() });
    ended.start();
    expect(() => MockSpeechRecognition.instances[1]?.onend?.()).not.toThrow();
  });

  it('reports canonical unavailable provenance without constructing recognition', () => {
    const transcriber = createWebSpeechTranscriber(
      { onTranscript: vi.fn() },
      { browserWindow: window, lang: 'fr-FR' }
    );

    expect(transcriber.isSupported).toBe(false);
    expect(transcriber.status).toBe('unsupported');
    expect(transcriber.provenance).toEqual({
      source: 'none',
      provider: 'none',
      execution: 'unavailable',
      locale: 'fr-FR',
      modelId: undefined,
    });
    expect(() => transcriber.start()).not.toThrow();
    expect(MockSpeechRecognition.instances).toHaveLength(0);
  });

  it('fails closed when a declared recognition property has no constructor', () => {
    Object.defineProperty(window, 'SpeechRecognition', {
      configurable: true,
      value: undefined,
    });
    const transcriber = createWebSpeechTranscriber({
      onTranscript: vi.fn(),
    });

    expect(transcriber.isSupported).toBe(true);
    expect(() => transcriber.start()).not.toThrow();
    expect(transcriber.status).toBe('idle');
    expect(MockSpeechRecognition.instances).toHaveLength(0);
  });

  it('distinguishes completed, empty, and cancelled sessions', () => {
    installMockSpeechRecognition();
    const completed = createWebSpeechTranscriber({ onTranscript: vi.fn() });
    completed.start();
    const completedRecognition = MockSpeechRecognition.instances[0];
    completedRecognition?.onresult?.({
      results: [
        {
          0: { transcript: 'finished thought', confidence: 0.9 },
          length: 1,
          item: () => ({ transcript: 'finished thought', confidence: 0.9 }),
        },
      ],
    } as unknown as Event);
    completedRecognition?.onend?.();
    expect(completed.status).toBe('completed');

    const empty = createWebSpeechTranscriber({ onTranscript: vi.fn() });
    empty.start();
    MockSpeechRecognition.instances[1]?.onend?.();
    expect(empty.status).toBe('empty');

    const cancelled = createWebSpeechTranscriber({ onTranscript: vi.fn() });
    cancelled.start();
    MockSpeechRecognition.instances[2]?.onerror?.({
      error: 'aborted',
    } as unknown as Event);
    expect(cancelled.status).toBe('cancelled');

    completed.dispose();
    expect(completed.status).toBe('completed');
  });

  it('treats whitespace-only recognition as an empty session', () => {
    installMockSpeechRecognition();
    const statuses: string[] = [];
    const transcriber = createWebSpeechTranscriber({
      onTranscript: vi.fn(),
      onStatusChange: status => statuses.push(status),
    });
    transcriber.start();
    MockSpeechRecognition.instances[0]?.onresult?.(speechResultEvent('   '));
    MockSpeechRecognition.instances[0]?.onend?.();

    expect(transcriber.status).toBe('empty');
    expect(statuses).toEqual(['listening', 'partial', 'processing', 'empty']);
  });

  it('resets transcript state when the transcriber is reused', () => {
    installMockSpeechRecognition();
    const transcriber = createWebSpeechTranscriber({ onTranscript: vi.fn() });
    transcriber.start();
    MockSpeechRecognition.instances[0]?.onresult?.({
      results: [
        {
          0: { transcript: 'first session', confidence: 0.9 },
          length: 1,
          item: () => ({ transcript: 'first session', confidence: 0.9 }),
        },
      ],
    } as unknown as Event);
    MockSpeechRecognition.instances[0]?.onend?.();
    expect(transcriber.status).toBe('completed');

    transcriber.start();
    MockSpeechRecognition.instances[1]?.onend?.();
    expect(transcriber.status).toBe('empty');
  });

  it('ignores stale callbacks after a replacement session starts', () => {
    installMockSpeechRecognition();
    const onEnd = vi.fn();
    const transcriber = createWebSpeechTranscriber({
      onTranscript: vi.fn(),
      onEnd,
    });
    transcriber.start();
    const staleRecognition = MockSpeechRecognition.instances[0];
    transcriber.stop();
    transcriber.start();
    expect(transcriber.status).toBe('listening');

    staleRecognition?.onend?.();

    expect(transcriber.status).toBe('listening');
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('ignores every stale callback after disposal and constructs a new session', () => {
    installMockSpeechRecognition();
    const onTranscript = vi.fn();
    const onError = vi.fn();
    const onEnd = vi.fn();
    const transcriber = createWebSpeechTranscriber({
      onTranscript,
      onError,
      onEnd,
    });
    transcriber.start();
    const staleRecognition = MockSpeechRecognition.instances[0];

    transcriber.dispose();
    expect(transcriber.status).toBe('cancelled');
    expect(staleRecognition?.stop).toHaveBeenCalledTimes(1);
    transcriber.start();
    expect(MockSpeechRecognition.instances).toHaveLength(2);
    expect(transcriber.status).toBe('listening');

    staleRecognition?.onresult?.(speechResultEvent('stale secret'));
    staleRecognition?.onerror?.({ error: 'network' } as unknown as Event);
    staleRecognition?.onend?.();

    expect(onTranscript).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    expect(transcriber.status).toBe('listening');
  });

  it('invalidates provider callbacks after a terminal end event', () => {
    installMockSpeechRecognition();
    const onTranscript = vi.fn();
    const onError = vi.fn();
    const onEnd = vi.fn();
    const transcriber = createWebSpeechTranscriber({
      onTranscript,
      onError,
      onEnd,
    });
    transcriber.start();
    const recognition = MockSpeechRecognition.instances[0];
    recognition?.onresult?.(speechResultEvent('finished'));
    recognition?.onend?.();
    expect(transcriber.status).toBe('completed');

    recognition?.onresult?.(speechResultEvent('late mutation'));
    recognition?.onerror?.({ error: 'network' } as unknown as Event);
    recognition?.onend?.();

    expect(onTranscript).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(transcriber.status).toBe('completed');
  });

  it('does not reset an active session when start is called twice', () => {
    installMockSpeechRecognition();
    const transcriber = createWebSpeechTranscriber({ onTranscript: vi.fn() });
    transcriber.start();
    const recognition = MockSpeechRecognition.instances[0];
    recognition?.onresult?.(speechResultEvent('keep me'));

    transcriber.start();
    expect(MockSpeechRecognition.instances).toHaveLength(1);
    expect(recognition?.start).toHaveBeenCalledTimes(2);
    recognition?.onend?.();

    expect(transcriber.status).toBe('completed');
  });

  it('contains a provider start race without advancing lifecycle state', () => {
    installMockSpeechRecognition();
    MockSpeechRecognition.startImplementation = () => {
      throw new DOMException('already started', 'InvalidStateError');
    };
    const transcriber = createWebSpeechTranscriber({ onTranscript: vi.fn() });

    expect(() => transcriber.start()).not.toThrow();
    expect(transcriber.status).toBe('idle');
    MockSpeechRecognition.instances[0]?.onresult?.(speechResultEvent('late'));
    expect(
      getUxLatencySummaries().find(
        summary => summary.metric === 'speech_to_text'
      )
    ).toMatchObject({ sampleCount: 0 });
  });

  it('can stop and dispose safely without an active recognition session', () => {
    installMockSpeechRecognition();
    const transcriber = createWebSpeechTranscriber({ onTranscript: vi.fn() });

    expect(() => transcriber.stop()).not.toThrow();
    expect(transcriber.status).toBe('idle');
    expect(() => transcriber.dispose()).not.toThrow();
    expect(transcriber.status).toBe('idle');
  });

  it('records start-to-first-transcript latency once per recognition session', () => {
    installMockSpeechRecognition();
    vi.spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(275)
      .mockReturnValueOnce(350);
    const transcriber = createWebSpeechTranscriber({ onTranscript: vi.fn() });

    transcriber.start();
    const recognition = MockSpeechRecognition.instances[0];
    const resultEvent = {
      results: [
        {
          0: { transcript: 'hello', confidence: 1 },
          length: 1,
          item: () => ({ transcript: 'hello', confidence: 1 }),
        },
      ],
    } as unknown as Event;
    recognition?.onresult?.(resultEvent);
    recognition?.onresult?.(resultEvent);

    expect(
      getUxLatencySummaries().find(
        summary => summary.metric === 'speech_to_text'
      )
    ).toMatchObject({
      sampleCount: 1,
      p50Ms: 175,
      p95Ms: 175,
    });

    recognition?.onend?.();
    transcriber.start();
    MockSpeechRecognition.instances[1]?.onresult?.(speechResultEvent('again'));
    expect(
      getUxLatencySummaries().find(
        summary => summary.metric === 'speech_to_text'
      )
    ).toMatchObject({ sampleCount: 2 });
  });

  it('does not record latency for an empty provider result', () => {
    installMockSpeechRecognition();
    const onTranscript = vi.fn();
    const transcriber = createWebSpeechTranscriber({ onTranscript });

    transcriber.start();
    MockSpeechRecognition.instances[0]?.onresult?.(
      speechResultEvent(undefined, '')
    );

    expect(onTranscript).toHaveBeenCalledWith('', transcriber.provenance);
    expect(
      getUxLatencySummaries().find(
        summary => summary.metric === 'speech_to_text'
      )
    ).toMatchObject({ sampleCount: 0, p50Ms: null, p95Ms: null });
  });
});
