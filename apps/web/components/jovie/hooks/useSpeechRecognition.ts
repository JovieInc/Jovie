'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  pausePlaybackForInterruption,
  resumePlaybackAfterInterruption,
} from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import {
  type Transcriber,
  type TranscriberErrorCode,
} from '@/lib/chat/transcriber';
import {
  getElectronAPI,
  isElectronRuntime,
  useDesktopDictationStatus,
} from '@/lib/desktop/electron-bridge';
import { createAdaptiveTranscriber } from '@/lib/dictation/adaptive-transcriber';
import { createElevenLabsBatchProvider } from '@/lib/dictation/elevenlabs-batch';
import { createElevenLabsStreamProvider } from '@/lib/dictation/elevenlabs-stream';
import { createWebSpeechProvider } from '@/lib/dictation/web-speech';

interface UseSpeechRecognitionOptions {
  /** Called with the accumulated transcript as the user speaks */
  onTranscript: (text: string) => void;
  /** Language for recognition (default: 'en-US') */
  lang?: string;
}

interface UseSpeechRecognitionReturn {
  /** Whether the browser supports the Web Speech API */
  isSupported: boolean;
  /** Whether the mic is currently listening */
  isListening: boolean;
  /** Last dictation error, if any */
  error: TranscriberErrorCode | null;
  /**
   * Plain-language guidance when dictation is unavailable but the OS offers
   * its own dictation (Electron desktop). `null` when not applicable.
   */
  unavailableHint: string | null;
  /** Clear the surfaced error */
  clearError: () => void;
  /** Start listening */
  start: () => void;
  /** Stop listening; the engine's final result still flows to onTranscript. */
  stop: () => void;
  /** Abort listening and drop any pending results. */
  cancel: () => void;
  /** Toggle listening on/off */
  toggle: () => void;
}

type ListeningIntent = 'idle' | 'listening' | 'stopping';

const MAC_SYSTEM_DICTATION_HINT =
  'Dictation isn’t available in the desktop app. Use macOS dictation: press the 🎤 key (or Fn twice) while typing.';
const GENERIC_SYSTEM_DICTATION_HINT =
  'Dictation isn’t available in the desktop app. Use your system dictation shortcut while typing.';

function systemDictationHint(): string {
  const platform = getElectronAPI()?.platform;
  // The desktop shell ships as a macOS DMG; treat an unknown platform as Mac.
  return platform === undefined || platform === 'darwin'
    ? MAC_SYSTEM_DICTATION_HINT
    : GENERIC_SYSTEM_DICTATION_HINT;
}

/**
 * Hook wrapping chat dictation via the Transcriber abstraction.
 * Falls back gracefully when the API is unavailable (returns isSupported=false).
 */
export function useSpeechRecognition({
  onTranscript,
  lang = 'en-US',
}: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn {
  const desktopDictationStatus = useDesktopDictationStatus();
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<TranscriberErrorCode | null>(null);
  // Start as false so SSR and the first client render agree, then flip to
  // the real value after mount. Otherwise the chat composer renders
  // <ComposerMicButton> on the client but not the server, which swaps the
  // hydrated <button> slot at the trailing edge of the input row and
  // tears the entire send-button subtree (Radix Tooltip + Mic icon).
  const [isSupported, setIsSupported] = useState(false);
  // Set only after the adaptive ladder is exhausted or an account cap is reached.
  const [runtimeUnsupported, setRuntimeUnsupported] = useState(false);
  // Effect-driven so SSR and the first client render agree on the hint.
  const [isElectron, setIsElectron] = useState(false);
  const transcriberRef = useRef<Transcriber | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const intentRef = useRef<ListeningIntent>('idle');
  const fallbackRef = useRef(false);
  const browserWindow = globalThis.window ?? undefined;

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    setIsElectron(isElectronRuntime());
  }, []);

  const settle = useCallback(() => {
    intentRef.current = 'idle';
    setIsListening(false);
    resumePlaybackAfterInterruption();
  }, []);

  useEffect(() => {
    if (!browserWindow) return;
    const transcriber = createAdaptiveTranscriber(
      {
        onTranscript: text => {
          if (intentRef.current === 'idle') return;
          onTranscriptRef.current(text);
        },
        onError: code => {
          intentRef.current = 'idle';
          setIsListening(false);
          if (!fallbackRef.current) setError(code);
          // Release interruption hold if capture failed mid-session.
          resumePlaybackAfterInterruption();
        },
        onEnd: () => {
          settle();
        },
      },
      {
        lang,
        browserWindow,
        runtime: isElectronRuntime() ? 'electron' : 'web',
        providers: [
          createElevenLabsStreamProvider(),
          createElevenLabsBatchProvider(),
          createWebSpeechProvider({ lang, browserWindow }),
        ],
        onFallback: () => {
          fallbackRef.current = true;
          setRuntimeUnsupported(true);
        },
      }
    );
    transcriberRef.current = transcriber;
    setIsSupported(
      transcriber.isSupported &&
        desktopDictationStatus.supported &&
        !runtimeUnsupported
    );

    return () => {
      intentRef.current = 'idle';
      transcriber.dispose();
      transcriberRef.current = null;
      resumePlaybackAfterInterruption();
    };
  }, [
    browserWindow,
    desktopDictationStatus.supported,
    lang,
    runtimeUnsupported,
    settle,
  ]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const start = useCallback(() => {
    const transcriber = transcriberRef.current;
    if (!transcriber?.isSupported || intentRef.current === 'listening') return;
    setError(null);
    intentRef.current = 'listening';
    fallbackRef.current = false;
    // Single-active media: pause global playback while capturing voice.
    // Stay paused after stop (JOV-3683 default — no auto-resume).
    pausePlaybackForInterruption();
    transcriber.start();
    setIsListening(true);
  }, []);

  const stop = useCallback(() => {
    if (intentRef.current === 'idle') return;
    // 'stopping' keeps accepting the engine's final result but never restarts.
    intentRef.current = 'stopping';
    transcriberRef.current?.stop();
    setIsListening(false);
    resumePlaybackAfterInterruption();
  }, []);

  const cancel = useCallback(() => {
    if (intentRef.current === 'idle') return;
    intentRef.current = 'idle';
    transcriberRef.current?.cancel();
    setIsListening(false);
    resumePlaybackAfterInterruption();
  }, []);

  const toggle = useCallback(() => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }, [isListening, start, stop]);

  const unavailableHint =
    isElectron && runtimeUnsupported ? systemDictationHint() : null;

  return {
    isSupported,
    isListening,
    error,
    unavailableHint,
    clearError,
    start,
    stop,
    cancel,
    toggle,
  };
}
