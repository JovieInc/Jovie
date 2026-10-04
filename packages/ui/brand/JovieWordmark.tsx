'use client';

import { type CSSProperties, useLayoutEffect, useMemo, useRef } from 'react';

import { cn } from '../lib/utils';
import { JOVIE_BRAND_GEOMETRY } from './geometry.gen';
import { JovieO } from './JovieO';
import {
  JOVIE_O_EASE,
  type JovieOState,
  skipOneShotMotion,
} from './jovie-o-motion';

type Master = 'display' | 'text';

export interface JovieWordmarkProps {
  /** Rendered height of the full wordmark box (cap + overshoot) in px. */
  readonly height?: number;
  /**
   * Collapse to the O. The other letters fold into it and the box narrows to
   * the O; set false again and the O opens back into "Jovie".
   */
  readonly collapsed?: boolean;
  /** State of the O (loader states read best collapsed). */
  readonly state?: JovieOState;
  readonly label?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export const JOVIE_WORDMARK_TIMING = {
  collapseMs: 340,
  openMs: 440,
  /** Delay between letters, outermost first when collapsing. */
  staggerMs: 28,
} as const;

/** Below 24 px the Text master (open seam, looser spacing) takes over. */
export function wordmarkMaster(height: number): Master {
  return height < 24 ? 'text' : 'display';
}

interface GlyphLayout {
  readonly char: string;
  readonly d: string;
  /** Where this glyph sits when collapsed, relative to its open position. */
  readonly folded: { readonly x: number; readonly opacity: number };
}

function layout(master: Master) {
  const w = JOVIE_BRAND_GEOMETRY.wordmark[master];
  const [, , width, height] = w.viewBox;
  const o = w.glyphs.find(g => g.char === 'o');
  if (!o) throw new Error('wordmark geometry has no o');
  const oSize = o.bounds[3] - o.bounds[1];
  const oX = o.x + o.bounds[0];
  const oY = w.baseline - o.bounds[3];
  const glyphs: GlyphLayout[] = w.glyphs
    .filter(g => g.char !== 'o')
    .map(g => {
      const centre = g.x + (g.bounds[0] + g.bounds[2]) / 2;
      // Each letter only leans toward the O as it fades, a quarter of the way
      // and never more than the stem width, so letters never pile up.
      const toward = oX + oSize / 2 - centre;
      const x = Math.sign(toward) * Math.min(Math.abs(toward) * 0.25, 144);
      return { char: g.char, d: g.d, folded: { x, opacity: 0 } };
    });
  // The O rolls the way it travels (counter-clockwise going left) and makes
  // exactly one turn, so the seed always lands back at 12 and the collapsed
  // mark is the true mark. A true rolling distance would stop it near 9.
  const rollDeg = -360;
  return { width, height, oX, oY, oSize, glyphs, rollDeg };
}

/**
 * The Jovie wordmark. The o is the live <JovieO>, so the word can collapse
 * to the mark and open back out with nothing swapped.
 */
export function JovieWordmark({
  height = 24,
  collapsed = false,
  state = 'idle',
  label = 'Jovie',
  className,
  style,
}: JovieWordmarkProps) {
  const master = wordmarkMaster(height);
  const L = useMemo(() => layout(master), [master]);
  const px = height / L.height;
  const groupRefs = useRef<Map<string, SVGGElement>>(new Map());
  const boxRef = useRef<HTMLSpanElement>(null);
  const prev = useRef(collapsed);

  useLayoutEffect(() => {
    if (prev.current === collapsed) return;
    prev.current = collapsed;
    if (skipOneShotMotion()) return;
    const { collapseMs, openMs, staggerMs } = JOVIE_WORDMARK_TIMING;
    const ms = collapsed ? collapseMs : openMs;
    const ease = collapsed ? JOVIE_O_EASE.inOut : JOVIE_O_EASE.out;
    // Collapsing lets the outermost letters go first; opening brings the
    // nearest back first, so the word unrolls out of the O.
    const order = collapsed ? ['e', 'J', 'i', 'v'] : ['v', 'J', 'i', 'e'];
    const frames = (g: GlyphLayout): Keyframe[] => {
      const open = { transform: 'translateX(0px)', opacity: 1 };
      const shut = { transform: `translateX(${g.folded.x}px)`, opacity: 0 };
      // Letters are gone by 60% of a collapse and arrive from 25% of an open.
      return collapsed
        ? [open, { ...shut, offset: 0.6 }, shut]
        : [shut, { ...shut, offset: 0.25 }, open];
    };
    for (const g of L.glyphs) {
      groupRefs.current.get(g.char)?.animate(frames(g), {
        duration: ms,
        delay: order.indexOf(g.char) * staggerMs,
        easing: ease,
        fill: 'backwards',
      });
    }
    const shift = [
      { transform: 'translateX(0px)' },
      { transform: `translateX(${-L.oX}px)` },
    ];
    groupRefs.current
      .get('o')
      ?.animate(collapsed ? shift : [...shift].reverse(), {
        duration: ms,
        easing: ease,
      });
    const roll = [{ rotate: '0deg' }, { rotate: `${L.rollDeg}deg` }];
    groupRefs.current
      .get('roll')
      ?.animate(collapsed ? roll : [...roll].reverse(), {
        duration: ms,
        easing: ease,
      });
    const wide = `${L.width * px}px`;
    const narrow = `${L.oSize * px}px`;
    boxRef.current?.animate(
      [
        { width: collapsed ? wide : narrow },
        { width: collapsed ? narrow : wide },
      ],
      { duration: ms, easing: ease }
    );
  }, [collapsed, L, px]);

  const setRef = (key: string) => (el: SVGGElement | null) => {
    if (el) groupRefs.current.set(key, el);
    else groupRefs.current.delete(key);
  };

  return (
    <span
      ref={boxRef}
      role='img'
      aria-label={label}
      data-collapsed={collapsed ? 'true' : undefined}
      className={cn('jovie-wordmark', className)}
      style={{
        display: 'inline-block',
        flexShrink: 0,
        overflow: 'hidden',
        verticalAlign: 'middle',
        height,
        width: (collapsed ? L.oSize : L.width) * px,
        ...style,
      }}
    >
      <svg
        xmlns='http://www.w3.org/2000/svg'
        viewBox={`0 0 ${L.width} ${L.height}`}
        height={height}
        width={L.width * px}
        fill='currentColor'
        aria-hidden='true'
        focusable='false'
        style={{ display: 'block', overflow: 'visible' }}
      >
        {L.glyphs.map(g => (
          <g
            key={g.char}
            ref={setRef(g.char)}
            data-glyph={g.char}
            style={
              collapsed
                ? { transform: `translateX(${g.folded.x}px)`, opacity: 0 }
                : undefined
            }
          >
            <path d={g.d} />
          </g>
        ))}
        <g
          ref={setRef('o')}
          data-glyph='o'
          style={
            collapsed ? { transform: `translateX(${-L.oX}px)` } : undefined
          }
        >
          <g transform={`translate(${L.oX} ${L.oY})`}>
            <g
              ref={setRef('roll')}
              style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}
            >
              <JovieO size={L.oSize} master={master} state={state} />
            </g>
          </g>
        </g>
      </svg>
    </span>
  );
}
