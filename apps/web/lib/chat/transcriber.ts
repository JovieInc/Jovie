/**
 * Chat dictation transcriber abstraction.
 *
 * MVP uses the browser Web Speech API. Swap in a server STT implementation
 * (OpenAI Realtime, Deepgram, Whisper) by implementing the same interface.
 */

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

  const disposeRecognition = () => {
    recognition = null;
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

    instance.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = '';
      for (const result of Array.from(event.results)) {
        transcript += result[0]?.transcript ?? '';
      }
      callbacks.onTranscript(transcript);
    };

    instance.onend = () => {
      disposeRecognition();
      callbacks.onEnd?.();
    };

    instance.onerror = (event: SpeechRecognitionErrorEvent) => {
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
        activeRecognition.start();
      } catch {
        // Chrome throws InvalidStateError when start() races — safe to ignore.
      }
    },
    stop() {
      recognition?.stop();
      disposeRecognition();
    },
    dispose() {
      recognition?.stop();
      disposeRecognition();
    },
  };
}
