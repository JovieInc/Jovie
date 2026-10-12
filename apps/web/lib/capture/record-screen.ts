'use client';

import { captureVideoFileName } from './account-video';
import type { CapturePurpose } from './types';

export interface ScreenRecording {
  readonly file: File;
  readonly durationMs: number;
  readonly byteSize: number;
}

export interface ScreenRecordingSession {
  readonly stop: () => Promise<ScreenRecording>;
  readonly cancel: () => void;
}

interface RecordingOptions {
  readonly signal?: AbortSignal;
  readonly isCurrent?: () => boolean;
}

function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    return 'video/webm';
  }
  return MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : 'video/webm';
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach(track => track.stop());
}

export function canRecordScreen(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getDisplayMedia)
  );
}

export async function startScreenRecording(
  purpose: CapturePurpose,
  options: RecordingOptions = {}
): Promise<ScreenRecordingSession> {
  const isCurrent = () =>
    !options.signal?.aborted && (options.isCurrent?.() ?? true);
  const cancelled = () =>
    new DOMException('Screen recording cancelled.', 'AbortError');
  if (!isCurrent()) throw cancelled();
  if (!canRecordScreen())
    throw new Error('Screen recording is not available in this window.');

  // getDisplayMedia cannot dismiss its picker through AbortSignal. Dispose a
  // late selection before recording if its owner has left or cancelled.
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });
  if (!isCurrent()) {
    stopTracks(stream);
    throw cancelled();
  }
  let recorder: MediaRecorder;
  let mimeType: string;
  try {
    mimeType = pickRecorderMimeType();
    recorder = new MediaRecorder(stream, { mimeType });
  } catch (error) {
    stopTracks(stream);
    throw error;
  }
  const chunks: Blob[] = [];
  const startedAt = Date.now();
  let settled = false;
  let resolve!: (recording: ScreenRecording) => void;
  let reject!: (error: Error) => void;
  const done = new Promise<ScreenRecording>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  // Errors can arrive before the user presses Stop. Keep stop() rejecting, but
  // handle the retained promise while no caller is awaiting it yet.
  void done.catch(() => undefined);
  const cleanup = () => {
    options.signal?.removeEventListener('abort', cancel);
    stream.getVideoTracks()[0]?.removeEventListener('ended', stopRecorder);
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
    stopTracks(stream);
  };
  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    cleanup();
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* Tracks are already stopped. */
      }
    }
    reject(error);
  };
  function cancel() {
    fail(cancelled());
  }
  function stopRecorder() {
    if (!isCurrent()) {
      cancel();
      return;
    }
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        fail(new Error('Screen recording failed.'));
      }
    }
  }
  recorder.ondataavailable = event => {
    if (!settled && event.data.size > 0) chunks.push(event.data);
  };
  recorder.onerror = () => fail(new Error('Screen recording failed.'));
  recorder.onstop = () => {
    if (settled) return;
    if (!isCurrent()) {
      cancel();
      return;
    }
    try {
      const file = new File(
        [new Blob(chunks, { type: mimeType })],
        captureVideoFileName(purpose, new Date()),
        { type: mimeType }
      );
      settled = true;
      cleanup();
      resolve({
        file,
        durationMs: Date.now() - startedAt,
        byteSize: file.size,
      });
    } catch {
      fail(new Error('Screen recording failed.'));
    }
  };
  stream.getVideoTracks()[0]?.addEventListener('ended', stopRecorder);
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (!isCurrent()) {
    cancel();
  } else {
    try {
      recorder.start(1000);
    } catch {
      fail(new Error('Screen recording failed.'));
    }
  }
  if (settled) await done;
  return {
    stop: async () => {
      stopRecorder();
      return done;
    },
    cancel,
  };
}
