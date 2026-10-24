import { DictationError } from './errors';
import { DICTATION_LIMITS } from './limits';
export interface DictationRecording {
  stop(): Promise<Blob>;
  abort(): void;
}

/** Keeps the same mic buffered while streaming; discard locally on success/cancel. */
export function createDictationRecording(mic: MediaStream): DictationRecording {
  const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(
    type => MediaRecorder.isTypeSupported(type)
  );
  const recorder = new MediaRecorder(mic, {
    ...(mimeType ? { mimeType } : {}),
    audioBitsPerSecond: 64000,
  });
  let chunks: Blob[] = [];
  let aborted = false;
  let settled = false;
  let size = 0;
  let resolve: (blob: Blob) => void = () => {};
  let reject: (error: Error) => void = () => {};
  const result = new Promise<Blob>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // Recording starts before anyone needs a fallback; avoid unhandled rejection.
  void result.catch(() => {});
  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    chunks = [];
    reject(error);
  };
  recorder.ondataavailable = event => {
    if (aborted || settled) return;
    size += event.data.size;
    if (size > 40_000_000) {
      fail(new DictationError('dictation_cap_reached'));
      if (recorder.state !== 'inactive') recorder.stop();
      return;
    }
    chunks.push(event.data);
  };
  recorder.onerror = () => {
    fail(new DictationError('audio-capture'));
    if (recorder.state !== 'inactive') recorder.stop();
  };
  recorder.onstop = () => {
    clearTimeout(timer);
    if (settled) return;
    settled = true;
    const blob = new Blob(chunks, { type: recorder.mimeType });
    chunks = [];
    resolve(aborted ? new Blob() : blob);
  };
  const timer = setTimeout(() => {
    if (recorder.state !== 'inactive') recorder.stop();
  }, DICTATION_LIMITS.maxSessionSeconds * 1000);
  try {
    recorder.start(1000);
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
  return {
    stop() {
      if (recorder.state !== 'inactive') recorder.stop();
      return result;
    },
    abort() {
      aborted = true;
      chunks = [];
      clearTimeout(timer);
      if (recorder.state !== 'inactive') recorder.stop();
      if (!settled) {
        settled = true;
        resolve(new Blob());
      }
    },
  };
}
