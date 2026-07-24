'use client';

import { Button } from '@jovie/ui';
import { Loader2, Pause, Play } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  pausePlaybackForInterruption,
  resumePlaybackAfterInterruption,
  useTrackAudioPlayer,
} from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { decodeWaveformPeaks } from '@/lib/audio/decode-waveform-peaks';
import {
  type AudioSnippet,
  createDefaultSnippet,
  formatSnippetRange,
  MIN_SNIPPET_DURATION_MS,
  normalizeSnippet,
} from '@/lib/audio/snippet';
import { formatTime } from '@/lib/format-time';
import {
  type InteractionLatencyMarkHandle,
  markInteractionStart,
  measureInteractionPoint,
} from '@/lib/monitoring/interaction-latency';
import { cn } from '@/lib/utils';

type TrimHandle = 'start' | 'end';

const WAVEFORM_WIDTH = 1000;
const WAVEFORM_HEIGHT = 56;
const TRIM_KEY_STEP_MS = 1_000;

function finishLatencyMark(
  mark: InteractionLatencyMarkHandle | null,
  point: string
): null {
  const measureName = measureInteractionPoint(mark, point);
  if (mark && typeof performance !== 'undefined') {
    performance.clearMarks?.(mark.startMark);
    performance.clearMarks?.(`${mark.id}:${point}`);
  }
  if (measureName && typeof performance !== 'undefined') {
    performance.clearMeasures?.(measureName);
  }
  return null;
}

function peaksToPath(peaks: readonly number[]): string {
  if (peaks.length === 0) return '';
  const stride = WAVEFORM_WIDTH / peaks.length;
  const centerY = WAVEFORM_HEIGHT / 2;
  const amplitude = WAVEFORM_HEIGHT / 2 - 2;
  const top: string[] = [];
  const bottom: string[] = [];

  peaks.forEach((peak, index) => {
    const x = index * stride;
    const half = peak * amplitude;
    top.push(
      `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${(centerY - half).toFixed(2)}`
    );
    bottom.push(`L ${x.toFixed(2)} ${(centerY + half).toFixed(2)}`);
  });

  return `${top.join(' ')} ${[...bottom].reverse().join(' ')} Z`;
}

function percentFromMs(ms: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  return Math.max(0, Math.min(100, (ms / durationMs) * 100));
}

function msFromClientX(
  clientX: number,
  rect: DOMRect,
  durationMs: number
): number {
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return Math.round(ratio * durationMs);
}

export interface AudioWaveformEditorProps {
  readonly audioUrl: string;
  readonly durationMs?: number | null;
  readonly initialSnippet?: AudioSnippet | null;
  readonly onSaveSnippet?: (snippet: AudioSnippet) => Promise<void>;
  readonly disabled?: boolean;
}

export function AudioWaveformEditor({
  audioUrl,
  durationMs,
  initialSnippet,
  onSaveSnippet,
  disabled = false,
}: AudioWaveformEditorProps) {
  const uid = useId().replace(/:/g, '-');
  const waveformRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const snippetRef = useRef<AudioSnippet | null>(initialSnippet ?? null);
  const initialSnippetRef = useRef<AudioSnippet | null>(initialSnippet ?? null);
  const durationMsRef = useRef<number | null>(durationMs ?? null);
  const dragRef = useRef<TrimHandle | null>(null);
  const holdsGlobalFocusRef = useRef(false);
  const playGenerationRef = useRef(0);
  const playLatencyMarkRef = useRef<InteractionLatencyMarkHandle | null>(null);
  const seekLatencyMarkRef = useRef<InteractionLatencyMarkHandle | null>(null);
  const { playbackState: globalPlayback } = useTrackAudioPlayer();

  const [peaks, setPeaks] = useState<readonly number[]>([]);
  const [resolvedDurationMs, setResolvedDurationMs] = useState(durationMs ?? 0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [snippet, setSnippet] = useState<AudioSnippet | null>(
    initialSnippet ?? null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const activeDurationMs = resolvedDurationMs > 0 ? resolvedDurationMs : 0;
  const waveformPath = useMemo(() => peaksToPath(peaks), [peaks]);
  const playheadPercent = percentFromMs(currentTimeMs, activeDurationMs);
  const snippetStartPercent = snippet
    ? percentFromMs(snippet.startMs, activeDurationMs)
    : 0;
  const snippetEndPercent = snippet
    ? percentFromMs(snippet.endMs, activeDurationMs)
    : 100;
  snippetRef.current = snippet;
  initialSnippetRef.current = initialSnippet ?? null;
  durationMsRef.current = durationMs ?? null;

  useEffect(() => {
    setSnippet(initialSnippet ?? null);
  }, [initialSnippet]);

  useEffect(() => {
    setPeaks([]);
    setResolvedDurationMs(durationMsRef.current ?? 0);
    setCurrentTimeMs(0);
    setIsPlaying(false);
    setSnippet(initialSnippetRef.current);
  }, [audioUrl]);

  useEffect(() => {
    if (durationMs !== null && durationMs !== undefined && durationMs > 0) {
      setResolvedDurationMs(durationMs);
    }
  }, [durationMs]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    decodeWaveformPeaks(audioUrl)
      .then(result => {
        if (cancelled) return;
        setPeaks(result.peaks);
        const resolvedDuration = durationMsRef.current ?? result.durationMs;
        setResolvedDurationMs(resolvedDuration);
        setSnippet(current => {
          if (current) return current;
          return createDefaultSnippet(resolvedDuration);
        });
      })
      .catch(error => {
        if (cancelled) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Unable to render waveform preview'
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [audioUrl, loadAttempt]);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audio.preload = 'metadata';
    audioRef.current = audio;

    const releaseGlobalFocus = () => {
      if (!holdsGlobalFocusRef.current) return;
      holdsGlobalFocusRef.current = false;
      resumePlaybackAfterInterruption();
    };
    const isCurrentSource = () => audioRef.current === audio;

    const handleTimeUpdate = () => {
      if (!isCurrentSource()) return;
      setCurrentTimeMs(Math.round(audio.currentTime * 1000));
      const activeSnippet = snippetRef.current;
      if (!activeSnippet) return;
      if (audio.currentTime * 1000 >= activeSnippet.endMs) {
        audio.pause();
        audio.currentTime = activeSnippet.startMs / 1000;
        setIsPlaying(false);
        releaseGlobalFocus();
      }
    };
    const handleEnded = () => {
      if (!isCurrentSource()) return;
      setIsPlaying(false);
      releaseGlobalFocus();
    };
    const handlePlaying = () => {
      if (!isCurrentSource()) return;
      playLatencyMarkRef.current = finishLatencyMark(
        playLatencyMarkRef.current,
        'audible'
      );
      setIsPlaying(true);
    };
    const handlePause = () => {
      if (!isCurrentSource()) return;
      setIsPlaying(false);
    };
    const handleSeeking = () => {
      if (!isCurrentSource()) return;
      seekLatencyMarkRef.current ??= markInteractionStart('audio-snippet-seek');
    };
    const handleSeeked = () => {
      if (!isCurrentSource()) return;
      seekLatencyMarkRef.current = finishLatencyMark(
        seekLatencyMarkRef.current,
        'settled'
      );
      setCurrentTimeMs(Math.round(audio.currentTime * 1000));
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('seeking', handleSeeking);
    audio.addEventListener('seeked', handleSeeked);

    return () => {
      playGenerationRef.current += 1;
      try {
        if (!audio.paused) audio.pause();
      } catch {
        // jsdom throws Not implemented for HTMLMediaElement.pause
      }
      audio.src = '';
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('seeking', handleSeeking);
      audio.removeEventListener('seeked', handleSeeked);
      if (audioRef.current === audio) audioRef.current = null;
      playLatencyMarkRef.current = finishLatencyMark(
        playLatencyMarkRef.current,
        'unmounted'
      );
      seekLatencyMarkRef.current = finishLatencyMark(
        seekLatencyMarkRef.current,
        'unmounted'
      );
      releaseGlobalFocus();
    };
  }, [audioUrl]);

  useEffect(() => {
    if (!globalPlayback.isPlaying) return;
    const audio = audioRef.current;
    if (!audio) return;
    playGenerationRef.current += 1;
    playLatencyMarkRef.current = finishLatencyMark(
      playLatencyMarkRef.current,
      'interrupted'
    );
    seekLatencyMarkRef.current = finishLatencyMark(
      seekLatencyMarkRef.current,
      'interrupted'
    );
    if (!audio.paused) audio.pause();
    setIsPlaying(false);
    if (holdsGlobalFocusRef.current) {
      holdsGlobalFocusRef.current = false;
      resumePlaybackAfterInterruption();
    }
  }, [globalPlayback.isPlaying, globalPlayback.activeTrackId]);

  const seekTo = useCallback(
    (nextMs: number) => {
      const audio = audioRef.current;
      if (!audio || activeDurationMs <= 0) return;
      const clamped = Math.max(0, Math.min(nextMs, activeDurationMs));
      seekLatencyMarkRef.current = finishLatencyMark(
        seekLatencyMarkRef.current,
        'superseded'
      );
      seekLatencyMarkRef.current = markInteractionStart('audio-snippet-seek');
      audio.currentTime = clamped / 1000;
      setCurrentTimeMs(clamped);
    },
    [activeDurationMs]
  );

  const handleTogglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      playGenerationRef.current += 1;
      playLatencyMarkRef.current = finishLatencyMark(
        playLatencyMarkRef.current,
        'paused'
      );
      audio.pause();
      if (holdsGlobalFocusRef.current) {
        holdsGlobalFocusRef.current = false;
        resumePlaybackAfterInterruption();
      }
      return;
    }

    if (snippet) {
      if (
        audio.currentTime * 1000 < snippet.startMs ||
        audio.currentTime * 1000 >= snippet.endMs
      ) {
        audio.currentTime = snippet.startMs / 1000;
      }
    }

    if (!holdsGlobalFocusRef.current) {
      pausePlaybackForInterruption();
      holdsGlobalFocusRef.current = true;
    }

    playLatencyMarkRef.current = finishLatencyMark(
      playLatencyMarkRef.current,
      'superseded'
    );
    playLatencyMarkRef.current = markInteractionStart('audio-snippet-play');
    const generation = ++playGenerationRef.current;
    try {
      await audio.play();
      if (
        audioRef.current === audio &&
        playGenerationRef.current === generation
      ) {
        setIsPlaying(true);
      }
    } catch {
      if (
        audioRef.current !== audio ||
        playGenerationRef.current !== generation
      ) {
        return;
      }
      playLatencyMarkRef.current = finishLatencyMark(
        playLatencyMarkRef.current,
        'failed'
      );
      setIsPlaying(false);
      if (holdsGlobalFocusRef.current) {
        holdsGlobalFocusRef.current = false;
        resumePlaybackAfterInterruption();
      }
    }
  }, [isPlaying, snippet]);

  const updateSnippetHandle = useCallback(
    (handle: TrimHandle, nextMs: number) => {
      if (!snippet || activeDurationMs <= 0) return;

      const candidate =
        handle === 'start'
          ? { startMs: nextMs, endMs: snippet.endMs }
          : { startMs: snippet.startMs, endMs: nextMs };

      const normalized = normalizeSnippet(candidate, activeDurationMs);
      if (normalized) setSnippet(normalized);
    },
    [activeDurationMs, snippet]
  );

  const handleHandlePointerDown = useCallback(
    (handle: TrimHandle) => (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      event.stopPropagation();
      dragRef.current = handle;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [disabled]
  );

  const handleHandlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const dragHandle = dragRef.current;
      const container = waveformRef.current;
      if (!dragHandle || !container || activeDurationMs <= 0) return;

      const rect = container.getBoundingClientRect();
      updateSnippetHandle(
        dragHandle,
        msFromClientX(event.clientX, rect, activeDurationMs)
      );
    },
    [activeDurationMs, updateSnippetHandle]
  );

  const handleHandlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleHandleKeyDown = useCallback(
    (handle: TrimHandle) => (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (disabled || !snippet || activeDurationMs <= 0) return;

      const currentValue = handle === 'start' ? snippet.startMs : snippet.endMs;
      let nextValue: number | null = null;
      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          nextValue = currentValue - TRIM_KEY_STEP_MS;
          break;
        case 'ArrowRight':
        case 'ArrowUp':
          nextValue = currentValue + TRIM_KEY_STEP_MS;
          break;
        case 'Home':
          nextValue = 0;
          break;
        case 'End':
          nextValue = activeDurationMs;
          break;
        default:
          return;
      }

      event.preventDefault();
      updateSnippetHandle(handle, nextValue);
    },
    [activeDurationMs, disabled, snippet, updateSnippetHandle]
  );

  const handleSaveSnippet = useCallback(async () => {
    if (!snippet || !onSaveSnippet) return;
    const normalized = normalizeSnippet(snippet, activeDurationMs);
    if (!normalized) return;

    setIsSaving(true);
    try {
      await onSaveSnippet(normalized);
      setSnippet(normalized);
    } finally {
      setIsSaving(false);
    }
  }, [activeDurationMs, onSaveSnippet, snippet]);

  return (
    <div className='space-y-3' data-testid='audio-waveform-editor'>
      <div className='flex items-center justify-between gap-2'>
        <Button
          variant='secondary'
          size='icon'
          onClick={() => {
            handleTogglePlayback().catch(() => {});
          }}
          disabled={
            disabled || isLoading || Boolean(loadError) || activeDurationMs <= 0
          }
          aria-label={
            isPlaying ? 'Pause waveform preview' : 'Play waveform preview'
          }
        >
          {isPlaying ? (
            <Pause className='h-3.5 w-3.5' strokeWidth={2.5} />
          ) : (
            <Play className='h-3.5 w-3.5 translate-x-px' strokeWidth={2.5} />
          )}
        </Button>
        <div className='min-w-0 text-right text-2xs text-tertiary-token tabular-nums'>
          <span>{formatTime(currentTimeMs / 1000)}</span>
          <span className='mx-1 text-quaternary-token'>/</span>
          <span>{formatTime(activeDurationMs / 1000)}</span>
        </div>
      </div>

      <div
        ref={waveformRef}
        className={cn(
          'relative h-14 overflow-hidden rounded-lg border border-subtle bg-surface-0 focus-within:ring-2 focus-within:ring-(--linear-border-focus)/55 focus-within:ring-offset-2 focus-within:ring-offset-(--linear-app-content-surface)',
          disabled ? 'pointer-events-none opacity-60' : 'cursor-pointer'
        )}
        data-testid='audio-waveform-surface'
      >
        {isLoading ? (
          <div className='flex h-full items-center justify-center'>
            <Loader2
              className='h-4 w-4 animate-spin text-tertiary-token motion-reduce:animate-none'
              aria-hidden='true'
            />
          </div>
        ) : loadError ? (
          <div
            className='flex h-full items-center justify-center gap-2 px-3 text-2xs text-secondary-token'
            data-testid='audio-waveform-error'
          >
            <span>Waveform unavailable.</span>
            <Button
              variant='tertiary'
              size='sm'
              onClick={() => setLoadAttempt(attempt => attempt + 1)}
            >
              Retry
            </Button>
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${WAVEFORM_WIDTH} ${WAVEFORM_HEIGHT}`}
              preserveAspectRatio='none'
              className='h-full w-full'
              aria-hidden='true'
            >
              <defs>
                <clipPath id={`wave-played-${uid}`}>
                  <rect
                    x='0'
                    y='0'
                    width={(WAVEFORM_WIDTH * playheadPercent) / 100}
                    height={WAVEFORM_HEIGHT}
                  />
                </clipPath>
              </defs>
              <path
                d={waveformPath}
                className='fill-current text-quaternary-token opacity-30'
              />
              <path
                d={waveformPath}
                fill='var(--color-accent)'
                fillOpacity='0.8'
                clipPath={`url(#wave-played-${uid})`}
              />
            </svg>

            <input
              type='range'
              min={0}
              max={activeDurationMs}
              step={100}
              value={Math.min(currentTimeMs, activeDurationMs)}
              onChange={event => seekTo(Number(event.currentTarget.value))}
              disabled={disabled || activeDurationMs <= 0}
              aria-label='Waveform Position'
              aria-valuetext={formatTime(currentTimeMs / 1000)}
              className='absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default'
            />

            {snippet ? (
              <>
                <div
                  className='pointer-events-none absolute inset-y-0 bg-accent/10'
                  style={{
                    left: `${snippetStartPercent}%`,
                    right: `${100 - snippetEndPercent}%`,
                  }}
                />
                <button
                  type='button'
                  role='slider'
                  aria-label='Adjust Snippet Start'
                  aria-valuemin={0}
                  aria-valuemax={Math.max(
                    0,
                    snippet.endMs - MIN_SNIPPET_DURATION_MS
                  )}
                  aria-valuenow={snippet.startMs}
                  aria-valuetext={formatTime(snippet.startMs / 1000)}
                  onPointerDown={handleHandlePointerDown('start')}
                  onPointerMove={handleHandlePointerMove}
                  onPointerUp={handleHandlePointerUp}
                  onPointerCancel={handleHandlePointerUp}
                  onKeyDown={handleHandleKeyDown('start')}
                  disabled={disabled || activeDurationMs <= 0}
                  className='focus-ring-themed absolute inset-y-0 z-10 w-11 -translate-x-1/2 rounded-md'
                  style={{ left: `${snippetStartPercent}%` }}
                >
                  <span className='pointer-events-none absolute top-1 bottom-1 left-1/2 w-1.5 -translate-x-1/2 rounded-full border border-accent/70 bg-accent shadow-sm' />
                </button>
                <button
                  type='button'
                  role='slider'
                  aria-label='Adjust Snippet End'
                  aria-valuemin={Math.min(
                    activeDurationMs,
                    snippet.startMs + MIN_SNIPPET_DURATION_MS
                  )}
                  aria-valuemax={activeDurationMs}
                  aria-valuenow={snippet.endMs}
                  aria-valuetext={formatTime(snippet.endMs / 1000)}
                  onPointerDown={handleHandlePointerDown('end')}
                  onPointerMove={handleHandlePointerMove}
                  onPointerUp={handleHandlePointerUp}
                  onPointerCancel={handleHandlePointerUp}
                  onKeyDown={handleHandleKeyDown('end')}
                  disabled={disabled || activeDurationMs <= 0}
                  className='focus-ring-themed absolute inset-y-0 z-10 w-11 -translate-x-1/2 rounded-md'
                  style={{ left: `${snippetEndPercent}%` }}
                >
                  <span className='pointer-events-none absolute top-1 bottom-1 left-1/2 w-1.5 -translate-x-1/2 rounded-full border border-accent/70 bg-accent shadow-sm' />
                </button>
              </>
            ) : null}

            <div
              className='pointer-events-none absolute inset-y-0 w-px bg-white/80'
              style={{ left: `${playheadPercent}%` }}
            />
          </>
        )}
      </div>

      <div className='flex min-h-9 items-center justify-between gap-2'>
        {snippet && !isLoading && !loadError ? (
          <>
            <p className='text-2xs text-secondary-token'>
              Snippet: {formatSnippetRange(snippet.startMs, snippet.endMs)}
            </p>
            {onSaveSnippet ? (
              <Button
                variant='secondary'
                size='sm'
                onClick={() => {
                  handleSaveSnippet().catch(() => {});
                }}
                disabled={disabled || isSaving}
                data-testid='audio-snippet-save'
              >
                {isSaving ? 'Saving…' : 'Save Snippet'}
              </Button>
            ) : null}
          </>
        ) : (
          <span aria-hidden='true' />
        )}
      </div>
    </div>
  );
}
