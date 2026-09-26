// @coverage-via apps/web/components/marketing/artist-profile/CompactGlassModule.test.tsx
'use client';

/**
 * Compact glass module demo (JOV-6248) — the artist-profile fan opt-in
 * capture action rendered inside the shared compact-glass material.
 *
 * Demo state is fully isolated: it drives the existing CaptureActionPill
 * phases locally and never calls a mutation, send, or payment endpoint.
 * Under prefers-reduced-motion the sequence resolves instantly to the
 * confirmed state.
 */

import { Play, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ARTIST_PROFILE_COPY,
  type ArtistProfileCaptureVisualCopy,
} from '@/data/artistProfileCopy';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import { CompactGlassModule } from './CompactGlassModule';
import { CaptureActionPill, type CapturePhase } from './captureShared';

const TYPING_MS = 1200;
const SUBMITTING_MS = 420;

export interface CompactGlassCaptureDemoProps {
  readonly capture?: ArtistProfileCaptureVisualCopy;
  readonly initialPhase?: CapturePhase;
  /** Start the opt-in sequence on mount (scripted playback / live demo). */
  readonly autoPlay?: boolean;
  /** Optional module label; omit when it repeats the pill's own copy. */
  readonly label?: string;
  readonly className?: string;
}

export function CompactGlassCaptureDemo({
  capture = ARTIST_PROFILE_COPY.capture,
  initialPhase = 'idle',
  autoPlay = false,
  label,
  className,
}: Readonly<CompactGlassCaptureDemoProps>) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<CapturePhase>(
    reducedMotion ? 'done' : initialPhase
  );
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const prevReducedMotionRef = useRef(reducedMotion);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) {
      globalThis.clearTimeout(timer);
    }
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    if (prevReducedMotionRef.current === reducedMotion) return;
    prevReducedMotionRef.current = reducedMotion;
    clearTimers();
    setPhase(reducedMotion ? 'done' : initialPhase);
  }, [reducedMotion, clearTimers, initialPhase]);

  useEffect(() => {
    if (!autoPlay || reducedMotion) return;
    setPhase('typing');
  }, [autoPlay, reducedMotion]);

  useEffect(() => {
    if (phase === 'typing') {
      const timer = globalThis.setTimeout(
        () => setPhase('submitting'),
        TYPING_MS
      );
      timersRef.current.push(timer);
      return;
    }
    if (phase === 'submitting') {
      const timer = globalThis.setTimeout(
        () => setPhase('done'),
        SUBMITTING_MS
      );
      timersRef.current.push(timer);
    }
  }, [phase]);

  const replay = useCallback(() => {
    clearTimers();
    setPhase(reducedMotion ? 'done' : 'typing');
  }, [clearTimers, reducedMotion]);

  const reset = useCallback(() => {
    clearTimers();
    setPhase(reducedMotion ? 'done' : 'idle');
  }, [clearTimers, reducedMotion]);

  const status =
    phase === 'done'
      ? `${capture.action.confirmedLabel}. Demo only — nothing was sent or stored.`
      : phase === 'idle'
        ? 'Demo only — nothing is sent or stored.'
        : 'Demo running — nothing is sent or stored.';

  return (
    <CompactGlassModule label={label} className={cn('w-full', className)}>
      <div className='compact-glass-module__demo'>
        <CaptureActionPill capture={capture} phase={phase} />
        <div className='compact-glass-module__controls'>
          <button
            type='button'
            className='compact-glass-module__button'
            onClick={replay}
          >
            {phase === 'idle' ? (
              <Play className='h-4 w-4' strokeWidth={1.9} aria-hidden='true' />
            ) : (
              <RotateCcw
                className='h-4 w-4'
                strokeWidth={1.9}
                aria-hidden='true'
              />
            )}
            {phase === 'idle' ? 'Play demo' : 'Replay'}
          </button>
          {phase !== 'idle' ? (
            <button
              type='button'
              className='compact-glass-module__button'
              onClick={reset}
            >
              Reset
            </button>
          ) : null}
        </div>
        <p className='compact-glass-module__status' aria-live='polite'>
          {status}
        </p>
      </div>
    </CompactGlassModule>
  );
}
