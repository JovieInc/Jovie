'use client';

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useAuthSafe } from '@/hooks/useJovieAuth';
import { isWebSpeechTranscriptionSupported } from '@/lib/chat/transcriber';
import { trackTeleprompterFunnel } from '@/lib/teleprompter/analytics';
import {
  loadRingLight,
  type RingLightSettings,
  ringLightStyle,
  saveRingLight,
} from '@/lib/teleprompter/ring-light';
import {
  AUTO_SCROLL_DEFAULT_WPM,
  autoScrollWordIndex,
  nextAutoScrollSpeed,
  ScriptFollower,
} from '@/lib/teleprompter/script-follower';
import { resolveStudioQuestions } from '@/lib/teleprompter/studio-questions';
import {
  canUseStudioCamera,
  classifyCameraError,
  openStudioCamera,
  type StudioCameraError,
  startTakeRecording,
  stopStream,
  type TakeRecording,
} from '@/lib/teleprompter/studio-recorder';
import type { TeleprompterRecordingContext } from '@/lib/teleprompter/types';
import { StudioCameraBlocked } from './StudioCameraBlocked';
import { StudioDock } from './StudioDock';
import { StudioHeader } from './StudioHeader';
import { StudioLightPanel } from './StudioLightPanel';
import { StudioAnswerCue, StudioQuestion } from './StudioQuestion';
import { StudioScript } from './StudioScript';
import { StudioStage } from './StudioStage';
import { type StudioTake, StudioTakesSheet } from './StudioTakesSheet';
import { useQuestionVoice } from './use-question-voice';
import { useScriptVoiceFollow } from './use-script-voice-follow';
import {
  useStudioChromeVisible,
  useStudioShortcuts,
} from './use-studio-shortcuts';
import { studioFunnel, useStudioTakes } from './use-studio-takes';

type StudioPhase = 'ready' | 'recording' | 'between';
type StudioMode = 'script' | 'answer';
type FollowMode = 'voice' | 'speed';
type CameraState =
  | { readonly status: 'starting' }
  | { readonly status: 'live' }
  | { readonly status: 'blocked'; readonly error: StudioCameraError };

interface TeleprompterStudioProps {
  readonly context: TeleprompterRecordingContext;
  readonly onClose: () => void;
}

export function TeleprompterStudio({
  context,
  onClose,
}: TeleprompterStudioProps) {
  const { userId } = useAuthSafe();
  const funnel = useMemo(() => studioFunnel(context), [context]);

  // Stable for the life of the studio (the host keys it per proposal).
  const [follower] = useState(() => new ScriptFollower(context.script));
  const words = follower.displayWords;
  const questions = useMemo(
    () =>
      resolveStudioQuestions({
        kind: context.kind,
        questions: context.questions,
      }),
    [context.kind, context.questions]
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const recordingRef = useRef<TakeRecording | null>(null);
  const speedRef = useRef<{ startedAt: number; startIndex: number } | null>(
    null
  );
  const answeredRef = useRef(0);
  const previousFocusRef = useRef<Element | null>(null);
  const recordButtonRef = useRef<HTMLButtonElement>(null);

  const [camera, setCamera] = useState<CameraState>({ status: 'starting' });
  const [phase, setPhase] = useState<StudioPhase>('ready');
  const [mode, setMode] = useState<StudioMode>('script');
  const [wordIndex, setWordIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [followMode, setFollowMode] = useState<FollowMode>(() =>
    isWebSpeechTranscriptionSupported() ? 'voice' : 'speed'
  );
  const [wordsPerMinute, setWordsPerMinute] = useState<number>(
    AUTO_SCROLL_DEFAULT_WPM
  );
  const [light, setLight] = useState<RingLightSettings>(() => loadRingLight());
  const [lightOpen, setLightOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [grid, setGrid] = useState(false);
  const [peek, setPeek] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { takes, takesRef, addTake, toggleKept, retrySave } = useStudioTakes({
    context,
    funnel,
    userId,
    onNotice: setNotice,
  });
  const chromeVisible = useStudioChromeVisible(phase === 'recording');
  const currentQuestion = questions[questionIndex % questions.length] ?? '';
  const {
    supported: voiceSupported,
    enabled: voiceEnabled,
    setEnabled: setVoiceEnabled,
    detect: detectVoice,
    cancel: cancelVoice,
    status: voiceStatus,
  } = useQuestionVoice({
    question: currentQuestion,
    between: phase === 'between',
  });

  // Camera + mic. Opened once; released on close.
  const startCamera = useCallback(async () => {
    const request = ++cameraRequestRef.current;
    setCamera({ status: 'starting' });
    if (!canUseStudioCamera()) {
      setCamera({ status: 'blocked', error: 'unsupported' });
      return;
    }
    try {
      const stream = await openStudioCamera();
      if (request !== cameraRequestRef.current) return stopStream(stream);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => undefined);
      }
      setCamera({ status: 'live' });
      await detectVoice();
    } catch (error) {
      if (request !== cameraRequestRef.current) return;
      const reason = classifyCameraError(error);
      setCamera({ status: 'blocked', error: reason });
      trackTeleprompterFunnel('teleprompter_studio_camera_blocked', {
        ...funnel,
        reason,
      });
    }
  }, [funnel, detectVoice]);

  // Mount-only: the host keys the studio per proposal.
  const onOpen = useEffectEvent(() => {
    previousFocusRef.current = document.activeElement;
    trackTeleprompterFunnel('teleprompter_studio_opened', {
      ...funnel,
      questionCount: questions.length,
      wordCount: words.length,
      followMode,
    });
    void startCamera();
  });
  const onUnmount = useEffectEvent(() => {
    cameraRequestRef.current += 1;
    recordingRef.current?.cancel();
    stopStream(streamRef.current);
    const focusTarget = previousFocusRef.current;
    if (focusTarget instanceof HTMLElement) focusTarget.focus();
  });
  useEffect(() => {
    onOpen();
    return () => onUnmount();
  }, []);

  useEffect(() => {
    saveRingLight(light);
  }, [light]);

  useEffect(() => {
    if (camera.status === 'live') recordButtonRef.current?.focus();
  }, [camera.status]);

  // Take clock: keyed on the phase alone so a speed change never resets it.
  useEffect(() => {
    if (phase !== 'recording') return;
    const startedAt = Date.now();
    const timer = globalThis.setInterval(
      () => setElapsedMs(Date.now() - startedAt),
      200
    );
    return () => globalThis.clearInterval(timer);
  }, [phase]);

  // Speed-scroll fallback.
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = globalThis.setInterval(() => {
      const speed = speedRef.current;
      if (mode === 'script' && followMode === 'speed' && speed) {
        const next = autoScrollWordIndex({
          elapsedMs: Date.now() - speed.startedAt,
          wordsPerMinute,
          startIndex: speed.startIndex,
          wordCount: words.length,
        });
        follower.resume(next);
        setWordIndex(next);
      }
    }, 200);
    return () => globalThis.clearInterval(timer);
  }, [phase, mode, followMode, wordsPerMinute, words.length, follower]);

  // Track each shown question once.
  const onQuestionShown = useEffectEvent((index: number) => {
    trackTeleprompterFunnel('teleprompter_question_shown', {
      ...funnel,
      questionIndex: index,
      voice: voiceEnabled,
    });
  });
  useEffect(() => {
    if (phase === 'between') onQuestionShown(questionIndex);
  }, [phase, questionIndex]);

  const isRecordingNow = useCallback(() => recordingRef.current !== null, []);
  const fallBackToSpeed = useCallback(() => {
    setFollowMode('speed');
    speedRef.current = {
      startedAt: Date.now(),
      startIndex: follower.nextWordIndex,
    };
    setNotice(
      'Voice follow is off in this browser, so the script scrolls at your speed.'
    );
  }, [follower]);
  const { start: startVoiceFollow, stop: stopVoiceFollow } =
    useScriptVoiceFollow({
      follower,
      isRecording: isRecordingNow,
      onWordIndex: setWordIndex,
      onUnavailable: fallBackToSpeed,
    });

  const startRecording = useCallback(
    (nextMode: StudioMode) => {
      const stream = streamRef.current;
      if (!stream || recordingRef.current) return;
      cancelVoice();
      setNotice(null);
      setMode(nextMode);
      setLightOpen(false);
      setSheetOpen(false);
      setElapsedMs(0);
      recordingRef.current = startTakeRecording(stream);
      setPhase('recording');
      if (nextMode === 'script') {
        speedRef.current = {
          startedAt: Date.now(),
          startIndex: follower.nextWordIndex,
        };
        if (followMode === 'voice') startVoiceFollow();
      }
    },
    [follower, followMode, cancelVoice, startVoiceFollow]
  );

  const stopRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;
    stopVoiceFollow();
    const source = mode;
    try {
      const { blob, durationMs } = await recording.stop();
      const take: StudioTake = {
        id: crypto.randomUUID(),
        number: takesRef.current.length + 1,
        source,
        ...(source === 'answer' ? { question: currentQuestion } : {}),
        durationMs,
        localUrl: URL.createObjectURL(blob),
        status: 'uploading',
        kept: false,
      };
      if (source === 'answer') {
        answeredRef.current += 1;
        trackTeleprompterFunnel('teleprompter_question_answered', {
          ...funnel,
          questionIndex,
          durationMs,
        });
        setQuestionIndex(index => index + 1);
      }
      addTake(take, blob);
    } catch {
      setNotice("That take didn't record. Try again.");
    }
    setPhase('between');
  }, [
    addTake,
    currentQuestion,
    funnel,
    mode,
    questionIndex,
    takesRef,
    stopVoiceFollow,
  ]);

  const toggleRecording = useCallback(() => {
    if (camera.status !== 'live') return;
    if (phase === 'recording') void stopRecording();
    else startRecording(phase === 'between' ? 'answer' : 'script');
  }, [camera.status, phase, startRecording, stopRecording]);

  const close = useCallback(() => {
    if (recordingRef.current) return;
    const current = takesRef.current;
    trackTeleprompterFunnel('teleprompter_studio_closed', {
      ...funnel,
      takes: current.length,
      keptTakes: current.filter(take => take.kept).length,
      questionsAnswered: answeredRef.current,
    });
    onClose();
  }, [funnel, onClose, takesRef]);

  const nextQuestion = () => {
    trackTeleprompterFunnel('teleprompter_question_skipped', {
      ...funnel,
      questionIndex,
    });
    setQuestionIndex(index => index + 1);
  };

  const backToScript = () => {
    follower.resume(0);
    setWordIndex(0);
    setMode('script');
    setPhase('ready');
  };

  const cycleSpeed = () => {
    if (followMode === 'voice') {
      setFollowMode('speed');
      return;
    }
    setWordsPerMinute(nextAutoScrollSpeed(wordsPerMinute));
    if (speedRef.current) {
      speedRef.current = {
        startedAt: Date.now(),
        startIndex: follower.nextWordIndex,
      };
    }
  };

  const onEscape = useCallback(() => {
    if (phase === 'recording') void stopRecording();
    else if (lightOpen || sheetOpen) {
      setLightOpen(false);
      setSheetOpen(false);
    } else close();
  }, [close, lightOpen, phase, sheetOpen, stopRecording]);
  useStudioShortcuts({ onEscape, onToggleRecording: toggleRecording });
  const isRecording = phase === 'recording';
  const style = ringLightStyle(light) as CSSProperties;
  const savedCount = takes.filter(take => take.status === 'saved').length;
  const followLabel =
    followMode === 'voice'
      ? 'Following your voice'
      : `${wordsPerMinute} words a minute`;

  const studio = (
    <div
      role='dialog'
      aria-modal='true'
      aria-label={`Record ${context.title}`}
      className='teleprompter-studio fixed inset-0 z-modal overflow-hidden bg-base text-on-media/95'
      style={style}
      data-testid='teleprompter-studio'
      data-phase={phase}
    >
      <StudioStage
        videoRef={videoRef}
        peek={peek}
        between={phase === 'between'}
        grid={grid}
      />

      <div
        className='absolute flex flex-col'
        style={{ inset: 'calc(var(--studio-ring-width) + 14px)' }}
      >
        <StudioHeader
          title={context.title}
          isRecording={isRecording}
          takeNumber={takes.length + 1}
          elapsedMs={elapsedMs}
          savedCount={savedCount}
          follow={
            mode === 'script' && phase !== 'between'
              ? { voice: followMode === 'voice', label: followLabel }
              : null
          }
          onClose={close}
        />

        <main className='relative mx-auto mt-8 w-4/5 max-w-2xl flex-1 overflow-hidden'>
          {camera.status === 'blocked' ? (
            <StudioCameraBlocked
              error={camera.error}
              onRetry={startCamera}
              onClose={close}
            />
          ) : phase === 'between' ? (
            <StudioQuestion
              question={currentQuestion}
              voiceEnabled={voiceEnabled}
              voiceStatus={voiceStatus}
              onAnswer={() => startRecording('answer')}
              onNextQuestion={nextQuestion}
              onBackToScript={backToScript}
            />
          ) : mode === 'answer' ? (
            <StudioAnswerCue question={currentQuestion} />
          ) : (
            <StudioScript words={words} nextWordIndex={wordIndex} />
          )}
        </main>

        {notice ? (
          <p role='status' className='mx-auto mb-3 text-app text-on-media/70'>
            {notice}
          </p>
        ) : null}

        <StudioDock
          visible={chromeVisible}
          isRecording={isRecording}
          canRecord={camera.status === 'live'}
          between={phase === 'between'}
          recordButtonRef={recordButtonRef}
          followMode={followMode}
          grid={grid}
          peek={peek}
          lightOpen={lightOpen}
          takesOpen={sheetOpen}
          takeCount={takes.length}
          voiceEnabled={voiceSupported ? voiceEnabled : undefined}
          onSpeed={cycleSpeed}
          onToggleGrid={() => setGrid(value => !value)}
          onTogglePeek={() => setPeek(value => !value)}
          onToggleRecording={toggleRecording}
          onToggleLight={() => {
            setLightOpen(value => !value);
            setSheetOpen(false);
          }}
          onToggleVoice={() => setVoiceEnabled(value => !value)}
          onToggleTakes={() => {
            setSheetOpen(value => !value);
            setLightOpen(false);
          }}
        />
      </div>

      {lightOpen ? (
        <StudioLightPanel settings={light} onChange={setLight} />
      ) : null}

      {sheetOpen ? (
        <StudioTakesSheet
          title={context.title}
          takes={takes}
          onToggleKept={takeId => void toggleKept(takeId)}
          onRetry={retrySave}
          onDone={close}
        />
      ) : null}
    </div>
  );

  return createPortal(studio, document.body);
}
