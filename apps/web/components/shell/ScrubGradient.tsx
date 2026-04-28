'use client';

import { useId } from 'react';
import { formatTime } from '@/lib/format-time';
import { cn } from '@/lib/utils';

const SCRUB_W = 1000;
const SCRUB_H = 32; // includes 4px reserved at the top for cue dots
const WAVE_TOP = 6; // waveform area starts here (cue dots above)
const WAVE_H = SCRUB_H - WAVE_TOP;
const WAVE_CY = WAVE_TOP + WAVE_H / 2;
const WAVE_AMP = WAVE_H / 2 - 1;

const TIME_LABEL =
  'text-[10px] tabular-nums text-quaternary-token w-8 shrink-0';

export interface ScrubCue {
  /** Position as a percent (0–100) of the track duration. */
  readonly at: number;
  /** Cue label shown in the tooltip. */
  readonly label: string;
}

export interface ScrubLoopSection {
  /** Loop start as a percent (0–100). */
  readonly from: number;
  /** Loop end as a percent (0–100). */
  readonly to: number;
}

// Deterministic 1D hash so the audio-like waveform looks the same on
// every render (no animation; static rendering).
function hash1d(i: number): number {
  return Math.abs(Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1;
}

// Generate audio-like amplitude samples: long-form envelope * per-sample
// noise + occasional transients (kick-snare bursts). Values in [0.04, 1].
function makeAudio(n: number, seed: number): number[] {
  return Array.from({ length: n }).map((_, i) => {
    const t = i / n;
    const env =
      0.32 +
      0.42 * Math.abs(Math.sin(t * Math.PI * 1.1)) +
      0.18 * Math.sin(t * Math.PI * 2.7);
    const noise = hash1d(i + seed * 1000);
    const beat = Math.exp(-((((i + seed * 5) % 24) - 6) ** 2) / 6) * 0.5;
    return Math.max(
      0.04,
      Math.min(1, Math.abs(env) * (0.45 + noise * 0.55) + beat * 0.4)
    );
  });
}

const AUDIO_PEAK = makeAudio(320, 1);

// Solid filled mirror waveform (Audacity / Logic look). Production
// canonical — other variants from shell-v1 (hairlines / stereo / RMS /
// dense bars) were dev-picker-only and intentionally not extracted.
function filledStrandsPath(): string {
  const stride = SCRUB_W / AUDIO_PEAK.length;
  const top: string[] = [];
  const bot: string[] = [];
  AUDIO_PEAK.forEach((h, i) => {
    const x = i * stride;
    const half = h * WAVE_AMP;
    top.push(
      `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${(WAVE_CY - half).toFixed(2)}`
    );
    bot.push(`L ${x.toFixed(2)} ${(WAVE_CY + half).toFixed(2)}`);
  });
  return `${top.join(' ')} ${bot.toReversed().join(' ')} Z`;
}

const FILLED_PATH = filledStrandsPath();

/**
 * ScrubGradient — waveform scrub bar with playhead, cue markers, and
 * optional loop-section overlay.
 *
 * Pure renderer: all state comes from props. The playhead position is
 * derived from `currentTime / duration` — single source of truth.
 *
 * @example
 * ```tsx
 * <ScrubGradient
 *   currentTime={78}
 *   duration={213}
 *   cues={[{ at: 12, label: 'Intro' }, { at: 31, label: 'Verse' }]}
 *   loopMode='off'
 * />
 * ```
 */
export function ScrubGradient({
  currentTime,
  duration,
  cues = [],
  loopMode = 'off',
  loopSection,
  className,
}: {
  readonly currentTime: number;
  readonly duration: number;
  readonly cues?: readonly ScrubCue[];
  readonly loopMode?: 'off' | 'track' | 'section';
  /** Required when `loopMode === 'section'`. */
  readonly loopSection?: ScrubLoopSection;
  readonly className?: string;
}) {
  // useId() yields a per-instance prefix so multiple <ScrubGradient/>
  // instances don't share DOM-global SVG paint-server / clip-path IDs.
  const uid = useId().replace(/:/g, '-');
  const gradId = `scrub-grad-${uid}`;
  const edgeFadeId = `scrub-edge-fade-${uid}`;
  const fadeMaskId = `scrub-fade-mask-${uid}`;
  const playedClipId = `scrub-played-clip-${uid}`;

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrent = Number.isFinite(currentTime) ? currentTime : 0;
  const pct =
    safeDuration > 0
      ? Math.max(0, Math.min(100, (safeCurrent / safeDuration) * 100))
      : 0;
  const playedX = (pct / 100) * SCRUB_W;
  const sectionFromX = loopSection ? (loopSection.from / 100) * SCRUB_W : 0;
  const sectionToX = loopSection ? (loopSection.to / 100) * SCRUB_W : 0;

  return (
    <div className={cn('flex w-full items-center gap-2', className)}>
      <span className={cn(TIME_LABEL, 'text-right')}>
        {formatTime(safeCurrent)}
      </span>
      <div className='relative flex-1 min-w-[60px] h-8'>
        <svg
          viewBox={`0 0 ${SCRUB_W} ${SCRUB_H}`}
          className='w-full h-full overflow-visible'
          preserveAspectRatio='none'
          aria-hidden='true'
        >
          <defs>
            <linearGradient id={gradId} x1='0' y1='0' x2='1' y2='0'>
              <stop offset='0%' stopColor='#a78bfa' />
              <stop offset='35%' stopColor='#c084fc' />
              <stop offset='60%' stopColor='#f472b6' />
              <stop offset='100%' stopColor='#60a5fa' />
            </linearGradient>
            <linearGradient id={edgeFadeId} x1='0' y1='0' x2='1' y2='0'>
              <stop offset='0%' stopColor='white' stopOpacity='0' />
              <stop offset='10%' stopColor='white' stopOpacity='1' />
              <stop offset='90%' stopColor='white' stopOpacity='1' />
              <stop offset='100%' stopColor='white' stopOpacity='0' />
            </linearGradient>
            <mask id={fadeMaskId}>
              <rect
                x='0'
                y='0'
                width={SCRUB_W}
                height={SCRUB_H}
                fill={`url(#${edgeFadeId})`}
              />
            </mask>
            {/* Safari historically ignores clipPath defined outside <defs>. */}
            <clipPath id={playedClipId}>
              <rect x='0' y='0' width={playedX} height={SCRUB_H} />
            </clipPath>
          </defs>
          <g mask={`url(#${fadeMaskId})`} opacity={0.65}>
            <path d={FILLED_PATH} fill={`url(#${gradId})`} />
          </g>
          {/* Played overlay — brighter strands up to the playhead. */}
          <g mask={`url(#${fadeMaskId})`}>
            <g clipPath={`url(#${playedClipId})`} opacity={1}>
              <path d={FILLED_PATH} fill={`url(#${gradId})`} />
            </g>
          </g>
          {/* Cue dots — small markers above the waveform. */}
          {cues.map(c => {
            const cx = (c.at / 100) * SCRUB_W;
            return (
              <circle
                key={`${c.at}-${c.label}`}
                cx={cx}
                cy={3}
                r={1.6}
                fill='currentColor'
                className='text-quaternary-token'
              >
                <title>
                  {c.label} · {formatTime((c.at / 100) * safeDuration)}
                </title>
              </circle>
            );
          })}
          {/* Loop section band — only when loopMode === 'section'. */}
          {loopMode === 'section' && loopSection && (
            <rect
              x={sectionFromX}
              y={WAVE_TOP}
              width={sectionToX - sectionFromX}
              height={WAVE_H}
              fill='currentColor'
              className='text-cyan-300'
              opacity={0.12}
            />
          )}
          {/* Playhead line. */}
          <line
            x1={playedX}
            x2={playedX}
            y1={WAVE_TOP - 1}
            y2={SCRUB_H}
            stroke='currentColor'
            strokeWidth={1}
            className='text-primary-token'
          />
        </svg>
      </div>
      <span className={TIME_LABEL}>{formatTime(safeDuration)}</span>
    </div>
  );
}
