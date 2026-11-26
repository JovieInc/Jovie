import { describe, expect, it } from 'vitest';

import { jovieOParts, masterForSize } from './jovie-o-geometry';
import {
  circle,
  dashArray,
  isSlowMorph,
  lerpState,
  line,
  OSTROKE_POINTS,
  OSTROKE_POSES,
  type Point,
  pathData,
  poseState,
  strokeFrame,
  WAVE_AMPLITUDE_RATIO,
  wave,
} from './ostroke-poses';

const frame = strokeFrame('24');

const finite = (pts: readonly Point[]) =>
  pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

/** Largest turn between adjacent segments, in degrees. */
function maxTurn(pts: readonly Point[]): number {
  let worst = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    const b = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
    let d = Math.abs(b - a);
    if (d > Math.PI) d = 2 * Math.PI - d;
    worst = Math.max(worst, (d * 180) / Math.PI);
  }
  return worst;
}

describe('pose functions', () => {
  for (const pose of OSTROKE_POSES) {
    it(`${pose} returns ${OSTROKE_POINTS} finite points inside the box`, () => {
      const { points } = poseState(pose, frame, { phase: 1.3 });
      expect(points).toHaveLength(OSTROKE_POINTS);
      expect(finite(points)).toBe(true);
      for (const [x, y] of points) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(frame.box);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(frame.box);
      }
    });
  }

  it('samples every pose at equal arc length', () => {
    for (const pose of [
      'circle',
      'line',
      'wave',
      'triangle',
      'roundedSquare',
    ]) {
      const { points } = poseState(pose as never, frame);
      const steps = points
        .slice(1)
        .map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
      const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
      // chords of a curve are a hair shorter than arcs; corners shorten a few
      for (const s of steps)
        expect(Math.abs(s - mean) / mean).toBeLessThan(0.3);
    }
  });

  it('wave amplitude stays within 12% of the diameter and moves with phase', () => {
    const a = wave(frame, 0);
    const b = wave(frame, Math.PI / 2);
    for (const [, y] of [...a, ...b]) {
      expect(Math.abs(y - frame.cy)).toBeLessThanOrEqual(
        frame.box * 0.12 + 1e-9
      );
    }
    expect(WAVE_AMPLITUDE_RATIO).toBeLessThanOrEqual(0.12);
    expect(a[20][1]).not.toBeCloseTo(b[20][1], 2);
  });

  it('wave under reduced motion is one static, gently curved line', () => {
    const p1 = poseState('wave', frame, { phase: 0.4, reduced: true });
    const p2 = poseState('wave', frame, { phase: 2.4, reduced: true });
    expect(p1.points).toEqual(p2.points);
    const sag = Math.max(...p1.points.map(([, y]) => Math.abs(y - frame.cy)));
    expect(sag).toBeGreaterThan(0.2);
    expect(sag).toBeLessThan(frame.box * 0.06);
    expect(maxTurn(p1.points)).toBeLessThan(10);
  });

  it('pause is one stroke whose dash gap hides the crossbar', () => {
    const s = poseState('pause', frame);
    expect(s.gap).toBeGreaterThan(0.05);
    expect(s.gap).toBeLessThan(0.4);
    // the gap is centred, so the visible pieces are the two bars
    const dash = dashArray(s.gap);
    expect(dash).toBeDefined();
    const [a, g, b] = (dash as string).split(' ').map(Number);
    expect(a).toBeCloseTo(b, 3);
    expect(a + g + b).toBeCloseTo(1, 2);
    expect(dashArray(0)).toBeUndefined();
  });

  it('the circle starts at the seed and stops one seam short of it', () => {
    const pts = circle(frame);
    expect(pts[0][0]).toBeCloseTo(frame.cx, 6);
    expect(pts[0][1]).toBeCloseTo(frame.cy - frame.radius, 6);
    const end = pts[pts.length - 1];
    const gap = Math.hypot(end[0] - pts[0][0], end[1] - pts[0][1]);
    expect(gap).toBeGreaterThan(frame.width);
  });

  it('opens at the seed: line starts at the left, circle start is the seed', () => {
    expect(line(frame)[0][0]).toBeCloseTo(frame.cx - frame.radius, 6);
  });

  it('timing: open-to-line and line-to-wave are the slow beat', () => {
    expect(isSlowMorph('circle', 'line')).toBe(true);
    expect(isSlowMorph('line', 'wave')).toBe(true);
    expect(isSlowMorph('wave', 'line')).toBe(true);
    expect(isSlowMorph('circle', 'triangle')).toBe(false);
    expect(isSlowMorph('circle', 'wave')).toBe(false);
  });
});

describe('morph', () => {
  const a = poseState('circle', frame);
  const b = poseState('line', frame);

  it('endpoints equal the poses', () => {
    expect(lerpState(a, b, 0)).toEqual(a);
    expect(lerpState(a, b, 1).points).toEqual(b.points);
    const p = poseState('pause', frame);
    expect(lerpState(a, p, 1).gap).toBeCloseTo(p.gap, 9);
  });

  const pairs: Array<['circle' | 'line' | 'wave' | 'roundedSquare', string]> = [
    ['circle', 'line'],
    ['line', 'wave'],
    ['circle', 'wave'],
    ['circle', 'roundedSquare'],
  ];
  for (const [from, to] of pairs) {
    it(`never kinks mid-morph: ${from} to ${to}`, () => {
      const s0 = poseState(from, frame, { phase: 0.7 });
      const s1 = poseState(to as never, frame, { phase: 0.7 });
      for (let e = 0; e <= 1.0001; e += 0.05) {
        const mid = lerpState(s0, s1, Math.min(e, 1));
        expect(finite(mid.points)).toBe(true);
        expect(maxTurn(mid.points)).toBeLessThan(40);
      }
    });
  }
});

describe('pathData', () => {
  it('writes one path, no second element', () => {
    const d = pathData(circle(frame));
    expect(d.startsWith('M')).toBe(true);
    expect(d.match(/M/g)).toHaveLength(1);
  });
});

describe('rest pose matches JovieO', () => {
  /** Rasterised region of JovieO's rest construction, in box units. */
  function jovieHas(master: ReturnType<typeof masterForSize>) {
    const p = jovieOParts(master);
    return (x: number, y: number) => {
      const inDisc = Math.hypot(x - p.cx, y - p.cy) <= p.r;
      const inCounter =
        ((x - p.cx) / p.counterRx) ** 2 + ((y - p.cy) / p.counterRy) ** 2 < 1;
      const ds = Math.hypot(x - p.seed.cx, y - p.seed.cy);
      const inSeam =
        x >= p.seed.cx && ds >= p.seed.r && ds <= p.seed.r + p.seam;
      return inDisc && !inCounter && !inSeam;
    };
  }

  function strokeHas(pts: readonly Point[], half: number) {
    return (x: number, y: number) => {
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t =
          len2 === 0
            ? 0
            : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
        if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= half)
          return true;
      }
      return false;
    };
  }

  for (const size of [16, 24, 28]) {
    it(`${size}px: the stroke covers the same pixels within 2.5%`, () => {
      const master = masterForSize(size);
      const f = strokeFrame(master);
      const ours = strokeHas(circle(f), f.width / 2);
      const theirs = jovieHas(master);
      const step = 0.1;
      let both = 0;
      let either = 0;
      let jovie = 0;
      for (let x = step / 2; x < f.box; x += step) {
        for (let y = step / 2; y < f.box; y += step) {
          const a = ours(x, y);
          const b = theirs(x, y);
          if (a || b) either++;
          if (a && b) both++;
          if (b) jovie++;
        }
      }
      expect(jovie).toBeGreaterThan(0);
      expect((either - both) / jovie).toBeLessThan(0.025);
    });
  }
});
