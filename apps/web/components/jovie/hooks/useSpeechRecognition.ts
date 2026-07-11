'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  pausePlaybackForInterruption,
  resumePlaybackAfterInterruption,
} from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import {
  createWebSpeechTranscriber,
  type Transcriber,
  type TranscriberErrorCode,
} from '@/lib/chat/transcriber';
import { useDesktopDictationStatus } from '@/lib/desktop/electron-bridge';

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
  /** Stop listening */
  stop: () => void;
  /** Toggle listening on/off */
  toggle: () => void;
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
  const transcriberRef = useRef<Transcriber | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const browserWindow = globalThis.window ?? undefined;

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    if (!browserWindow) return;
    const transcriber = createWebSpeechTranscriber(
      {
        onTranscript: text => {
          onTranscriptRef.current(text);
        },
        onError: code => {
          setError(code);
          setIsListening(false);
          // Release interruption hold if capture failed mid-session.
          resumePlaybackAfterInterruption();
        },
        onEnd: () => {
          setIsListening(false);
          resumePlaybackAfterInterruption();
        },
      },
      { lang, browserWindow }
    );
    transcriberRef.current = transcriber;
    setIsSupported(
      transcriber.isSupported && desktopDictationStatus.webSpeechFallbackAllowed
    );

    return () => {
      transcriber.dispose();
      transcriberRef.current = null;
      resumePlaybackAfterInterruption();
    };
  }, [browserWindow, desktopDictationStatus.webSpeechFallbackAllowed, lang]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const start = useCallback(() => {
    const transcriber = transcriberRef.current;
    if (!transcriber?.isSupported) return;
    setError(null);
    // Single-active media: pause global playback while capturing voice.
    // Stay paused after stop (JOV-3683 default — no auto-resume).
    pausePlaybackForInterruption();
    transcriber.start();
    setIsListening(true);
  }, []);

  const stop = useCallback(() => {
    transcriberRef.current?.stop();
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

  return { isSupported, isListening, error, clearError, start, stop, toggle };
}
