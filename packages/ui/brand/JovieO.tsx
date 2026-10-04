'use client';

import {
  type CSSProperties,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { cn } from '../lib/utils';
import {
  JOVIE_OV_GEOMETRY,
  type JovieOMaster,
  jovieOParts,
  masterForSize,
  pointsAttr,
} from './jovie-o-geometry';
import {
  currentRotation,
  currentTail,
  JOVIE_O_CSS,
  type JovieOState,
  playOutcome,
} from './jovie-o-motion';

export type JovieOVariant = 'jovie' | 'ov';

export interface JovieOProps {
  /** Rendered height in px. Picks the pixel master (16/24/32) or display. */
  readonly size?: number;
  readonly state?: JovieOState;
  /** 'ov' draws Ovie's OV pair: the same O plus the v. */
  readonly variant?: JovieOVariant;
  /** Force a master (the wordmark passes its own so seams match). */
  readonly master?: JovieOMaster;
  /** Accessible name. Omit when the mark is decorative or labelled nearby. */
  readonly label?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}

const BUSY: ReadonlySet<JovieOState> = new Set(['loading', 'thinking']);

/**
 * The one O. Every Jovie mark, loader and Ovie eye is this component.
 * Colour is currentColor: the mark is one ink per surface, never an accent.
 */
export function JovieO({
  size = 20,
  state = 'idle',
  variant = 'jovie',
  master,
  label,
  className,
  style,
}: JovieOProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const parts = jovieOParts(master ?? masterForSize(size));
  const ov = variant === 'ov';
  const scale = parts.box / 100;
  const width = ov ? JOVIE_OV_GEOMETRY.viewBox[2] * scale : parts.box;

  const rootRef = useRef<SVGSVGElement>(null);
  const turnRef = useRef<SVGGElement>(null);
  const tailRef = useRef<SVGPathElement>(null);

  // data-jo-state is driven from here, not straight from props, so the loop's
  // live position can be sampled before the CSS loop is switched off.
  const [domState, setDomState] = useState<JovieOState>(state);
  const fromRef = useRef<{ rotation: number; tail: number } | null>(null);

  useLayoutEffect(() => {
    if (state === domState) return;
    const turn = turnRef.current;
    const tail = tailRef.current;
    if (turn && tail && (state === 'success' || state === 'error')) {
      fromRef.current = {
        rotation: currentRotation(turn),
        tail: BUSY.has(domState) ? currentTail(tail) : 100,
      };
    }
    setDomState(state);
  }, [state, domState]);

  useLayoutEffect(() => {
    const from = fromRef.current;
    const root = rootRef.current;
    const turn = turnRef.current;
    const tail = tailRef.current;
    if (!from || !root || !turn || !tail) return;
    if (domState !== 'success' && domState !== 'error') return;
    fromRef.current = null;
    void playOutcome({ root, turn, tail }, domState, from);
  }, [domState]);

  const cut = `jo-cut-${uid}`;
  const notchMask = `jo-notch-${uid}`;
  const v = JOVIE_OV_GEOMETRY.v;
  // The notch's top edge lies on the v's top edge; bleed it past so the
  // mask never leaves an antialiased hairline across the opening.
  const notchWithBleed = v.notch.map(([x, y], i) => [x, i < 2 ? y - 4 : y]);
  const vPoints = (pts: ReadonlyArray<ReadonlyArray<number>>) =>
    pointsAttr(pts.map(([x, y]) => [x * scale, y * scale]));

  return (
    <svg
      ref={rootRef}
      xmlns='http://www.w3.org/2000/svg'
      viewBox={`0 0 ${width} ${parts.box}`}
      height={size}
      width={(size * width) / parts.box}
      fill='currentColor'
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable='false'
      data-jo-state={domState}
      data-jo-variant={variant}
      className={cn('jovie-o', className)}
      style={{ flexShrink: 0, ...style }}
    >
      <style href='jovie-o' precedence='default'>
        {JOVIE_O_CSS}
      </style>
      {label ? <title>{label}</title> : null}
      <defs>
        {/*
          One mask, painted in order: the tail (the ring, as far as it has
          wound) and the seed in white; at rest, the counter's area in white
          too (overlapping the ring a hair, so no seam) so a blinking counter
          fills with ink; then the counter and the seam cut out in black. Nesting masks instead stops Chromium repainting the
          counter when it animates.
        */}
        <mask
          id={cut}
          maskUnits='userSpaceOnUse'
          x='0'
          y='0'
          width={parts.box}
          height={parts.box}
        >
          <path
            ref={tailRef}
            className='jo-tail'
            d={parts.tailPath}
            pathLength={100}
            fill='none'
            stroke='#fff'
            strokeWidth={parts.tailWidth}
            strokeLinecap='round'
          />
          <circle
            cx={parts.seed.cx}
            cy={parts.seed.cy}
            r={parts.seed.r}
            fill='#fff'
          />
          {BUSY.has(domState) ? null : (
            <ellipse
              cx={parts.cx}
              cy={parts.cy}
              rx={parts.counterRx + parts.box / 100}
              ry={parts.counterRy + parts.box / 100}
              fill='#fff'
            />
          )}
          <ellipse
            className='jo-iris'
            cx={parts.cx}
            cy={parts.cy}
            rx={parts.counterRx}
            ry={parts.counterRy}
            fill='#000'
          />
          <path
            d={parts.seamPath}
            fill='none'
            stroke='#000'
            strokeWidth={parts.seam}
          />
        </mask>
        {ov ? (
          <mask
            id={notchMask}
            maskUnits='userSpaceOnUse'
            x='0'
            y='0'
            width={width}
            height={parts.box}
          >
            <rect width={width} height={parts.box} fill='#fff' />
            <polygon
              className='jo-lid'
              points={vPoints(notchWithBleed)}
              fill='#000'
            />
          </mask>
        ) : null}
      </defs>
      <g ref={turnRef} className='jo-turn'>
        <circle cx={parts.cx} cy={parts.cy} r={parts.r} mask={`url(#${cut})`} />
      </g>
      {ov ? (
        <g className='jo-v' mask={`url(#${notchMask})`}>
          <polygon points={vPoints(v.outer)} />
        </g>
      ) : null}
    </svg>
  );
}
