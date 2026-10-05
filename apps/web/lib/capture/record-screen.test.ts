import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startScreenRecording } from './record-screen';

class Recorder {
  static instances: Recorder[] = [];
  static broken = '';
  static isTypeSupported() {
    if (this.broken === 'mime') throw new Error('mime');
    return true;
  }
  state = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    if (Recorder.broken === 'constructor') throw new Error('constructor');
    Recorder.instances.push(this);
  }
  start() {
    if (Recorder.broken === 'start') throw new Error('start');
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['walk']) });
    this.onstop?.();
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function media() {
  const video = Object.assign(new EventTarget(), { stop: vi.fn() });
  const audio = { stop: vi.fn() };
  const stream = {
    getTracks: () => [video, audio],
    getVideoTracks: () => [video],
  } as unknown as MediaStream;
  return { stream, video, audio };
}
const display = vi.fn();
beforeEach(() => {
  Recorder.instances = [];
  Recorder.broken = '';
  display.mockReset();
  vi.stubGlobal('MediaRecorder', Recorder);
  vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: display } });
});
afterEach(() => vi.unstubAllGlobals());

describe('screen recording ownership', () => {
  it('disposes a late picker result before constructing a recorder after abort or ownership loss', async () => {
    for (const reason of ['abort', 'owner']) {
      const pending = deferred<MediaStream>(),
        m = media(),
        controller = new AbortController();
      let current = true;
      display.mockReturnValueOnce(pending.promise);
      const starting = startScreenRecording('founder_walk', {
        signal: controller.signal,
        isCurrent: () => current,
      });
      if (reason === 'abort') controller.abort();
      else current = false;
      pending.resolve(m.stream);
      await expect(starting).rejects.toMatchObject({ name: 'AbortError' });
      expect(m.video.stop).toHaveBeenCalledOnce();
      expect(m.audio.stop).toHaveBeenCalledOnce();
    }
    expect(Recorder.instances).toHaveLength(0);
  });

  it('does not open a picker after cancellation and recovers from picker denial', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      startScreenRecording('founder_walk', { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(display).not.toHaveBeenCalled();
    display.mockRejectedValueOnce(
      new DOMException('denied', 'NotAllowedError')
    );
    await expect(startScreenRecording('founder_walk')).rejects.toMatchObject({
      name: 'NotAllowedError',
    });
    const m = media();
    display.mockResolvedValueOnce(m.stream);
    const session = await startScreenRecording('founder_walk');
    session.cancel();
    await expect(session.stop()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('releases every track when MIME discovery, construction or start fails', async () => {
    for (const failure of ['mime', 'constructor', 'start']) {
      Recorder.broken = failure;
      const m = media();
      display.mockResolvedValueOnce(m.stream);
      await expect(startScreenRecording('founder_walk')).rejects.toThrow();
      expect(m.video.stop).toHaveBeenCalledOnce();
      expect(m.audio.stop).toHaveBeenCalledOnce();
    }
  });

  it('cancels active recording once and never resolves a file after late recorder events', async () => {
    const m = media(),
      controller = new AbortController();
    display.mockResolvedValueOnce(m.stream);
    const session = await startScreenRecording('founder_walk', {
      signal: controller.signal,
    });
    const lateStop = Recorder.instances[0].onstop;
    controller.abort();
    session.cancel();
    lateStop?.();
    await expect(session.stop()).rejects.toMatchObject({ name: 'AbortError' });
    expect(m.video.stop).toHaveBeenCalledOnce();
    expect(m.audio.stop).toHaveBeenCalledOnce();
    expect(Recorder.instances[0].state).toBe('inactive');
  });

  it('retains an error that arrives before Stop without resolving from a later stop event', async () => {
    const m = media();
    display.mockResolvedValueOnce(m.stream);
    const session = await startScreenRecording('founder_walk');
    const recorder = Recorder.instances[0],
      lateStop = recorder.onstop;
    recorder.onerror?.();
    lateStop?.();
    await expect(session.stop()).rejects.toThrow('Screen recording failed.');
    expect(m.video.stop).toHaveBeenCalledOnce();
    expect(m.audio.stop).toHaveBeenCalledOnce();
  });

  it('preserves the no-options workflow consumer and returns the same result after OS stop', async () => {
    const m = media();
    display.mockResolvedValueOnce(m.stream);
    const session = await startScreenRecording('workflow_capture');
    expect(display).toHaveBeenCalledWith({ video: true, audio: true });
    m.video.dispatchEvent(new Event('ended'));
    const recording = await session.stop();
    expect(recording.file.name).toContain('workflow');
    expect(recording.byteSize).toBe(4);
    expect(await session.stop()).toBe(recording);
    expect(m.video.stop).toHaveBeenCalledOnce();
    expect(m.audio.stop).toHaveBeenCalledOnce();
  });
});
