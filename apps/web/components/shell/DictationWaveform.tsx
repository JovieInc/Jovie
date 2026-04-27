'use client';

import { cn } from '@/lib/utils';

const EASE_CINEMATIC = 'cubic-bezier(0.32, 0.72, 0, 1)';

export interface DictationWaveformProps {
  /** When false, the strip fades to a static row at 40% opacity. */
  readonly active: boolean;
  /** Override the bar count. Defaults to 32 — visually tuned to ~h-12. */
  readonly bars?: number;
  readonly className?: string;
}

/**
 * DictationWaveform — soft cyan "Jovie is listening" strip. Each of the
 * 32 bars (configurable) animates with a deterministic per-bar duration
 * and phase offset so the strip reads as a coherent, slowly-rolling
 * waveform instead of random scatter. Mid-strip bars reach taller,
 * giving the waveform a soft envelope.
 *
 * The keyframe lives in `app/globals.css` (`@keyframes dict-bar`).
 * When `active === false`, animations stop and the strip fades; the
 * fade itself uses the cinematic ease for parity with the rest of the
 * shell's reveal/conceal transitions.
 */
export function DictationWaveform({
  active,
  bars = 32,
  className,
}: DictationWaveformProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-[3px] h-12 w-full',
        className
      )}
      aria-hidden='true'
    >
      {Array.from({ length: bars }, (_, i) => {
        const center = (bars - 1) / 2;
        const distance = Math.abs(i - center) / center;
        const baseHeight = 32 + (1 - distance) * 16;
        const duration = 720 + (i % 7) * 80;
        const delay = (i * 47) % 600;
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: deterministic bar index, no list mutation
            key={i}
            className='block w-[3px] rounded-full bg-cyan-300/85'
            style={{
              height: baseHeight,
              transformOrigin: 'center',
              animation: active
                ? `dict-bar ${duration}ms cubic-bezier(0.4, 0, 0.6, 1) ${delay}ms infinite`
                : 'none',
              opacity: active ? 1 : 0.4,
              transition: `opacity 350ms ${EASE_CINEMATIC}`,
            }}
          />
        );
      })}
    </div>
  );
}
