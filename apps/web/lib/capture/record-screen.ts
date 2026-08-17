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
  purpose: CapturePurpose
): Promise<ScreenRecordingSession> {
  if (!canRecordScreen()) {
    throw new Error('Screen recording is not available in this window.');
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });
  const chunks: Blob[] = [];
  const startedAt = Date.now();
  const mimeType = pickRecorderMimeType();
  const recorder = new MediaRecorder(stream, { mimeType });

  recorder.ondataavailable = event => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  let settle: (recording: ScreenRecording) => void;
  let fail: (error: Error) => void;
  const done = new Promise<ScreenRecording>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  recorder.onerror = () => {
    stopTracks(stream);
    fail(new Error('Screen recording failed.'));
  };

  recorder.onstop = () => {
    stopTracks(stream);
    const blob = new Blob(chunks, { type: mimeType });
    const file = new File([blob], captureVideoFileName(purpose, new Date()), {
      type: mimeType,
    });
    settle({
      file,
      durationMs: Date.now() - startedAt,
      byteSize: file.size,
    });
  };

  stream.getVideoTracks()[0]?.addEventListener('ended', () => {
    if (recorder.state === 'recording') recorder.stop();
  });

  recorder.start(1000);

  return {
    stop: async () => {
      if (recorder.state === 'recording') recorder.stop();
      return done;
    },
  };
}
