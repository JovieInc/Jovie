import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSpeechRecognition } from './useSpeechRecognition';

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported = () => true;
  mimeType = 'audio/webm';
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(4096)]) });
    this.state = 'inactive';
    this.onstop?.();
  }
}

function installServerPath(fetchImpl: typeof fetch) {
  Object.defineProperty(window, 'MediaRecorder', {
    configurable: true,
    writable: true,
    value: FakeRecorder,
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi
        .fn()
        .mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
    },
  });
  vi.stubGlobal('fetch', fetchImpl);
}

afterEach(() => {
  FakeRecorder.instances = [];
  Reflect.deleteProperty(window, 'MediaRecorder');
  Reflect.deleteProperty(navigator, 'mediaDevices');
  Reflect.deleteProperty(window, 'webkitSpeechRecognition');
  Reflect.deleteProperty(window, 'SpeechRecognition');
  vi.unstubAllGlobals();
});

describe('useSpeechRecognition server fallback (JOV-9665)', () => {
  it('is unsupported (mic hidden) when neither Web Speech nor MediaRecorder exist', async () => {
    const { result } = renderHook(() =>
      useSpeechRecognition({ onTranscript: vi.fn() })
    );
    await waitFor(() => expect(result.current.isSupported).toBe(false));
  });

  it('without Web Speech, records and delivers the server transcript', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: 'server words' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    installServerPath(fetchImpl as unknown as typeof fetch);
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechRecognition({ onTranscript }));

    await waitFor(() => expect(result.current.isSupported).toBe(true));
    act(() => result.current.start());
    expect(result.current.isListening).toBe(true);
    await waitFor(() => expect(FakeRecorder.instances).toHaveLength(1));

    act(() => result.current.stop());
    await waitFor(() =>
      expect(onTranscript).toHaveBeenCalledWith('server words')
    );
    expect(result.current.error).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('surfaces a retryable network error when the server fails', async () => {
    installServerPath(
      vi.fn().mockResolvedValue(new Response('{}', { status: 502 })) as never
    );
    const { result } = renderHook(() =>
      useSpeechRecognition({ onTranscript: vi.fn() })
    );
    await waitFor(() => expect(result.current.isSupported).toBe(true));
    act(() => result.current.start());
    await waitFor(() => expect(FakeRecorder.instances).toHaveLength(1));
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.error).toBe('network'));
    expect(result.current.isListening).toBe(false);
  });
});
