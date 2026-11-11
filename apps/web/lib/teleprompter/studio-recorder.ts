'use client';

/**
 * Camera take recording for the web studio. Pure helpers around
 * getUserMedia and MediaRecorder so the component stays declarative.
 */

const RECORDER_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
] as const;

export function pickTakeMimeType(
  isTypeSupported: ((type: string) => boolean) | undefined = globalThis
    .MediaRecorder?.isTypeSupported
): string {
  if (!isTypeSupported) return 'video/webm';
  for (const candidate of RECORDER_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(candidate)) return candidate;
    } catch {
      // Some engines throw on unknown codec strings.
    }
  }
  return 'video/webm';
}

export function canUseStudioCamera(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  );
}

export type StudioCameraError =
  | 'denied'
  | 'no-device'
  | 'in-use'
  | 'unsupported'
  | 'unknown';

export function classifyCameraError(error: unknown): StudioCameraError {
  const name =
    error instanceof DOMException || error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'no-device';
    case 'NotReadableError':
    case 'AbortError':
      return 'in-use';
    case 'TypeError':
      return 'unsupported';
    default:
      return 'unknown';
  }
}

export function cameraErrorCopy(error: StudioCameraError): {
  readonly title: string;
  readonly body: string;
} {
  switch (error) {
    case 'denied':
      return {
        title: 'Jovie needs your camera and mic',
        body: 'Allow both for this site in your browser, then try again.',
      };
    case 'no-device':
      return {
        title: 'No camera found',
        body: 'Connect a camera, or upload a video you already have.',
      };
    case 'in-use':
      return {
        title: 'Your camera is busy',
        body: 'Close the other app using it, then try again.',
      };
    case 'unsupported':
      return {
        title: "This browser can't record here",
        body: 'Use a recent Chrome, Edge, Arc, or Safari, or upload a video.',
      };
    default:
      return {
        title: "The camera didn't start",
        body: 'Try again. If it keeps happening, upload a video instead.',
      };
  }
}

export async function openStudioCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach(track => track.stop());
}

export interface RecordedTake {
  readonly blob: Blob;
  readonly durationMs: number;
}

export interface TakeRecording {
  stop(): Promise<RecordedTake>;
  cancel(): void;
}

export function startTakeRecording(
  stream: MediaStream,
  now: () => number = () => Date.now()
): TakeRecording {
  const mimeType = pickTakeMimeType();
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  });
  const chunks: Blob[] = [];
  const startedAt = now();
  let cancelled = false;
  recorder.ondataavailable = event => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(1000);

  return {
    stop() {
      return new Promise<RecordedTake>((resolve, reject) => {
        if (recorder.state === 'inactive') {
          reject(new Error('take-recorder-inactive'));
          return;
        }
        recorder.onstop = () => {
          if (cancelled) return;
          const blob = new Blob(chunks, {
            type: recorder.mimeType || mimeType,
          });
          if (blob.size === 0) {
            reject(new Error('take-empty'));
            return;
          }
          resolve({ blob, durationMs: Math.max(1, now() - startedAt) });
        };
        recorder.onerror = () => reject(new Error('take-recorder-error'));
        recorder.stop();
      });
    },
    cancel() {
      cancelled = true;
      if (recorder.state !== 'inactive') recorder.stop();
      chunks.length = 0;
    },
  };
}

export function formatTakeDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
