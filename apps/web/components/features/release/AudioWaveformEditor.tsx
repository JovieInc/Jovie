'use client';

import { Loader2, Pause, Play } from 'lucide-react';
import {
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
  normalizeSnippet,
} from '@/lib/audio/snippet';
import { formatTime } from '@/lib/format-time';
import { cn } from '@/lib/utils';

type TrimHandle = 'start' | 'end';

const WAVEFORM_WIDTH = 1000;
const WAVEFORM_HEIGHT = 56;

function peaksToPath(peaks: readonly number[]): string {
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
  const dragRef = useRef<TrimHandle | null>(null);
  const holdsGlobalFocusRef = useRef(false);
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

  const activeDurationMs = resolvedDurationMs > 0 ? resolvedDurationMs : 0;
  const waveformPath = useMemo(() => peaksToPath(peaks), [peaks]);
  const playheadPercent = percentFromMs(currentTimeMs, activeDurationMs);
  const snippetStartPercent = snippet
    ? percentFromMs(snippet.startMs, activeDurationMs)
    : 0;
  const snippetEndPercent = snippet
    ? percentFromMs(snippet.endMs, activeDurationMs)
    : 100;

  useEffect(() => {
    setSnippet(initialSnippet ?? null);
  }, [initialSnippet]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    decodeWaveformPeaks(audioUrl)
      .then(result => {
        if (cancelled) return;
        setPeaks(result.peaks);
        setResolvedDurationMs(durationMs ?? result.durationMs);
        setSnippet(current => {
          if (current) return current;
          return createDefaultSnippet(durationMs ?? result.durationMs);
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
  }, [audioUrl, durationMs]);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audio.preload = 'metadata';
    audioRef.current = audio;

    const releaseGlobalFocus = () => {
      if (!holdsGlobalFocusRef.current) return;
      holdsGlobalFocusRef.current = false;
      resumePlaybackAfterInterruption();
    };

    const handleTimeUpdate = () => {
      setCurrentTimeMs(Math.round(audio.currentTime * 1000));
      if (!snippet) return;
      if (audio.currentTime * 1000 >= snippet.endMs) {
        audio.pause();
        audio.currentTime = snippet.startMs / 1000;
        setIsPlaying(false);
        releaseGlobalFocus();
      }
    };
    const handleEnded = () => {
      setIsPlaying(false);
      releaseGlobalFocus();
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      try {
        audio.pause();
      } catch {
        // jsdom throws Not implemented for HTMLMediaElement.pause
      }
      audio.src = '';
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audioRef.current = null;
      releaseGlobalFocus();
    };
  }, [audioUrl, snippet]);

  // Global engine wins: if dock/right-rail starts, stop local snippet preview.
  useEffect(() => {
    if (!globalPlayback.isPlaying) return;
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    audio.pause();
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
      audio.currentTime = clamped / 1000;
      setCurrentTimeMs(clamped);
    },
    [activeDurationMs]
  );

  const handleTogglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
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

    // Snippet editor keeps a local element for trim loops, but claims global
    // audio focus so dock/right-rail cannot dual-play (JOV-3683).
    if (!holdsGlobalFocusRef.current) {
      pausePlaybackForInterruption();
      holdsGlobalFocusRef.current = true;
    }

    try {
      await audio.play();
    } catch {
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

  const handleWaveformPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled || activeDurationMs <= 0) return;
      const rect = event.currentTarget.getBoundingClientRect();
      seekTo(msFromClientX(event.clientX, rect, activeDurationMs));
    },
    [activeDurationMs, disabled, seekTo]
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

  if (loadError) {
    return (
      <p className='text-xs text-error' data-testid='audio-waveform-error'>
        {loadError}
      </p>
    );
  }

  return (
    <div className='space-y-3' data-testid='audio-waveform-editor'>
      <div className='flex items-center justify-between gap-2'>
        <button
          type='button'
          onClick={() => {
            handleTogglePlayback().catch(() => {});
          }}
          disabled={disabled || isLoading || activeDurationMs <= 0}
          aria-label={
            isPlaying ? 'Pause waveform preview' : 'Play waveform preview'
          }
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-md border border-subtle bg-surface-1 text-primary-token transition-[background-color,border-color] duration-subtle hover:border-default hover:bg-surface-2',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-app-content-surface)'
          )}
        >
          {isPlaying ? (
            <Pause className='h-3.5 w-3.5' strokeWidth={2.5} />
          ) : (
            <Play className='h-3.5 w-3.5 translate-x-px' strokeWidth={2.5} />
          )}
        </button>
        <div className='min-w-0 text-right text-2xs text-tertiary-token tabular-nums'>
          <span>{formatTime(currentTimeMs / 1000)}</span>
          <span className='mx-1 text-quaternary-token'>/</span>
          <span>{formatTime(activeDurationMs / 1000)}</span>
        </div>
      </div>

      <div
        ref={waveformRef}
        className={cn(
          'relative h-14 overflow-hidden rounded-lg border border-subtle bg-surface-0',
          disabled ? 'pointer-events-none opacity-60' : 'cursor-pointer'
        )}
        onPointerDown={handleWaveformPointerDown}
        data-testid='audio-waveform-surface'
      >
        {isLoading ? (
          <div className='flex h-full items-center justify-center'>
            <Loader2
              className='h-4 w-4 animate-spin text-tertiary-token motion-reduce:animate-none'
              aria-hidden='true'
            />
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
                <linearGradient
                  id={`wave-fill-${uid}`}
                  x1='0%'
                  y1='0%'
                  x2='100%'
                  y2='0%'
                >
                  <stop offset='0%' stopColor='rgb(168 85 247 / 0.85)' />
                  <stop offset='55%' stopColor='rgb(236 72 153 / 0.85)' />
                  <stop offset='100%' stopColor='rgb(59 130 246 / 0.85)' />
                </linearGradient>
                <clipPath id={`wave-played-${uid}`}>
                  <rect
                    x='0'
                    y='0'
                    width={(WAVEFORM_WIDTH * playheadPercent) / 100}
                    height={WAVEFORM_HEIGHT}
                  />
                </clipPath>
              </defs>
              <path d={waveformPath} fill='rgb(148 163 184 / 0.28)' />
              <path
                d={waveformPath}
                fill={`url(#wave-fill-${uid})`}
                clipPath={`url(#wave-played-${uid})`}
              />
            </svg>

            {snippet ? (
              <>
                <div
                  className='pointer-events-none absolute inset-y-0 bg-cyan-400/10'
                  style={{
                    left: `${snippetStartPercent}%`,
                    right: `${100 - snippetEndPercent}%`,
                  }}
                />
                <button
                  type='button'
                  aria-label='Adjust snippet start'
                  onPointerDown={handleHandlePointerDown('start')}
                  onPointerMove={handleHandlePointerMove}
                  onPointerUp={handleHandlePointerUp}
                  className='absolute top-1 bottom-1 z-10 w-2 -translate-x-1/2 rounded-full border border-cyan-300/80 bg-cyan-400 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]'
                  style={{ left: `${snippetStartPercent}%` }}
                />
                <button
                  type='button'
                  aria-label='Adjust snippet end'
                  onPointerDown={handleHandlePointerDown('end')}
                  onPointerMove={handleHandlePointerMove}
                  onPointerUp={handleHandlePointerUp}
                  className='absolute top-1 bottom-1 z-10 w-2 -translate-x-1/2 rounded-full border border-cyan-300/80 bg-cyan-400 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]'
                  style={{ left: `${snippetEndPercent}%` }}
                />
              </>
            ) : null}

            <div
              className='pointer-events-none absolute inset-y-0 w-px bg-white/80'
              style={{ left: `${playheadPercent}%` }}
            />
          </>
        )}
      </div>

      {snippet ? (
        <div className='flex items-center justify-between gap-2'>
          <p className='text-2xs text-secondary-token'>
            Snippet: {formatSnippetRange(snippet.startMs, snippet.endMs)}
          </p>
          {onSaveSnippet ? (
            <button
              type='button'
              onClick={() => {
                handleSaveSnippet().catch(() => {});
              }}
              disabled={disabled || isSaving}
              className='inline-flex h-7 items-center rounded-md border border-subtle bg-surface-1 px-2.5 text-2xs font-medium text-primary-token transition-[background-color,border-color] duration-subtle hover:border-default hover:bg-surface-2 disabled:opacity-60'
              data-testid='audio-snippet-save'
            >
              {isSaving ? 'Saving…' : 'Save snippet'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
