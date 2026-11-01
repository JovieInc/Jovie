/**
 * Server-backed dictation (JOV-9665).
 *
 * Runtimes without Web Speech (Electron's Chromium has no speech keys,
 * Firefox has no recognizer) record with MediaRecorder and post the clip to
 * /api/chat/transcribe. Partial results are re-transcriptions of the audio so
 * far on a fixed cadence (bounded), the final result covers the whole clip.
 */

import { DICTATION_MIC_CONSTRAINTS } from '@/lib/dictation/types';
import type {
  Transcriber,
  TranscriberCallbacks,
  TranscriberErrorCode,
} from './transcriber';

const CHUNK_MS = 1000;
const PARTIAL_EVERY_MS = 4000;
/** Past this, skip partials (cost grows with clip length); final still runs. */
const PARTIAL_MAX_MS = 24_000;
const MAX_CLIP_MS = 120_000;
const MIN_FINAL_BYTES = 1024;
export const TRANSCRIBE_ENDPOINT = '/api/chat/transcribe';

export interface ServerTranscriberOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  navigatorRef?: Pick<Navigator, 'mediaDevices'>;
  MediaRecorderCtor?: typeof MediaRecorder;
}

export function isServerTranscriptionSupported(
  options: ServerTranscriberOptions = {}
): boolean {
  const nav = options.navigatorRef ?? globalThis.navigator;
  const Recorder = options.MediaRecorderCtor ?? globalThis.MediaRecorder;
  return (
    typeof Recorder === 'function' &&
    typeof nav?.mediaDevices?.getUserMedia === 'function'
  );
}

function pickMimeType(Recorder: typeof MediaRecorder): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return candidates.find(type => Recorder.isTypeSupported?.(type));
}

function micErrorCode(error: unknown): TranscriberErrorCode {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'not-allowed';
  if (name === 'NotFoundError' || name === 'NotReadableError')
    return 'audio-capture';
  return 'unknown';
}

export function createServerTranscriber(
  callbacks: TranscriberCallbacks,
  options: ServerTranscriberOptions = {}
): Transcriber {
  const isSupported = isServerTranscriptionSupported(options);
  const endpoint = options.endpoint ?? TRANSCRIBE_ENDPOINT;

  let generation = 0;
  let recorder: MediaRecorder | null = null;
  let mic: MediaStream | null = null;
  let chunks: Blob[] = [];
  let partialTimer: ReturnType<typeof setInterval> | undefined;
  let clipTimer: ReturnType<typeof setTimeout> | undefined;
  let startedAt = 0;
  let partialInFlight = false;

  const releaseMic = () => {
    for (const track of mic?.getTracks() ?? []) track.stop();
    mic = null;
  };
  const clearTimers = () => {
    clearInterval(partialTimer);
    clearTimeout(clipTimer);
    partialTimer = undefined;
    clipTimer = undefined;
  };
  const teardown = () => {
    clearTimers();
    releaseMic();
    recorder = null;
    chunks = [];
    partialInFlight = false;
  };

  const upload = async (blob: Blob): Promise<string> => {
    const durationMs = Math.max(0, Date.now() - startedAt);
    const doFetch = options.fetchImpl ?? globalThis.fetch;
    const response = await doFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'audio/webm',
        'x-audio-duration-ms': String(durationMs),
      },
      body: blob,
    });
    if (!response.ok) throw new Error(`transcribe ${response.status}`);
    const data = (await response.json()) as { text?: unknown };
    return typeof data.text === 'string' ? data.text : '';
  };

  const sendPartial = (session: number, type: string) => {
    if (partialInFlight || chunks.length === 0) return;
    if (Date.now() - startedAt > PARTIAL_MAX_MS) return;
    partialInFlight = true;
    void upload(new Blob(chunks, { type }))
      .then(text => {
        if (session === generation && text) callbacks.onTranscript(text);
      })
      .catch(() => {
        // Partials are best effort; the final pass reports failure.
      })
      .finally(() => {
        partialInFlight = false;
      });
  };

  const fail = (session: number, code: TranscriberErrorCode) => {
    if (session !== generation) return;
    generation++;
    teardown();
    callbacks.onError?.(code);
    callbacks.onEnd?.();
  };

  const finalize = async (session: number, type: string) => {
    const blob = new Blob(chunks, { type });
    clearTimers();
    releaseMic();
    if (blob.size < MIN_FINAL_BYTES) {
      fail(session, 'no-speech');
      return;
    }
    try {
      const text = await upload(blob);
      if (session !== generation) return;
      if (!text) {
        fail(session, 'no-speech');
        return;
      }
      callbacks.onTranscript(text);
      generation++;
      teardown();
      callbacks.onEnd?.();
    } catch {
      fail(session, 'network');
    }
  };

  const begin = async (session: number) => {
    const Recorder = options.MediaRecorderCtor ?? globalThis.MediaRecorder;
    const nav = options.navigatorRef ?? globalThis.navigator;
    let stream: MediaStream;
    try {
      stream = await nav.mediaDevices.getUserMedia({
        audio: DICTATION_MIC_CONSTRAINTS,
      });
    } catch (error) {
      fail(session, micErrorCode(error));
      return;
    }
    if (session !== generation) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    mic = stream;
    const mimeType = pickMimeType(Recorder);
    const rec = new Recorder(stream, mimeType ? { mimeType } : undefined);
    const type = rec.mimeType || mimeType || 'audio/webm';
    recorder = rec;
    startedAt = Date.now();
    rec.ondataavailable = event => {
      if (session === generation && event.data.size > 0)
        chunks.push(event.data);
    };
    rec.onerror = () => fail(session, 'audio-capture');
    rec.onstop = () => {
      if (session === generation) void finalize(session, type);
    };
    rec.start(CHUNK_MS);
    partialTimer = setInterval(
      () => sendPartial(session, type),
      PARTIAL_EVERY_MS
    );
    clipTimer = setTimeout(() => {
      if (recorder?.state === 'recording') recorder.stop();
    }, MAX_CLIP_MS);
  };

  const cancel = () => {
    generation++;
    try {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    } catch {
      // Already stopped.
    }
    teardown();
  };

  return {
    isSupported,
    start() {
      if (!isSupported) return;
      cancel();
      chunks = [];
      void begin(++generation);
    },
    stop() {
      if (recorder?.state === 'recording') {
        recorder.stop();
      } else if (!recorder) {
        // Mic still being acquired: nothing was captured.
        generation++;
        teardown();
        callbacks.onEnd?.();
      }
    },
    cancel,
    dispose: cancel,
  };
}
