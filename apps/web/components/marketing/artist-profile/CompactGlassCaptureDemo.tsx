'use client';

import { Play, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import { CompactGlassModule } from './CompactGlassModule';
import { CaptureActionPill, type CapturePhase } from './captureShared';

const TYPING_MS = 1200;
const SUBMITTING_MS = 420;
const CAPTURE = ARTIST_PROFILE_COPY.capture;

export interface CompactGlassCaptureDemoProps {
  readonly initialPhase?: CapturePhase;
  /** Optional module label; omit when it repeats the pill's own copy. */
  readonly label?: string;
  readonly className?: string;
}

/**
 * Compact glass module demo (JOV-6248): drives the artist-profile
 * CaptureActionPill phases in isolated demo state — never calls a mutation,
 * send, or payment endpoint. prefers-reduced-motion resolves to confirmed.
 */
export function CompactGlassCaptureDemo({
  initialPhase = 'idle',
  label,
  className,
}: Readonly<CompactGlassCaptureDemoProps>) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<CapturePhase>(
    reducedMotion ? 'done' : initialPhase
  );
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) globalThis.clearTimeout(timer);
    timersRef.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    clearTimers();
    setPhase(reducedMotion ? 'done' : initialPhase);
  }, [reducedMotion, clearTimers, initialPhase]);

  useEffect(() => {
    if (phase !== 'typing' && phase !== 'submitting') return;
    timersRef.current.push(
      globalThis.setTimeout(
        () => setPhase(phase === 'typing' ? 'submitting' : 'done'),
        phase === 'typing' ? TYPING_MS : SUBMITTING_MS
      )
    );
  }, [phase]);

  const go = useCallback(
    (next: CapturePhase) => () => {
      clearTimers();
      setPhase(reducedMotion ? 'done' : next);
    },
    [clearTimers, reducedMotion]
  );

  const status =
    phase === 'done'
      ? `${CAPTURE.action.confirmedLabel}. Demo only — nothing was sent or stored.`
      : `Demo ${phase === 'idle' ? 'only' : 'running'} — nothing is sent or stored.`;

  return (
    <CompactGlassModule label={label} className={cn('w-full', className)}>
      <div className='compact-glass-module__demo'>
        <CaptureActionPill capture={CAPTURE} phase={phase} />
        <div className='compact-glass-module__controls'>
          <button
            type='button'
            className='compact-glass-module__button'
            onClick={go('typing')}
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
              onClick={go('idle')}
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
