/**
 * Chat dictation transcriber abstraction.
 *
 * MVP uses the browser Web Speech API. Swap in a server STT implementation
 * (OpenAI Realtime, Deepgram, Whisper) by implementing the same interface.
 */

import { recordUxLatency } from '@/lib/monitoring/interaction-latency';

export type TranscriberErrorCode =
  | 'not-allowed'
  | 'service-not-allowed'
  | 'audio-capture'
  | 'no-speech'
  | 'network'
  | 'aborted'
  | 'unknown';

export interface TranscriberCallbacks {
  /** Full in-session transcript accumulated so far. */
  onTranscript: (text: string) => void;
  onError?: (code: TranscriberErrorCode) => void;
  onEnd?: () => void;
}

export interface Transcriber {
  readonly isSupported: boolean;
  start(): void;
  /** Graceful stop: the engine's pending final result still reaches `onTranscript`. */
  stop(): void;
  /**
   * Hard stop: aborts recognition and drops any late results so a cancelled
   * or already-sent dictation can never re-populate the composer.
   */
  cancel(): void;
  dispose(): void;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  start(): void;
  stop(): void;
  /** Optional in the surface we type; Chrome, Safari and Edge implement it. */
  abort?(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

/**
 * Join already-present text with newly dictated text, inserting a single
 * space only when neither side already provides whitespace at the seam.
 * Prevents "Hello" + "world" → "Helloworld" without double-spacing engines
 * that already lead each result with a space.
 */
export function joinDictationText(base: string, addition: string): string {
  if (!addition) return base;
  if (!base) return addition;
  if (/\s$/.test(base) || /^\s/.test(addition)) return base + addition;
  return `${base} ${addition}`;
}

export function isWebSpeechTranscriptionSupported(
  browserWindow: Window | undefined = globalThis.window
): boolean {
  if (!browserWindow) return false;
  return (
    'SpeechRecognition' in browserWindow ||
    'webkitSpeechRecognition' in browserWindow
  );
}

function normalizeSpeechError(error: string): TranscriberErrorCode {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
    case 'audio-capture':
    case 'no-speech':
    case 'network':
    case 'aborted':
      return error;
    default:
      return 'unknown';
  }
}

export function createWebSpeechTranscriber(
  callbacks: TranscriberCallbacks,
  options?: { lang?: string; browserWindow?: Window }
): Transcriber {
  const browserWindow = options?.browserWindow ?? globalThis.window;
  const lang = options?.lang ?? 'en-US';
  const isSupported = isWebSpeechTranscriptionSupported(browserWindow);

  let recognition: SpeechRecognitionInstance | null = null;
  let recognitionStartedAt: number | null = null;
  let firstTranscriptRecorded = false;
  // Each engine instance gets a generation. Only the active generation may
  // deliver results/end/error: cancel()/dispose() invalidate it outright, and
  // a fresh start() supersedes it, so a stopped instance's late final result
  // (or its `onend`) can never bleed into a newer session.
  let generationCounter = 0;
  let activeGeneration = 0;

  const nowMs = () => globalThis.performance?.now?.() ?? Date.now();

  const disposeRecognition = () => {
    recognition = null;
    recognitionStartedAt = null;
    firstTranscriptRecorded = false;
  };

  const haltRecognition = (mode: 'stop' | 'abort') => {
    const active = recognition;
    if (!active) return;
    try {
      if (mode === 'abort' && typeof active.abort === 'function') {
        active.abort();
      } else {
        active.stop();
      }
    } catch {
      // Already stopped — nothing to release.
    }
  };

  const getRecognition = (): SpeechRecognitionInstance | null => {
    if (recognition) return recognition;
    if (!isSupported || !browserWindow) return null;

    const Ctor =
      browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Ctor) return null;

    const instance = new Ctor();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = lang;
    generationCounter += 1;
    const generation = generationCounter;
    activeGeneration = generation;

    instance.onresult = (event: SpeechRecognitionEvent) => {
      if (generation !== activeGeneration) return;
      let transcript = '';
      for (const result of Array.from(event.results)) {
        transcript += result[0]?.transcript ?? '';
      }
      if (
        transcript.length > 0 &&
        recognitionStartedAt !== null &&
        !firstTranscriptRecorded
      ) {
        firstTranscriptRecorded = true;
        recordUxLatency(
          'speech_to_text',
          Math.max(0, nowMs() - recognitionStartedAt)
        );
      }
      callbacks.onTranscript(transcript);
    };

    instance.onend = () => {
      if (generation !== activeGeneration) return;
      disposeRecognition();
      callbacks.onEnd?.();
    };

    instance.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (generation !== activeGeneration) return;
      if (event.error === 'aborted') return;
      callbacks.onError?.(normalizeSpeechError(event.error));
    };

    recognition = instance;
    return recognition;
  };

  return {
    isSupported,
    start() {
      const activeRecognition = getRecognition();
      if (!activeRecognition) return;
      try {
        recognitionStartedAt = nowMs();
        firstTranscriptRecorded = false;
        activeRecognition.start();
      } catch {
        // Chrome throws InvalidStateError when start() races — safe to ignore.
        recognitionStartedAt = null;
      }
    },
    stop() {
      // Generation stays active: the engine emits its final result after stop().
      haltRecognition('stop');
      disposeRecognition();
    },
    cancel() {
      activeGeneration = -1;
      haltRecognition('abort');
      disposeRecognition();
    },
    dispose() {
      activeGeneration = -1;
      haltRecognition('abort');
      disposeRecognition();
    },
  };
}
