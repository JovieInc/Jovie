import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createWebSpeechTranscriber,
  isWebSpeechTranscriptionSupported,
} from './transcriber';

class MockSpeechRecognition extends EventTarget {
  static instances: MockSpeechRecognition[] = [];

  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: Event) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  start = vi.fn();
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
  Reflect.deleteProperty(window, 'SpeechRecognition');
  Reflect.deleteProperty(window, 'webkitSpeechRecognition');
}

describe('transcriber', () => {
  afterEach(() => {
    removeMockSpeechRecognition();
  });

  it('detects Web Speech support in the browser', () => {
    installMockSpeechRecognition();
    expect(isWebSpeechTranscriptionSupported(window)).toBe(true);
  });

  it('starts and stops browser recognition', () => {
    installMockSpeechRecognition();
    const transcriber = createWebSpeechTranscriber({ onTranscript: vi.fn() });

    expect(transcriber.isSupported).toBe(true);
    transcriber.start();
    expect(MockSpeechRecognition.instances).toHaveLength(1);
    expect(MockSpeechRecognition.instances[0]?.start).toHaveBeenCalledTimes(1);

    transcriber.stop();
    expect(MockSpeechRecognition.instances[0]?.stop).toHaveBeenCalledTimes(1);
  });

  it('forwards transcript and permission errors', () => {
    installMockSpeechRecognition();
    const onTranscript = vi.fn();
    const onError = vi.fn();
    const transcriber = createWebSpeechTranscriber({
      onTranscript,
      onError,
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

    expect(onTranscript).toHaveBeenCalledWith('hello world');
    expect(onError).toHaveBeenCalledWith('not-allowed');
  });
});
