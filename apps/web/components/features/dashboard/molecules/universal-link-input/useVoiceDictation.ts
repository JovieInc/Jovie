'use client';

/**
 * useVoiceDictation
 *
 * Microphone recording state for the universal link input: permission
 * handling, waveform levels, duration label and the Cmd/Ctrl+Shift+M shortcut.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const randomWaveformLevel = () => 0.3 + Math.random() * 0.7; // NOSONAR (S2245) - Non-security use: audio waveform visual bar height randomization
const WAVEFORM_BAND_COUNT = 20;
const MIN_WAVEFORM_LEVEL = 0.08;
const PROCESSING_DELAY_MS = 900;
const DONE_DELAY_MS = 700;
const SHORTCUT_MICROPHONE_KEY = 'm';

function computeWaveformBands(data: Uint8Array): number[] {
  return Array.from({ length: WAVEFORM_BAND_COUNT }, (_, index) => {
    const start = Math.floor((index / WAVEFORM_BAND_COUNT) * data.length);
    const end = Math.floor(((index + 1) / WAVEFORM_BAND_COUNT) * data.length);
    const range = data.slice(start, Math.max(end, start + 1));
    const total = range.reduce((sum, value) => sum + value, 0);
    const average = total / range.length / 255;
    return Math.max(MIN_WAVEFORM_LEVEL, average);
  });
}

export type DictationState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'done'
  | 'permission-error';

export interface UseVoiceDictationOptions {
  readonly voiceInputEnabled: boolean;
  readonly onChatSubmit?: (message: string) => void;
  /** Builds the chat message for a finished recording from its duration label. */
  readonly formatVoiceMessage: (durationSnapshot: string) => string;
}

export function useVoiceDictation({
  voiceInputEnabled,
  onChatSubmit,
  formatVoiceMessage,
}: UseVoiceDictationOptions) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const processingTimerRef = useRef<ReturnType<
    typeof globalThis.setTimeout
  > | null>(null);
  const doneTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(
    null
  );
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<ReturnType<
    typeof globalThis.setInterval
  > | null>(null);
  const [dictationState, setDictationState] = useState<DictationState>('idle');
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(0);
  const [waveformLevels, setWaveformLevels] = useState<number[]>(
    Array.from({ length: WAVEFORM_BAND_COUNT }, randomWaveformLevel)
  );

  const clearRecordingTimers = useCallback(() => {
    if (recordingTimerRef.current !== null) {
      globalThis.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (animationFrameRef.current !== null) {
      globalThis.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (processingTimerRef.current !== null) {
      globalThis.clearTimeout(processingTimerRef.current);
      processingTimerRef.current = null;
    }
    if (doneTimerRef.current !== null) {
      globalThis.clearTimeout(doneTimerRef.current);
      doneTimerRef.current = null;
    }
  }, []);

  const stopWaveformAnalyzer = useCallback(() => {
    analyserRef.current = null;
    frequencyDataRef.current = null;
    if (audioContextRef.current !== null) {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    if (animationFrameRef.current !== null) {
      globalThis.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const startWaveformAnalyzer = useCallback((stream: MediaStream) => {
    if (globalThis.AudioContext === undefined) {
      animationFrameRef.current = globalThis.requestAnimationFrame(() => {
        setWaveformLevels(
          Array.from({ length: WAVEFORM_BAND_COUNT }, randomWaveformLevel)
        );
      });
      return;
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    frequencyDataRef.current = frequencyData;

    const animate = () => {
      const activeAnalyser = analyserRef.current;
      const activeFrequencyData = frequencyDataRef.current;
      if (!activeAnalyser || !activeFrequencyData) {
        return;
      }

      activeAnalyser.getByteFrequencyData(activeFrequencyData);
      setWaveformLevels(computeWaveformBands(activeFrequencyData));
      animationFrameRef.current = globalThis.requestAnimationFrame(animate);
    };

    animationFrameRef.current = globalThis.requestAnimationFrame(animate);
  }, []);

  const stopRecordingSession = useCallback(() => {
    clearRecordingTimers();
    stopWaveformAnalyzer();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }

    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }, [clearRecordingTimers, stopWaveformAnalyzer]);

  useEffect(() => {
    return () => {
      stopRecordingSession();
    };
  }, [stopRecordingSession]);

  const handleVoiceInput = useCallback(async () => {
    if (!voiceInputEnabled) return;
    if (globalThis.window === undefined) return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    if (dictationState === 'processing') return;
    if (dictationState === 'listening') {
      stopRecordingSession();
      setDictationState('idle');
      setRecordingDurationSeconds(0);
      return;
    }
    setDictationState('idle');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.addEventListener('stop', () => {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
        mediaRecorderRef.current = null;
      });

      recorder.start();
      setRecordingDurationSeconds(0);
      setDictationState('listening');
      recordingTimerRef.current = globalThis.setInterval(() => {
        setRecordingDurationSeconds(current => current + 1);
      }, 1000);
      startWaveformAnalyzer(stream);
    } catch {
      setDictationState('permission-error');
    }
  }, [
    dictationState,
    startWaveformAnalyzer,
    stopRecordingSession,
    voiceInputEnabled,
  ]);

  const recordingDurationLabel = useMemo(() => {
    const minutes = Math.floor(recordingDurationSeconds / 60);
    const seconds = recordingDurationSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [recordingDurationSeconds]);

  const handleCancelVoiceRecording = useCallback(() => {
    stopRecordingSession();
    setRecordingDurationSeconds(0);
    setWaveformLevels(Array.from({ length: WAVEFORM_BAND_COUNT }, () => 0.12));
    setDictationState('idle');
  }, [stopRecordingSession]);

  const handleSendVoiceRecording = useCallback(() => {
    stopRecordingSession();
    const durationSnapshot = recordingDurationLabel;
    setDictationState('processing');
    processingTimerRef.current = globalThis.setTimeout(() => {
      if (onChatSubmit) {
        onChatSubmit(formatVoiceMessage(durationSnapshot));
      }
      setDictationState('done');
      setRecordingDurationSeconds(0);
      doneTimerRef.current = globalThis.setTimeout(() => {
        setDictationState('idle');
        setWaveformLevels(
          Array.from({ length: WAVEFORM_BAND_COUNT }, randomWaveformLevel)
        );
      }, DONE_DELAY_MS);
    }, PROCESSING_DELAY_MS);
  }, [
    formatVoiceMessage,
    onChatSubmit,
    recordingDurationLabel,
    stopRecordingSession,
  ]);

  const handleDismissPermissionError = useCallback(() => {
    setDictationState('idle');
  }, []);

  useEffect(() => {
    if (!voiceInputEnabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
      if (event.key.toLowerCase() !== SHORTCUT_MICROPHONE_KEY) return;
      event.preventDefault();
      handleVoiceInput().catch(() => {});
    };

    globalThis.window.addEventListener('keydown', onKeyDown);
    return () => {
      globalThis.window.removeEventListener('keydown', onKeyDown);
    };
  }, [handleVoiceInput, voiceInputEnabled]);

  return {
    dictationState,
    recordingDurationLabel,
    waveformLevels,
    handleVoiceInput,
    handleCancelVoiceRecording,
    handleSendVoiceRecording,
    handleDismissPermissionError,
  };
}
