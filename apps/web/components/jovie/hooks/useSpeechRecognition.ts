'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  pausePlaybackForInterruption,
  resumePlaybackAfterInterruption,
} from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import {
  createServerTranscriber,
  isServerTranscriptionSupported,
} from '@/lib/chat/server-transcriber';
import {
  createWebSpeechTranscriber,
  isWebSpeechTranscriptionSupported,
  joinDictationText,
  type Transcriber,
  type TranscriberErrorCode,
} from '@/lib/chat/transcriber';
import {
  isElectronRuntime,
  useDesktopDictationStatus,
} from '@/lib/desktop/electron-bridge';

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

/**
 * Chrome/Safari end a "continuous" recognition session on their own
 * (silence windows, transient network blips, the ~60s server cap). While
 * the user still intends to dictate we restart transparently and fold the
 * finished session into the running transcript. Bounded so a misbehaving
 * engine cannot spin forever.
 */
const MAX_AUTO_RESTARTS = 8;

type ListeningIntent = 'idle' | 'listening' | 'stopping';

/**
 * Hook wrapping chat dictation via the Transcriber abstraction.
 * Web Speech where it works, else MediaRecorder + server transcription.
 * `isSupported` is false only when neither path can run, so the mic can hide.
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
  // Electron exposes webkitSpeechRecognition but Chromium's speech backend
  // needs Google API keys the shell cannot ship, so every start() fails with
  // 'network'. Once observed, switch to server transcription for the session
  // instead of surfacing a misleading network error.
  const [runtimeUnsupported, setRuntimeUnsupported] = useState(false);
  const transcriberRef = useRef<Transcriber | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const intentRef = useRef<ListeningIntent>('idle');
  const committedRef = useRef('');
  const currentSessionRef = useRef('');
  const restartCountRef = useRef(0);
  const browserWindow = globalThis.window ?? undefined;

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const settle = useCallback(() => {
    intentRef.current = 'idle';
    setIsListening(false);
    resumePlaybackAfterInterruption();
  }, []);

  useEffect(() => {
    if (!browserWindow) return;
    // Web Speech where it works; otherwise record and transcribe on the
    // server. The mic is only offered when one of the two can run.
    const webSpeechUsable =
      isWebSpeechTranscriptionSupported(browserWindow) &&
      desktopDictationStatus.webSpeechFallbackAllowed &&
      !runtimeUnsupported;
    const createTranscriber = webSpeechUsable
      ? createWebSpeechTranscriber
      : createServerTranscriber;
    const transcriber = createTranscriber(
      {
        onTranscript: text => {
          if (intentRef.current === 'idle') return;
          currentSessionRef.current = text;
          onTranscriptRef.current(
            joinDictationText(committedRef.current, text)
          );
        },
        onError: code => {
          intentRef.current = 'idle';
          setIsListening(false);
          if (code === 'network' && webSpeechUsable && isElectronRuntime()) {
            // Web Speech cannot reach its backend here; the next start()
            // records and transcribes on the server instead.
            setRuntimeUnsupported(true);
          } else {
            setError(code);
          }
          // Release interruption hold if capture failed mid-session.
          resumePlaybackAfterInterruption();
        },
        onEnd: () => {
          if (
            intentRef.current === 'listening' &&
            restartCountRef.current < MAX_AUTO_RESTARTS
          ) {
            // Engine ended on its own while the user still wants to dictate:
            // bank this session's text and start a fresh one.
            restartCountRef.current += 1;
            committedRef.current = joinDictationText(
              committedRef.current,
              currentSessionRef.current
            );
            currentSessionRef.current = '';
            transcriberRef.current?.start();
            return;
          }
          settle();
        },
      },
      webSpeechUsable ? { lang, browserWindow } : {}
    );
    transcriberRef.current = transcriber;
    setIsSupported(
      webSpeechUsable
        ? transcriber.isSupported
        : isServerTranscriptionSupported()
    );

    return () => {
      intentRef.current = 'idle';
      transcriber.dispose();
      transcriberRef.current = null;
      resumePlaybackAfterInterruption();
    };
  }, [
    browserWindow,
    desktopDictationStatus.webSpeechFallbackAllowed,
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
    committedRef.current = '';
    currentSessionRef.current = '';
    restartCountRef.current = 0;
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

  return {
    isSupported,
    isListening,
    error,
    clearError,
    start,
    stop,
    cancel,
    toggle,
  };
}
