'use client';

import { type MouseEvent as ReactMouseEvent, useId, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { CueKind, RowWaveformDatum } from './row-waveform.types';

const ROW_WF_W = 600;
const ROW_WF_H = 24;
const ROW_WF_CY = ROW_WF_H / 2;
const ROW_WF_AMP = ROW_WF_H / 2 - 1;
const PEAK_COUNT = 120;

/** Cue marker line tones — the *only* signal of section, never loud. */
const CUE_TONE_LINE: Record<CueKind, string> = {
  intro: 'bg-sky-400/45',
  verse: 'bg-tertiary-token/40',
  chorus: 'bg-emerald-400/55',
  drop: 'bg-amber-400/65',
  bridge: 'bg-violet-400/55',
  outro: 'bg-quaternary-token/55',
};
/** Matching cue dot tones for the small marker on the top edge. */
const CUE_TONE_DOT: Record<CueKind, string> = {
  intro: 'bg-sky-400',
  verse: 'bg-tertiary-token',
  chorus: 'bg-emerald-400',
  drop: 'bg-amber-400',
  bridge: 'bg-violet-400',
  outro: 'bg-quaternary-token',
};

/** Deterministic 1D hash so the synthesised waveform is render-stable. */
function hash1d(i: number): number {
  return Math.abs(Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1;
}

/**
 * Generate `PEAK_COUNT` peak amplitudes in [0.08, 1] for a given seed.
 * Track-envelope-shaped curve with deterministic per-sample noise so the
 * same track always paints the same waveform.
 */
function rowWaveformPeaks(seed: number): readonly number[] {
  return Array.from({ length: PEAK_COUNT }).map((_, i) => {
    const a =
      0.4 +
      0.32 * Math.abs(Math.sin((i + seed * 11) * 0.18)) +
      0.22 * Math.abs(Math.cos((i + seed * 7) * 0.31));
    const noise = hash1d(i + seed * 1000);
    return Math.max(0.08, Math.min(1, a * (0.55 + noise * 0.45)));
  });
}

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

export interface RowWaveformProps {
  readonly track: RowWaveformDatum;
  /**
   * Current playback position in seconds. Used both for the playhead
   * and to compute which bars render saturated.
   */
  readonly currentTimeSec: number;
  /**
   * When false, the waveform paints fully muted (no playhead, no
   * saturated bars). Use for non-current rows in a list view.
   */
  readonly isCurrentTrack: boolean;
  /** Called with a seek time (seconds) when the user clicks the strip. */
  readonly onSeek: (sec: number) => void;
  readonly className?: string;
}

/**
 * RowWaveform — inline mini waveform for a track / release row. Click
 * anywhere along the strip to seek; cue markers (intro / verse /
 * chorus / drop / bridge / outro) overlay as muted vertical lines with
 * a small colored dot on the top edge that brightens on hover.
 *
 * The waveform shape is deterministic for a given `waveformSeed`, so
 * each track always paints the same silhouette without needing to
 * stream peaks from disk. The playhead clip-path uses `useId()` so
 * multiple RowWaveforms on the same page don't collide on a shared id.
 */
export function RowWaveform({
  track,
  currentTimeSec,
  isCurrentTrack,
  onSeek,
  className,
}: RowWaveformProps) {
  const peaks = useMemo(
    () => rowWaveformPeaks(track.waveformSeed),
    [track.waveformSeed]
  );
  const playedPct = isCurrentTrack
    ? (currentTimeSec / track.durationSec) * 100
    : 0;
  const stride = ROW_WF_W / peaks.length;
  const clipId = useId();

  function handleClick(e: ReactMouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    // Guard against a 0-width rect during layout transitions; would
    // otherwise divide by zero and seek to NaN.
    if (rect.width <= 0) return;
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width)
    );
    onSeek(ratio * track.durationSec);
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: scrub via mouse; keyboard seek lands on a follow-up
    <div
      role='slider'
      aria-label={`Scrub ${track.title}`}
      aria-valuemin={0}
      aria-valuemax={track.durationSec}
      aria-valuenow={Math.round(currentTimeSec)}
      tabIndex={-1}
      onClick={handleClick}
      className={cn('group/wf relative h-7 cursor-pointer', className)}
    >
      <svg
        viewBox={`0 0 ${ROW_WF_W} ${ROW_WF_H}`}
        className='w-full h-full overflow-visible block'
        preserveAspectRatio='none'
        aria-hidden='true'
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x='0'
              y='0'
              width={(playedPct / 100) * ROW_WF_W}
              height={ROW_WF_H}
            />
          </clipPath>
        </defs>

        <g
          className={cn(
            'transition-opacity duration-150 ease-out',
            isCurrentTrack
              ? 'opacity-50'
              : 'opacity-35 group-hover/wf:opacity-55'
          )}
        >
          {peaks.map((h, i) => {
            const x = i * stride + stride / 2;
            const half = h * ROW_WF_AMP;
            return (
              <line
                // biome-ignore lint/suspicious/noArrayIndexKey: peak index is stable across renders for a given seed
                key={i}
                x1={x}
                x2={x}
                y1={ROW_WF_CY - half}
                y2={ROW_WF_CY + half}
                stroke='currentColor'
                strokeWidth='1.2'
                strokeLinecap='round'
                vectorEffect='non-scaling-stroke'
                className='text-tertiary-token'
              />
            );
          })}
        </g>

        {isCurrentTrack && (
          <g clipPath={`url(#${clipId})`}>
            {peaks.map((h, i) => {
              const x = i * stride + stride / 2;
              const half = h * ROW_WF_AMP;
              return (
                <line
                  // biome-ignore lint/suspicious/noArrayIndexKey: peak index is stable across renders for a given seed
                  key={i}
                  x1={x}
                  x2={x}
                  y1={ROW_WF_CY - half}
                  y2={ROW_WF_CY + half}
                  stroke='currentColor'
                  strokeWidth='1.4'
                  strokeLinecap='round'
                  vectorEffect='non-scaling-stroke'
                  className='text-primary-token'
                />
              );
            })}
          </g>
        )}

        {isCurrentTrack && (
          <line
            x1={(playedPct / 100) * ROW_WF_W}
            x2={(playedPct / 100) * ROW_WF_W}
            y1={0}
            y2={ROW_WF_H}
            stroke='currentColor'
            strokeWidth='1'
            className='text-primary-token'
            vectorEffect='non-scaling-stroke'
          />
        )}
      </svg>

      <div className='pointer-events-none absolute inset-0'>
        {track.cues.map(c => {
          const left = (c.at / track.durationSec) * 100;
          return (
            <span
              key={`${track.id}-${c.label}-${c.at}`}
              className='absolute inset-y-0'
              style={{ left: `${left}%`, transform: 'translateX(-0.5px)' }}
              title={`${c.label} · ${formatTime(c.at)}`}
            >
              <span
                className={cn(
                  'absolute inset-y-0 w-px transition-opacity duration-150 ease-out opacity-50 group-hover/wf:opacity-90',
                  CUE_TONE_LINE[c.kind]
                )}
              />
              <span
                className={cn(
                  'absolute -top-px h-[3px] w-[3px] rounded-full -translate-x-[1px] transition-opacity duration-150 ease-out opacity-80 group-hover/wf:opacity-100',
                  CUE_TONE_DOT[c.kind]
                )}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}
