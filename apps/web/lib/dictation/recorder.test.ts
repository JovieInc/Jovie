import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDictationRecording } from './recorder';

class Recorder {
  static current: Recorder;
  static isTypeSupported = () => true;
  mimeType = 'audio/webm';
  state = 'recording';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => {
    this.state = 'inactive';
    queueMicrotask(() => this.onstop?.());
  });
  constructor() {
    Recorder.current = this;
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('local fallback recording', () => {
  it('keeps chunks until graceful stop, then releases the retained buffer', async () => {
    vi.stubGlobal('MediaRecorder', Recorder);
    const recording = createDictationRecording({} as MediaStream);
    Recorder.current.ondataavailable?.({ data: new Blob(['first']) });
    Recorder.current.ondataavailable?.({ data: new Blob(['last']) });
    const blob = await recording.stop();
    expect(blob.size).toBe(9);
    expect(blob.type).toBe('audio/webm');
    expect(await recording.stop()).toBe(blob);
  });
  it('discards the local audio on cancellation and ignores late chunks', async () => {
    vi.stubGlobal('MediaRecorder', Recorder);
    const recording = createDictationRecording({} as MediaStream);
    Recorder.current.ondataavailable?.({ data: new Blob(['private audio']) });
    recording.abort();
    Recorder.current.ondataavailable?.({ data: new Blob(['late']) });
    expect((await recording.stop()).size).toBe(0);
  });
  it('stops capture at 600 seconds and exposes recording failures', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('MediaRecorder', Recorder);
    const recording = createDictationRecording({} as MediaStream);
    await vi.advanceTimersByTimeAsync(600000);
    expect(Recorder.current.stop).toHaveBeenCalledOnce();
    await recording.stop();
    const failed = createDictationRecording({} as MediaStream);
    Recorder.current.onerror?.();
    await expect(failed.stop()).rejects.toMatchObject({
      code: 'audio-capture',
    });
  });
});
