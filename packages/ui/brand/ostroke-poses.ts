import { type JovieOMaster, jovieOParts } from './jovie-o-geometry';

/**
 * The O as one stroke (slice 4a).
 *
 * Every pose is the same line, sampled at a fixed N points at equal arc
 * length. Because point i is always the same fraction along the line, a morph
 * is just a per-index interpolation, and the line never kinks: no point ever
 * jumps along the curve, it only slides to where that fraction of the next
 * shape sits. Pure functions, no DOM.
 */

export const OSTROKE_POINTS = 64;

export type Point = readonly [number, number];

export const OSTROKE_POSES = [
  'circle',
  'line',
  'wave',
  'triangle',
  'pause',
  'roundedSquare',
] as const;
export type OStrokePose = (typeof OSTROKE_POSES)[number];

/** Everything a pose needs to know about the O it is drawn in. */
export interface OStrokeFrame {
  /** viewBox edge. */
  readonly box: number;
  readonly cx: number;
  readonly cy: number;
  /** Radius of the ring's midline (the seed sits on it at 12 o'clock). */
  readonly radius: number;
  /** Stroke width: the ring thickness, equal to the seed's diameter. */
  readonly width: number;
  /** The gap between the stroke's end and the seed. */
  readonly seam: number;
}

export function strokeFrame(master: JovieOMaster): OStrokeFrame {
  const p = jovieOParts(master);
  return {
    box: p.box,
    cx: p.cx,
    cy: p.cy,
    radius: p.cy - p.seed.cy,
    width: p.seed.r * 2,
    seam: p.seam,
  };
}

/** The wave stays a signal, not a squiggle: at most 12% of the diameter. */
export const WAVE_AMPLITUDE_RATIO = 0.1;
const WAVE_CYCLES = 2;
const DENSE = 256;

/** The state one frame of the stroke is drawn from. */
export interface StrokeState {
  readonly points: readonly Point[];
  /** Fraction (0..1) of the stroke's length hidden as a dash gap, centred. */
  readonly gap: number;
}

/** Resample a polyline to n points at equal arc length. */
export function resample(dense: readonly Point[], n: number): Point[] {
  const cum: number[] = [0];
  for (let i = 1; i < dense.length; i++) {
    cum.push(
      cum[i - 1] +
        Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1])
    );
  }
  const total = cum[cum.length - 1];
  const out: Point[] = [];
  let seg = 1;
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    while (seg < dense.length - 1 && cum[seg] < target) seg++;
    const span = cum[seg] - cum[seg - 1];
    const k = span === 0 ? 0 : (target - cum[seg - 1]) / span;
    out.push([
      dense[seg - 1][0] + (dense[seg][0] - dense[seg - 1][0]) * k,
      dense[seg - 1][1] + (dense[seg][1] - dense[seg - 1][1]) * k,
    ]);
  }
  return out;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i / (n - 1));

/**
 * Rest. The stroke starts at the seed (12 o'clock), runs counter-clockwise
 * and stops one seam short of the seed, exactly where JovieO's seam cut is.
 */
export function circle(f: OStrokeFrame): Point[] {
  const sweep = Math.PI * 2 - (f.width + f.seam) / f.radius;
  return range(OSTROKE_POINTS).map(t => {
    const a = t * sweep;
    return [f.cx - f.radius * Math.sin(a), f.cy - f.radius * Math.cos(a)];
  });
}

/** The circle opened at the seed and straightened across the O. */
export function line(f: OStrokeFrame): Point[] {
  return range(OSTROKE_POINTS).map(t => [
    f.cx - f.radius + 2 * f.radius * t,
    f.cy,
  ]);
}

/** The line oscillating. `phase` in radians is the only thing that moves. */
export function wave(f: OStrokeFrame, phase = 0): Point[] {
  const amp = f.box * WAVE_AMPLITUDE_RATIO;
  const dense = range(DENSE).map<Point>(t => [
    f.cx - f.radius + 2 * f.radius * t,
    f.cy +
      amp *
        Math.sin(Math.PI * 2 * WAVE_CYCLES * t + phase) *
        Math.sin(Math.PI * t),
  ]);
  return resample(dense, OSTROKE_POINTS);
}

/** Reduced motion's stand-in for the wave: a static, gently curved line. */
export function gentleLine(f: OStrokeFrame): Point[] {
  const sag = f.box * 0.05;
  const dense = range(DENSE).map<Point>(t => [
    f.cx - f.radius + 2 * f.radius * t,
    f.cy + sag * Math.sin(Math.PI * t),
  ]);
  return resample(dense, OSTROKE_POINTS);
}

/** A closed polygon with quadratic-rounded corners, as a dense polyline. */
function roundedPolygon(
  vertices: readonly Point[],
  corner: number,
  start: Point
): Point[] {
  const dense: Point[] = [];
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const v = vertices[i];
    const prev = vertices[(i + n - 1) % n];
    const next = vertices[(i + 1) % n];
    const lp = Math.hypot(prev[0] - v[0], prev[1] - v[1]);
    const ln = Math.hypot(next[0] - v[0], next[1] - v[1]);
    const d = Math.min(corner, lp / 2, ln / 2);
    const a: Point = [
      v[0] + ((prev[0] - v[0]) / lp) * d,
      v[1] + ((prev[1] - v[1]) / lp) * d,
    ];
    const b: Point = [
      v[0] + ((next[0] - v[0]) / ln) * d,
      v[1] + ((next[1] - v[1]) / ln) * d,
    ];
    for (let s = 0; s <= 12; s++) {
      const t = s / 12;
      const u = 1 - t;
      dense.push([
        u * u * a[0] + 2 * u * t * v[0] + t * t * b[0],
        u * u * a[1] + 2 * u * t * v[1] + t * t * b[1],
      ]);
    }
  }
  // Begin where the seed is, so the morph from the circle never twists.
  let at = 0;
  let best = Number.POSITIVE_INFINITY;
  dense.forEach((p, i) => {
    const dist = Math.hypot(p[0] - start[0], p[1] - start[1]);
    if (dist < best) {
      best = dist;
      at = i;
    }
  });
  const turned = dense.slice(at).concat(dense.slice(0, at));
  turned.push(turned[0]);
  return turned;
}

/** Play: the line folds into a right-pointing triangle with soft corners. */
export function triangle(f: OStrokeFrame): Point[] {
  const r = f.radius * 0.86;
  const ox = f.cx + r * 0.08; // optical centre: the mass sits left of the tip
  const top: Point = [ox - r * 0.5, f.cy - r * 0.866];
  const bottom: Point = [ox - r * 0.5, f.cy + r * 0.866];
  const tip: Point = [ox + r, f.cy];
  // Counter-clockwise on screen, like the circle: top, bottom, tip.
  return resample(
    roundedPolygon([top, bottom, tip], r * 0.34, top),
    OSTROKE_POINTS
  );
}

/** Two bars as one stroke: down, across (hidden by the gap), up. */
export function pause(f: OStrokeFrame): Point[] {
  const half = (f.width * 1.35) / 2;
  const hh = f.radius * 0.62;
  const dense: Point[] = [
    [f.cx - half, f.cy - hh],
    [f.cx - half, f.cy + hh],
    [f.cx + half, f.cy + hh],
    [f.cx + half, f.cy - hh],
  ];
  return resample(dense, OSTROKE_POINTS);
}

/** Fraction of the pause stroke that is the hidden crossbar. */
export function pauseGap(f: OStrokeFrame): number {
  const half = (f.width * 1.35) / 2;
  const hh = f.radius * 0.62;
  const across = half * 2;
  return across / (4 * hh + across);
}

/** The album-art frame: a rounded square starting at the top centre. */
export function roundedSquare(f: OStrokeFrame): Point[] {
  const s = f.radius * 0.95;
  const tl: Point = [f.cx - s, f.cy - s];
  const bl: Point = [f.cx - s, f.cy + s];
  const br: Point = [f.cx + s, f.cy + s];
  const tr: Point = [f.cx + s, f.cy - s];
  return resample(
    roundedPolygon([tl, bl, br, tr], s * 0.62, [f.cx, f.cy - s]),
    OSTROKE_POINTS
  );
}

export interface PoseOptions {
  /** Radians. Only the wave reads it. */
  readonly phase?: number;
  /** Reduced motion swaps the wave for a static, gently curved line. */
  readonly reduced?: boolean;
}

export function poseState(
  pose: OStrokePose,
  f: OStrokeFrame,
  { phase = 0, reduced = false }: PoseOptions = {}
): StrokeState {
  switch (pose) {
    case 'circle':
      return { points: circle(f), gap: 0 };
    case 'line':
      return { points: line(f), gap: 0 };
    case 'wave':
      return { points: reduced ? gentleLine(f) : wave(f, phase), gap: 0 };
    case 'triangle':
      return { points: triangle(f), gap: 0 };
    case 'pause':
      return { points: pause(f), gap: pauseGap(f) };
    case 'roundedSquare':
      return { points: roundedSquare(f), gap: 0 };
  }
}

/** Per-index interpolation. Arc-length sampling is what keeps it kink-free. */
export function lerpState(
  a: StrokeState,
  b: StrokeState,
  e: number
): StrokeState {
  return {
    points: a.points.map<Point>((p, i) => [
      p[0] * (1 - e) + b.points[i][0] * e,
      p[1] * (1 - e) + b.points[i][1] * e,
    ]),
    gap: a.gap * (1 - e) + b.gap * e,
  };
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** One smooth path through the points (quadratic through midpoints). */
export function pathData(points: readonly Point[]): string {
  const [first, ...rest] = points;
  let d = `M${r3(first[0])} ${r3(first[1])}`;
  for (let i = 0; i < rest.length - 1; i++) {
    const p = rest[i];
    const q = rest[i + 1];
    d += `Q${r3(p[0])} ${r3(p[1])} ${r3((p[0] + q[0]) / 2)} ${r3((p[1] + q[1]) / 2)}`;
  }
  const last = rest[rest.length - 1];
  return `${d}L${r3(last[0])} ${r3(last[1])}`;
}

/** Dash pattern over a path normalised to length 1; undefined = solid. */
export function dashArray(gap: number): string | undefined {
  if (gap < 0.0005) return undefined;
  const side = (1 - gap) / 2;
  return `${r3(side)} ${r3(gap)} ${r3(side)} 1`;
}

/** Open to line and line to wave take the slow beat; the rest the normal one. */
export function isSlowMorph(from: OStrokePose, to: OStrokePose): boolean {
  const pair = new Set([from, to]);
  return (
    pair.has('line') && (pair.has('circle') || pair.has('wave')) && from !== to
  );
}
