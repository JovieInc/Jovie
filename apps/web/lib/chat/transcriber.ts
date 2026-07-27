/**
 * Chat dictation transcriber abstraction.
 *
 * MVP uses the browser Web Speech API. Swap in a server STT implementation
 * (OpenAI Realtime, Deepgram, Whisper) by implementing the same interface.
 */

import {
  type AudioTranscriptionErrorCode,
  type AudioTranscriptionEvent,
  type AudioTranscriptionProvenance,
  type AudioTranscriptionStatus,
  createAudioTranscriptionProvenance,
  getNextAudioTranscriptionStatus,
} from '@jovie/audio-contracts';
import { recordUxLatency } from '@/lib/monitoring/interaction-latency';

export type TranscriberErrorCode = AudioTranscriptionErrorCode;

export interface TranscriberCallbacks {
  /** Full in-session transcript accumulated so far. */
  onTranscript: (
    text: string,
    provenance: AudioTranscriptionProvenance
  ) => void;
  onError?: (code: TranscriberErrorCode) => void;
  onEnd?: () => void;
  onStatusChange?: (status: AudioTranscriptionStatus) => void;
}

export interface Transcriber {
  readonly isSupported: boolean;
  readonly provenance: AudioTranscriptionProvenance;
  readonly status: AudioTranscriptionStatus;
  start(): void;
  stop(): void;
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
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
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
      return 'permission-denied';
    case 'service-not-allowed':
    case 'audio-capture':
    case 'no-speech':
    case 'network':
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
  const provenance = createAudioTranscriptionProvenance({
    provider: isSupported ? 'web-speech' : 'none',
    execution: isSupported ? 'provider-managed' : 'unavailable',
    locale: lang,
  });

  let recognition: SpeechRecognitionInstance | null = null;
  let activeSessionId = 0;
  let latestTranscript = '';
  let status: AudioTranscriptionStatus = isSupported ? 'idle' : 'unsupported';
  let recognitionStartedAt: number | null = null;
  let firstTranscriptRecorded = false;

  const nowMs = () => globalThis.performance?.now?.() ?? Date.now();

  const applyEvent = (event: AudioTranscriptionEvent) => {
    const nextStatus = getNextAudioTranscriptionStatus(status, event);
    if (nextStatus === status) return;
    status = nextStatus;
    callbacks.onStatusChange?.(status);
  };

  const disposeRecognition = (instance: SpeechRecognitionInstance) => {
    if (recognition !== instance) return;
    recognition = null;
    recognitionStartedAt = null;
    firstTranscriptRecorded = false;
  };

  const getRecognition = (): SpeechRecognitionInstance | null => {
    if (recognition) return recognition;
    if (!isSupported || !browserWindow) return null;

    const Ctor =
      browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Ctor) return null;

    const instance = new Ctor();
    const sessionId = ++activeSessionId;
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = lang;

    instance.onresult = (event: SpeechRecognitionEvent) => {
      if (sessionId !== activeSessionId) return;
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
      latestTranscript = transcript;
      applyEvent('partial-result');
      callbacks.onTranscript(transcript, provenance);
    };

    instance.onend = () => {
      if (sessionId !== activeSessionId) return;
      disposeRecognition(instance);
      activeSessionId += 1;
      applyEvent('capture-stopped');
      applyEvent(latestTranscript.trim() ? 'final-result' : 'empty-result');
      callbacks.onEnd?.();
    };

    instance.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (sessionId !== activeSessionId) return;
      if (event.error === 'aborted') {
        applyEvent('cancel');
        return;
      }
      applyEvent('fail');
      callbacks.onError?.(normalizeSpeechError(event.error));
    };

    recognition = instance;
    return recognition;
  };

  return {
    isSupported,
    provenance,
    get status() {
      return status;
    },
    start() {
      const isNewSession = recognition === null;
      const activeRecognition = getRecognition();
      if (!activeRecognition) return;
      try {
        if (isNewSession) {
          latestTranscript = '';
          applyEvent('reset');
        }
        recognitionStartedAt = nowMs();
        firstTranscriptRecorded = false;
        activeRecognition.start();
        applyEvent('capture-started');
      } catch {
        // Chrome throws InvalidStateError when start() races — safe to ignore.
        recognitionStartedAt = null;
      }
    },
    stop() {
      applyEvent('capture-stopped');
      const activeRecognition = recognition;
      activeRecognition?.stop();
      if (activeRecognition) disposeRecognition(activeRecognition);
    },
    dispose() {
      applyEvent('cancel');
      const activeRecognition = recognition;
      activeSessionId += 1;
      activeRecognition?.stop();
      if (activeRecognition) disposeRecognition(activeRecognition);
    },
  };
}
