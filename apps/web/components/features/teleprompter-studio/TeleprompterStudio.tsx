'use client';

import { Badge, Button, IconButton, Kbd } from '@jovie/ui';
import {
  Eye,
  Gauge,
  Grid3x3,
  Layers,
  Mic,
  Sun,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useAuthSafe } from '@/hooks/useJovieAuth';
import {
  createWebSpeechTranscriber,
  isWebSpeechTranscriptionSupported,
  type Transcriber,
} from '@/lib/chat/transcriber';
import { trackTeleprompterFunnel } from '@/lib/teleprompter/analytics';
import { completeTeleprompterRecording } from '@/lib/teleprompter/recorder';
import {
  loadRingLight,
  type RingLightSettings,
  ringLightStyle,
  saveRingLight,
} from '@/lib/teleprompter/ring-light';
import {
  AUTO_SCROLL_DEFAULT_WPM,
  autoScrollWordIndex,
  ScriptFollower,
} from '@/lib/teleprompter/script-follower';
import { resolveStudioQuestions } from '@/lib/teleprompter/studio-questions';
import {
  canUseStudioCamera,
  classifyCameraError,
  formatTakeDuration,
  openStudioCamera,
  type StudioCameraError,
  startTakeRecording,
  stopStream,
  type TakeRecording,
} from '@/lib/teleprompter/studio-recorder';
import {
  createQuestionSpeaker,
  detectVoiceOutput,
  type VoiceOutputKind,
  voiceStartsOn,
  voiceStatusCopy,
} from '@/lib/teleprompter/studio-voice';
import {
  setTeleprompterTakeKeptClient,
  uploadTeleprompterTake,
} from '@/lib/teleprompter/takes/client';
import type { TeleprompterRecordingContext } from '@/lib/teleprompter/types';
import { cn } from '@/lib/utils';
import { StudioCameraBlocked } from './StudioCameraBlocked';
import { StudioLightPanel } from './StudioLightPanel';
import { StudioScript } from './StudioScript';
import { type StudioTake, StudioTakesSheet } from './StudioTakesSheet';

type StudioPhase = 'ready' | 'recording' | 'between';
type StudioMode = 'script' | 'answer';
type FollowMode = 'voice' | 'speed';
type CameraState =
  | { readonly status: 'starting' }
  | { readonly status: 'live' }
  | { readonly status: 'blocked'; readonly error: StudioCameraError };

const GRID_CELLS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] as const;
const CHROME_IDLE_MS = 2500;
const SPEED_STEPS = [100, 130, 160, 190] as const;

interface TeleprompterStudioProps {
  readonly context: TeleprompterRecordingContext;
  readonly onClose: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) ||
    target.getAttribute('role') === 'slider' ||
    target.getAttribute('role') === 'tab'
  );
}

export function TeleprompterStudio({
  context,
  onClose,
}: TeleprompterStudioProps) {
  const { userId } = useAuthSafe();
  const funnel = useMemo(
    () => ({
      profileId: context.profileId,
      kind: context.kind,
      showcaseVariant: context.showcaseVariant,
      source: 'web_studio',
    }),
    [context]
  );

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
  const recordingRef = useRef<TakeRecording | null>(null);
  const transcriberRef = useRef<Transcriber | null>(null);
  const speedRef = useRef<{ startedAt: number; startIndex: number } | null>(
    null
  );
  const takesRef = useRef<StudioTake[]>([]);
  const answeredRef = useRef(0);
  const previousFocusRef = useRef<Element | null>(null);
  const recordButtonRef = useRef<HTMLButtonElement>(null);
  const speaker = useMemo(() => createQuestionSpeaker(), []);

  const [camera, setCamera] = useState<CameraState>({ status: 'starting' });
  const [phase, setPhase] = useState<StudioPhase>('ready');
  const [mode, setMode] = useState<StudioMode>('script');
  const [wordIndex, setWordIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [takes, setTakes] = useState<StudioTake[]>([]);
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
  const [voiceOutput, setVoiceOutput] = useState<VoiceOutputKind>('unknown');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    takesRef.current = takes;
  }, [takes]);
  const currentQuestion = questions[questionIndex % questions.length] ?? '';

  // Camera + mic. Opened once; released on close.
  const startCamera = useCallback(async () => {
    setCamera({ status: 'starting' });
    if (!canUseStudioCamera()) {
      setCamera({ status: 'blocked', error: 'unsupported' });
      return;
    }
    try {
      const stream = await openStudioCamera();
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => undefined);
      }
      setCamera({ status: 'live' });
      // Output labels are readable once mic permission is granted.
      const output = await detectVoiceOutput();
      setVoiceOutput(output);
      setVoiceEnabled(speaker.supported && voiceStartsOn(output));
    } catch (error) {
      const reason = classifyCameraError(error);
      setCamera({ status: 'blocked', error: reason });
      trackTeleprompterFunnel('teleprompter_studio_camera_blocked', {
        ...funnel,
        reason,
      });
    }
  }, [funnel, speaker.supported]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    trackTeleprompterFunnel('teleprompter_studio_opened', {
      ...funnel,
      questionCount: questions.length,
      wordCount: words.length,
      followMode,
    });
    void startCamera();
    const onDeviceChange = () => {
      void detectVoiceOutput().then(output => {
        setVoiceOutput(output);
        // A switch to speakers mutes her; a switch to headphones never
        // unmutes without the creator asking.
        if (!voiceStartsOn(output)) setVoiceEnabled(false);
      });
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.(
        'devicechange',
        onDeviceChange
      );
      recordingRef.current?.cancel();
      transcriberRef.current?.dispose();
      speaker.cancel();
      stopStream(streamRef.current);
      for (const take of takesRef.current) URL.revokeObjectURL(take.localUrl);
      const focusTarget = previousFocusRef.current;
      if (focusTarget instanceof HTMLElement) focusTarget.focus();
    };
    // Mount-only: the studio is keyed per proposal by its host.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveRingLight(light);
  }, [light]);

  useEffect(() => {
    if (camera.status === 'live') recordButtonRef.current?.focus();
  }, [camera.status]);

  // Recording clock + speed-scroll fallback.
  useEffect(() => {
    if (phase !== 'recording') return;
    const startedAt = Date.now();
    const timer = globalThis.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
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

  // Quiet chrome while talking: the dock fades after a pause and returns on
  // any pointer move.
  useEffect(() => {
    if (phase !== 'recording') {
      setChromeVisible(true);
      return;
    }
    let timer = globalThis.setTimeout(
      () => setChromeVisible(false),
      CHROME_IDLE_MS
    );
    const wake = () => {
      setChromeVisible(true);
      globalThis.clearTimeout(timer);
      timer = globalThis.setTimeout(
        () => setChromeVisible(false),
        CHROME_IDLE_MS
      );
    };
    globalThis.window.addEventListener('pointermove', wake);
    return () => {
      globalThis.clearTimeout(timer);
      globalThis.window.removeEventListener('pointermove', wake);
    };
  }, [phase]);

  // Her voice plays only between takes, with the camera stopped.
  useEffect(() => {
    if (phase === 'between' && voiceEnabled && currentQuestion) {
      speaker.speak(currentQuestion);
    } else {
      speaker.cancel();
    }
  }, [phase, voiceEnabled, currentQuestion, speaker]);

  useEffect(() => {
    if (phase === 'between') {
      trackTeleprompterFunnel('teleprompter_question_shown', {
        ...funnel,
        questionIndex,
        voice: voiceEnabled,
      });
    }
    // Track each shown question once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, questionIndex]);

  const startVoiceFollow = useCallback(() => {
    if (followMode !== 'voice') return;
    follower.resetTranscriptAnchor();
    const transcriber = createWebSpeechTranscriber({
      onTranscript: text => {
        follower.ingest(text);
        setWordIndex(follower.nextWordIndex);
      },
      onError: code => {
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setFollowMode('speed');
          speedRef.current = {
            startedAt: Date.now(),
            startIndex: follower.nextWordIndex,
          };
          setNotice(
            'Voice follow is off in this browser, so the script scrolls at your speed.'
          );
        }
      },
      onEnd: () => {
        // Web Speech ends on silence. Keep following for the whole take.
        if (recordingRef.current && transcriberRef.current === transcriber) {
          follower.resetTranscriptAnchor();
          transcriber.start();
        }
      },
    });
    transcriberRef.current?.dispose();
    transcriberRef.current = transcriber;
    transcriber.start();
  }, [followMode, follower]);

  const stopVoiceFollow = useCallback(() => {
    const transcriber = transcriberRef.current;
    transcriberRef.current = null;
    transcriber?.cancel();
    transcriber?.dispose();
  }, []);

  const startRecording = useCallback(
    (nextMode: StudioMode) => {
      const stream = streamRef.current;
      if (!stream || recordingRef.current) return;
      speaker.cancel();
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
        startVoiceFollow();
      }
    },
    [speaker, startVoiceFollow, follower]
  );

  const saveTake = useCallback(
    async (take: StudioTake, blob: Blob) => {
      if (!userId) {
        setTakes(current =>
          current.map(item =>
            item.id === take.id ? { ...item, status: 'failed' } : item
          )
        );
        return;
      }
      try {
        await uploadTeleprompterTake({
          ownerId: userId,
          blob,
          metadata: {
            takeId: take.id,
            durationMs: take.durationMs,
            takeNumber: take.number,
            title: context.title,
            kind: context.kind,
            source: take.source,
            ...(take.source === 'script' ? { script: context.script } : {}),
            ...(take.question ? { question: take.question } : {}),
            profileId: context.profileId,
          },
        });
        setTakes(current =>
          current.map(item =>
            item.id === take.id ? { ...item, status: 'saved' } : item
          )
        );
        trackTeleprompterFunnel('teleprompter_take_saved', {
          ...funnel,
          takeSource: take.source,
          takeNumber: take.number,
          durationMs: take.durationMs,
        });
        if (take.number === 1) {
          completeTeleprompterRecording({
            ...context,
            libraryAssetId: take.id,
          });
        }
      } catch (error) {
        setTakes(current =>
          current.map(item =>
            item.id === take.id ? { ...item, status: 'failed' } : item
          )
        );
        trackTeleprompterFunnel('teleprompter_take_save_failed', {
          ...funnel,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }
    },
    [context, funnel, userId]
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
      setTakes(current => [...current, take]);
      if (source === 'answer') {
        answeredRef.current += 1;
        trackTeleprompterFunnel('teleprompter_question_answered', {
          ...funnel,
          questionIndex,
          durationMs,
        });
        setQuestionIndex(index => index + 1);
      }
      void saveTake(take, blob);
    } catch {
      setNotice("That take didn't record. Try again.");
    }
    setPhase('between');
  }, [currentQuestion, funnel, mode, questionIndex, saveTake, stopVoiceFollow]);

  const toggleRecording = useCallback(() => {
    if (camera.status !== 'live') return;
    if (phase === 'recording') {
      void stopRecording();
    } else {
      startRecording(phase === 'between' ? 'answer' : 'script');
    }
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
  }, [funnel, onClose]);

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

  const seek = (index: number) => {
    follower.resume(index);
    setWordIndex(index);
    if (speedRef.current) {
      speedRef.current = { startedAt: Date.now(), startIndex: index };
    }
  };

  const toggleKept = async (takeId: string) => {
    const take = takesRef.current.find(item => item.id === takeId);
    if (!take || take.status !== 'saved') return;
    const kept = !take.kept;
    setTakes(current =>
      current.map(item => (item.id === takeId ? { ...item, kept } : item))
    );
    try {
      await setTeleprompterTakeKeptClient(takeId, kept);
      if (kept) {
        trackTeleprompterFunnel('teleprompter_take_kept', {
          ...funnel,
          takeSource: take.source,
          takeNumber: take.number,
        });
      }
    } catch {
      setTakes(current =>
        current.map(item =>
          item.id === takeId ? { ...item, kept: !kept } : item
        )
      );
      setNotice("Couldn't update that take. Try again.");
    }
  };

  const retrySave = (takeId: string) => {
    void fetch(
      takesRef.current.find(item => item.id === takeId)?.localUrl ?? ''
    )
      .then(response => response.blob())
      .then(blob => {
        const take = takesRef.current.find(item => item.id === takeId);
        if (!take) return;
        setTakes(current =>
          current.map(item =>
            item.id === takeId ? { ...item, status: 'uploading' } : item
          )
        );
        return saveTake(take, blob);
      })
      .catch(() => setNotice("Couldn't retry that take."));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (phase === 'recording') {
          void stopRecording();
        } else if (lightOpen || sheetOpen) {
          setLightOpen(false);
          setSheetOpen(false);
        } else {
          close();
        }
        return;
      }
      if (event.key === ' ' && !isTypingTarget(event.target)) {
        event.preventDefault();
        toggleRecording();
      }
    };
    globalThis.window.addEventListener('keydown', onKeyDown);
    return () => globalThis.window.removeEventListener('keydown', onKeyDown);
  }, [close, lightOpen, phase, sheetOpen, stopRecording, toggleRecording]);

  const isRecording = phase === 'recording';
  const ringWidth =
    light.mode === 'full' ? 'max(18vmin, 96px)' : `${light.width}px`;
  const style = {
    ...ringLightStyle(light),
    '--studio-ring-width': ringWidth,
  } as CSSProperties;
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
      className='fixed inset-0 z-50 overflow-hidden bg-base text-white/95'
      style={style}
      data-testid='teleprompter-studio'
      data-phase={phase}
    >
      <div className='absolute inset-0 bg-black/90' aria-hidden='true' />

      {/* Ghost camera: mirrored and dim behind the words; Peek shows it full. */}
      <div
        className='absolute overflow-hidden rounded-(--system-b-radius-panel-inner)'
        style={{ inset: 'var(--studio-ring-width)' }}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className={cn(
            'h-full w-full -scale-x-100 object-cover transition-opacity duration-slow ease-out motion-reduce:transition-none',
            peek
              ? 'opacity-100'
              : phase === 'between'
                ? 'opacity-15'
                : 'opacity-30'
          )}
          data-testid='teleprompter-studio-camera'
        />
        {grid ? (
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3'
          >
            {GRID_CELLS.map(cell => (
              <span key={cell} className='border border-white/15' />
            ))}
          </div>
        ) : null}
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/10 to-black/60'
        />
      </div>

      {/* The ring light: the only bright thing on screen. */}
      <div
        aria-hidden='true'
        className='pointer-events-none absolute inset-0'
        style={{
          boxShadow:
            'inset 0 0 0 var(--studio-ring-width) rgb(var(--studio-ring-rgb) / var(--studio-ring-level)), inset 0 0 calc(var(--studio-ring-width) * 1.6) calc(var(--studio-ring-width) * 0.8) rgb(var(--studio-ring-rgb) / calc(var(--studio-ring-level) * 0.5))',
        }}
        data-testid='teleprompter-studio-ring'
      />

      <div
        className='absolute flex flex-col'
        style={{ inset: 'calc(var(--studio-ring-width) + 14px)' }}
      >
        <header className='flex items-center justify-between gap-3'>
          <div className='flex items-center gap-2'>
            {isRecording ? (
              <Badge tone='error'>
                <span className='mr-1.5 inline-block size-1.5 rounded-full bg-error' />
                <span className='tabular-nums'>
                  Take {takes.length + 1} · {formatTakeDuration(elapsedMs)}
                </span>
              </Badge>
            ) : savedCount > 0 ? (
              <Badge tone='success'>
                {savedCount} {savedCount === 1 ? 'Take' : 'Takes'} Saved
              </Badge>
            ) : (
              <Badge tone='neutral'>{context.title}</Badge>
            )}
          </div>
          <div className='flex items-center gap-2'>
            {mode === 'script' && phase !== 'between' ? (
              <Badge tone={followMode === 'voice' ? 'accent' : 'neutral'}>
                {followMode === 'voice' ? (
                  <Mic className='mr-1 size-3' aria-hidden='true' />
                ) : null}
                {followLabel}
              </Badge>
            ) : null}
            <IconButton
              variant='frosted'
              size='md'
              ariaLabel='Close studio'
              onClick={close}
              disabled={isRecording}
              data-testid='teleprompter-studio-close'
            >
              <X className='size-4' aria-hidden='true' />
            </IconButton>
          </div>
        </header>

        <main className='relative mx-auto mt-8 w-4/5 max-w-2xl flex-1 overflow-hidden'>
          {camera.status === 'blocked' ? (
            <StudioCameraBlocked
              error={camera.error}
              onRetry={startCamera}
              onClose={close}
            />
          ) : phase === 'between' ? (
            <section
              aria-live='polite'
              className='flex flex-col items-start gap-5 pt-12'
              data-testid='teleprompter-studio-question'
            >
              <span className='flex items-center gap-2 text-app text-white/70 font-medium'>
                <span
                  aria-hidden='true'
                  className='size-4.5 rounded-full bg-accent'
                />
                Jovie asks
              </span>
              <p className='max-w-md text-2xl leading-tight tracking-tight md:text-3xl xl:text-4xl font-semibold text-balance'>
                {currentQuestion}
              </p>
              <span className='flex items-center gap-2 text-app text-white/55'>
                {voiceEnabled ? (
                  <Volume2 className='size-3.5' aria-hidden='true' />
                ) : (
                  <VolumeX className='size-3.5' aria-hidden='true' />
                )}
                {voiceStatusCopy({
                  kind: voiceOutput,
                  enabled: voiceEnabled,
                  supported: speaker.supported,
                })}
              </span>
              <div className='flex flex-wrap gap-2'>
                <Button
                  variant='primary'
                  onClick={() => startRecording('answer')}
                >
                  Answer On Camera
                </Button>
                <Button variant='secondary' onClick={nextQuestion}>
                  Another Question
                </Button>
                <Button variant='ghost' onClick={backToScript}>
                  Back To Script
                </Button>
              </div>
            </section>
          ) : mode === 'answer' ? (
            <section
              className='pt-12'
              data-testid='teleprompter-studio-answering'
            >
              <span className='text-app text-white/55'>Answering</span>
              <p className='mt-3 max-w-md text-xl leading-tight tracking-tight md:text-2xl xl:text-3xl text-white/80 font-semibold text-balance'>
                {currentQuestion}
              </p>
            </section>
          ) : (
            <StudioScript
              words={words}
              nextWordIndex={wordIndex}
              onSeek={seek}
            />
          )}
        </main>

        {notice ? (
          <p role='status' className='mx-auto mb-3 text-app text-white/70'>
            {notice}
          </p>
        ) : null}

        <nav
          aria-label='Studio Controls'
          className={cn(
            'mx-auto flex items-center gap-0.5 rounded-full border border-default bg-surface-3 p-1.5 text-primary-token shadow-xl backdrop-blur-md transition-opacity duration-slow ease-out motion-reduce:transition-none',
            chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
          )}
        >
          {followMode === 'speed' ? (
            <Button
              variant='ghost'
              size='sm'
              onClick={() => {
                const position = SPEED_STEPS.indexOf(
                  wordsPerMinute as (typeof SPEED_STEPS)[number]
                );
                const next =
                  SPEED_STEPS[(position + 1) % SPEED_STEPS.length] ??
                  AUTO_SCROLL_DEFAULT_WPM;
                setWordsPerMinute(next);
                if (speedRef.current) {
                  speedRef.current = {
                    startedAt: Date.now(),
                    startIndex: follower.nextWordIndex,
                  };
                }
              }}
            >
              <Gauge className='mr-1.5 size-3.5' aria-hidden='true' />
              Speed
            </Button>
          ) : (
            <Button
              variant='ghost'
              size='sm'
              disabled={isRecording}
              onClick={() => setFollowMode('speed')}
            >
              <Gauge className='mr-1.5 size-3.5' aria-hidden='true' />
              Speed
            </Button>
          )}
          <Button
            variant={grid ? 'secondary' : 'ghost'}
            size='sm'
            aria-pressed={grid}
            onClick={() => setGrid(value => !value)}
          >
            <Grid3x3 className='mr-1.5 size-3.5' aria-hidden='true' />
            Grid
          </Button>
          <Button
            variant={peek ? 'secondary' : 'ghost'}
            size='sm'
            aria-pressed={peek}
            onClick={() => setPeek(value => !value)}
          >
            <Eye className='mr-1.5 size-3.5' aria-hidden='true' />
            Peek
          </Button>

          <button
            ref={recordButtonRef}
            type='button'
            onClick={toggleRecording}
            disabled={camera.status !== 'live'}
            aria-label={
              isRecording
                ? 'Stop recording'
                : phase === 'between'
                  ? 'Record your answer'
                  : 'Start recording'
            }
            className='relative mx-1.5 grid size-11 place-items-center rounded-full border-2 border-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-page disabled:opacity-45'
            data-testid='teleprompter-studio-record'
          >
            <span
              aria-hidden='true'
              className={cn(
                'block size-7.5 bg-error transition-transform duration-slow ease-out motion-reduce:transition-none',
                isRecording ? 'scale-50 rounded-sm' : 'rounded-full'
              )}
            />
          </button>

          <Button
            variant={lightOpen ? 'secondary' : 'ghost'}
            size='sm'
            aria-expanded={lightOpen}
            onClick={() => {
              setLightOpen(value => !value);
              setSheetOpen(false);
            }}
          >
            <Sun className='mr-1.5 size-3.5' aria-hidden='true' />
            Light
          </Button>
          {speaker.supported ? (
            <Button
              variant={voiceEnabled ? 'secondary' : 'ghost'}
              size='sm'
              aria-pressed={voiceEnabled}
              onClick={() => setVoiceEnabled(value => !value)}
            >
              {voiceEnabled ? (
                <Volume2 className='mr-1.5 size-3.5' aria-hidden='true' />
              ) : (
                <VolumeX className='mr-1.5 size-3.5' aria-hidden='true' />
              )}
              Voice
            </Button>
          ) : null}
          <span aria-hidden='true' className='mx-1 h-4.5 w-px bg-surface-2' />
          <Button
            variant='ghost'
            size='sm'
            disabled={takes.length === 0 || isRecording}
            aria-expanded={sheetOpen}
            onClick={() => {
              setSheetOpen(value => !value);
              setLightOpen(false);
            }}
          >
            <Layers className='mr-1.5 size-3.5' aria-hidden='true' />
            Takes {takes.length > 0 ? takes.length : ''}
          </Button>
          <Kbd className='ml-1 hidden md:inline-flex'>Space</Kbd>
        </nav>
      </div>

      {lightOpen ? (
        <StudioLightPanel
          settings={light}
          onChange={setLight}
          onClose={() => setLightOpen(false)}
        />
      ) : null}

      {sheetOpen ? (
        <StudioTakesSheet
          title={context.title}
          takes={takes}
          onToggleKept={takeId => void toggleKept(takeId)}
          onRetry={retrySave}
          onClose={() => setSheetOpen(false)}
          onDone={close}
        />
      ) : null}
    </div>
  );

  return createPortal(studio, document.body);
}
