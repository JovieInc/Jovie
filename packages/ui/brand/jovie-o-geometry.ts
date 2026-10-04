import { JOVIE_BRAND_GEOMETRY } from './geometry.gen';

/**
 * The O, as live primitives.
 *
 * The mark is three shapes: an outer disc, minus a counter ellipse, minus a
 * half-annulus seam that folds the top of the ring into a ball (the seed).
 * Drawing it from parts instead of one path lets every part move: the seam
 * opens, the counter irises shut for Ovie's blink, the ring unwinds into the
 * loader. At rest the parts compose to exactly the construction outline.
 */

export type JovieOMaster = '16' | '24' | '32' | 'display' | 'text';

const O = JOVIE_BRAND_GEOMETRY.o;

/**
 * Pixel masters exist at 16, 24 and 32 px; their edges sit on whole pixels.
 * Anything larger draws the display master. In-between sizes snap to the
 * nearest master below so a 20 px chrome mark keeps the 16 px seam weight.
 */
export function masterForSize(px: number): JovieOMaster {
  if (px < 24) return '16';
  if (px < 32) return '24';
  if (px < 48) return '32';
  return 'display';
}

export interface JovieOParts {
  /** viewBox edge; the O fills 0..box. */
  readonly box: number;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  /** Counter radii: the side stroke is thicker than top/bottom (contrast). */
  readonly counterRx: number;
  readonly counterRy: number;
  readonly seed: {
    readonly cx: number;
    readonly cy: number;
    readonly r: number;
  };
  readonly seam: number;
  /** Right half of a circle around the seed, stroked `seam` wide. */
  readonly seamPath: string;
  /** Ring midline from the seed, counter-clockwise, all the way round. */
  readonly tailPath: string;
  /** Stroke width that covers the whole ring when stroking tailPath. */
  readonly tailWidth: number;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export function jovieOParts(master: JovieOMaster): JovieOParts {
  const m = O[master];
  const box = m.size;
  const cx = box / 2;
  const cy = box / 2;
  const r = m.r;
  const seed = m.seed;
  const seamR = round(seed.r + m.seam / 2);
  const seamPath = `M${seed.cx} ${round(seed.cy - seamR)}A${seamR} ${seamR} 0 0 1 ${seed.cx} ${round(seed.cy + seamR)}`;
  // The seed sits on the ring midline at 12 o'clock; the tail follows that
  // midline. Two half arcs, because one SVG arc cannot close a circle.
  const mid = round(cy - seed.cy);
  const tailPath =
    `M${cx} ${round(cy - mid)}` +
    `A${mid} ${mid} 0 0 0 ${cx} ${round(cy + mid)}` +
    `A${mid} ${mid} 0 0 0 ${cx} ${round(cy - mid)}`;
  return {
    box,
    cx,
    cy,
    r,
    counterRx: round(r - m.ts),
    counterRy: round(r - m.th),
    seed,
    seam: m.seam,
    seamPath,
    tailPath,
    // The midline sits at the top stroke's centre, so to reach both edges at
    // 3 and 9 o'clock (where the ring is thicker) the stroke needs
    // 2*ts - th, plus a hair so antialiasing never leaves a fringe. Overreach
    // is clipped by the disc outside and by the counter inside.
    tailWidth: round(2 * m.ts - m.th + box / 100),
  };
}

export const JOVIE_OV_GEOMETRY = JOVIE_BRAND_GEOMETRY.ov;

export const pointsAttr = (pts: ReadonlyArray<ReadonlyArray<number>>) =>
  pts.map(([x, y]) => `${x},${y}`).join(' ');
