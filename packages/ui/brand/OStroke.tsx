'use client';

import {
  type CSSProperties,
  type Ref,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cn } from '../lib/utils';
import { type JovieOMaster, masterForSize } from './jovie-o-geometry';
import {
  createMorph,
  type MorphController,
  prefersReducedMotion,
  tokenMs,
} from './ostroke-morph';
import {
  dashArray,
  isSlowMorph,
  type OStrokePose,
  pathData,
  poseState,
  type StrokeState,
  strokeFrame,
} from './ostroke-poses';

export interface OStrokeProps {
  /** The shape the line holds. Changing it morphs; nothing else does. */
  readonly pose?: OStrokePose;
  /** Wave phase in radians. The caller moves it, and only while there is a cause. */
  readonly phase?: number;
  /** Rendered height in px. Picks the pixel master like JovieO. */
  readonly size?: number;
  readonly master?: JovieOMaster;
  /** Accessible name. Omit when the mark is decorative or labelled nearby. */
  readonly label?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly onMorphEnd?: (pose: OStrokePose) => void;
  readonly ref?: Ref<SVGSVGElement>;
}

/**
 * The O as one stroked path that reshapes into every other mark. At rest it
 * is JovieO's outline; a pose change runs one requestAnimationFrame loop that
 * writes `d` until the line lands, then nothing ticks. Rotation (oSpin) wraps
 * this element and is never part of the path data.
 */
export function OStroke({
  pose = 'circle',
  phase = 0,
  size = 20,
  master,
  label,
  className,
  style,
  onMorphEnd,
  ref,
}: OStrokeProps) {
  const frame = useMemo(
    () => strokeFrame(master ?? masterForSize(size)),
    [master, size]
  );
  // What the server draws. It is read once: after mount only the morph loop
  // writes `d`, so a React re-render can never flash the destination early.
  const [initial] = useState(() => poseState(pose, frame, { phase }));

  const pathRef = useRef<SVGPathElement>(null);
  const morphRef = useRef<MorphController | null>(null);
  const poseRef = useRef<OStrokePose>(pose);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const onEndRef = useRef(onMorphEnd);
  onEndRef.current = onMorphEnd;

  const write = (state: StrokeState) => {
    const path = pathRef.current;
    if (!path) return;
    path.setAttribute('d', pathData(state.points));
    const dash = dashArray(state.gap);
    if (dash) path.setAttribute('stroke-dasharray', dash);
    else path.removeAttribute('stroke-dasharray');
  };

  // (Re)built when the frame changes: starts from the live pose, drawn at once.
  useLayoutEffect(() => {
    const start = poseState(poseRef.current, frame, {
      phase: phaseRef.current,
      reduced: prefersReducedMotion(),
    });
    const morph = createMorph({ initial: start, write });
    morph.snap(start);
    morphRef.current = morph;
    return () => morph.cancel();
  }, [frame]);

  useEffect(() => {
    const morph = morphRef.current;
    if (!morph) return;
    const reduced = prefersReducedMotion();
    const target = poseState(pose, frame, { phase, reduced });
    const previous = poseRef.current;
    poseRef.current = pose;
    // Same pose: only the wave's phase (or reduced-motion curve) changed.
    if (previous === pose) {
      if (morph.running()) morph.retarget(target);
      else morph.snap(target);
      return;
    }
    const slow = isSlowMorph(previous, pose);
    const ms =
      reduced || document.hidden
        ? 0
        : tokenMs(slow ? '--duration-slow' : '--duration-normal');
    morph.to(target, ms, () => onEndRef.current?.(pose));
  }, [pose, phase, frame]);

  const sw = frame.width;
  return (
    <svg
      ref={ref}
      xmlns='http://www.w3.org/2000/svg'
      viewBox={`0 0 ${frame.box} ${frame.box}`}
      height={size}
      width={size}
      fill='none'
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable='false'
      data-os-pose={pose}
      className={cn('ostroke', className)}
      style={{ flexShrink: 0, ...style }}
    >
      {label ? <title>{label}</title> : null}
      <path
        ref={pathRef}
        d={pathData(initial.points)}
        pathLength={1}
        stroke='currentColor'
        strokeWidth={sw}
        strokeLinecap='round'
        strokeLinejoin='round'
        strokeDasharray={dashArray(initial.gap)}
      />
    </svg>
  );
}
