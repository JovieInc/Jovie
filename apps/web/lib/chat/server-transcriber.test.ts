import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createServerTranscriber,
  isServerTranscriptionSupported,
} from './server-transcriber';

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
  emit(bytes = 4096) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) });
  }
  stop() {
    this.state = 'inactive';
    this.onstop?.();
  }
}

function setup(fetchImpl: typeof fetch, getUserMedia?: () => Promise<unknown>) {
  const track = { stop: vi.fn() };
  const callbacks = {
    onTranscript: vi.fn(),
    onError: vi.fn(),
    onEnd: vi.fn(),
  };
  const transcriber = createServerTranscriber(callbacks, {
    fetchImpl,
    MediaRecorderCtor: FakeRecorder as unknown as typeof MediaRecorder,
    navigatorRef: {
      mediaDevices: {
        getUserMedia:
          getUserMedia ??
          vi.fn().mockResolvedValue({ getTracks: () => [track] }),
      },
    } as unknown as Navigator,
  });
  return { transcriber, callbacks, track };
}

const ok = (text: string) =>
  vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  ) as unknown as typeof fetch;

afterEach(() => {
  FakeRecorder.instances = [];
  vi.useRealTimers();
});

describe('createServerTranscriber', () => {
  it('reports unsupported without MediaRecorder or getUserMedia', () => {
    expect(
      isServerTranscriptionSupported({
        MediaRecorderCtor: undefined,
        navigatorRef: {} as Navigator,
      })
    ).toBe(false);
  });

  it('records, uploads on stop, delivers the transcript, releases the mic', async () => {
    const fetchImpl = ok('hello world');
    const { transcriber, callbacks, track } = setup(fetchImpl);

    transcriber.start();
    await vi.waitFor(() => expect(FakeRecorder.instances).toHaveLength(1));
    FakeRecorder.instances[0].emit();
    transcriber.stop();

    await vi.waitFor(() => expect(callbacks.onEnd).toHaveBeenCalledTimes(1));
    expect(callbacks.onTranscript).toHaveBeenCalledWith('hello world');
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/chat/transcribe',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('streams partial results while recording', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const fetchImpl = ok('partial words');
    const { transcriber, callbacks } = setup(fetchImpl);

    transcriber.start();
    await vi.waitFor(() => expect(FakeRecorder.instances).toHaveLength(1));
    FakeRecorder.instances[0].emit();
    vi.advanceTimersByTime(4100);

    await vi.waitFor(() =>
      expect(callbacks.onTranscript).toHaveBeenCalledWith('partial words')
    );
    expect(callbacks.onEnd).not.toHaveBeenCalled();
    transcriber.cancel();
  });

  it('maps a denied microphone to not-allowed', async () => {
    const denied = Object.assign(new Error('denied'), {
      name: 'NotAllowedError',
    });
    const { transcriber, callbacks } = setup(
      ok('x'),
      vi.fn().mockRejectedValue(denied)
    );
    transcriber.start();
    await vi.waitFor(() =>
      expect(callbacks.onError).toHaveBeenCalledWith('not-allowed')
    );
    expect(callbacks.onEnd).toHaveBeenCalled();
  });

  it('reports network when the server fails', async () => {
    const { transcriber, callbacks } = setup(
      vi.fn().mockResolvedValue(new Response('{}', { status: 502 })) as never
    );
    transcriber.start();
    await vi.waitFor(() => expect(FakeRecorder.instances).toHaveLength(1));
    FakeRecorder.instances[0].emit();
    transcriber.stop();
    await vi.waitFor(() =>
      expect(callbacks.onError).toHaveBeenCalledWith('network')
    );
  });

  it('cancel drops the clip: no upload, no transcript', async () => {
    const fetchImpl = ok('never');
    const { transcriber, callbacks, track } = setup(fetchImpl);
    transcriber.start();
    await vi.waitFor(() => expect(FakeRecorder.instances).toHaveLength(1));
    FakeRecorder.instances[0].emit();
    transcriber.cancel();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(callbacks.onTranscript).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });
});
