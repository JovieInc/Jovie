import { describe, expect, it } from 'vitest';
import {
  applyEdgeResistance,
  clamp,
  createRelease,
  DECELERATION_RATE,
  EDGE_LIMIT_ITEMS,
  MAX_FLING_VELOCITY,
  MAX_OVERSHOOT_ITEMS,
  MIN_FLING_VELOCITY,
  projectEnd,
  removeEdgeResistance,
  rubberBand,
  rubberBandInverse,
  snapTarget,
  VELOCITY_STALE_MS,
  VelocityTracker,
} from './dial-physics';

describe('clamp', () => {
  it('bounds a value on both sides', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});

describe('rubberBand', () => {
  it('is zero at and before the edge', () => {
    expect(rubberBand(0)).toBe(0);
    expect(rubberBand(-3)).toBe(0);
  });
  it('matches the UIScrollView formula', () => {
    // (1 - 1 / (x * 0.55 / d + 1)) * d with x = 2, d = 2.
    expect(rubberBand(2)).toBeCloseTo((1 - 1 / ((2 * 0.55) / 2 + 1)) * 2, 12);
  });
  it('resists more the further it is pulled and never reaches the limit', () => {
    const near = rubberBand(1);
    const far = rubberBand(2);
    expect(far).toBeGreaterThan(near);
    expect(far - near).toBeLessThan(near - rubberBand(0));
    expect(rubberBand(1000)).toBeLessThan(EDGE_LIMIT_ITEMS);
  });
  it('round-trips through its inverse', () => {
    for (const raw of [0.1, 0.5, 1, 3, 8]) {
      expect(rubberBandInverse(rubberBand(raw))).toBeCloseTo(raw, 9);
    }
    expect(rubberBandInverse(0)).toBe(0);
    expect(rubberBandInverse(-1)).toBe(0);
    expect(Number.isFinite(rubberBandInverse(EDGE_LIMIT_ITEMS * 2))).toBe(true);
  });
});

describe('edge resistance', () => {
  it('leaves in-range positions alone', () => {
    expect(applyEdgeResistance(0, 0, 9)).toBe(0);
    expect(applyEdgeResistance(4.4, 0, 9)).toBe(4.4);
    expect(applyEdgeResistance(9, 0, 9)).toBe(9);
  });
  it('rubber-bands past either end, mirrored', () => {
    expect(applyEdgeResistance(-1, 0, 9)).toBeCloseTo(-rubberBand(1), 12);
    expect(applyEdgeResistance(10, 0, 9)).toBeCloseTo(9 + rubberBand(1), 12);
    expect(applyEdgeResistance(-1, 0, 9)).toBeGreaterThan(-1);
  });
  it('removes resistance exactly', () => {
    for (const raw of [-4, -0.7, 0, 3, 9, 9.3, 14]) {
      const shown = applyEdgeResistance(raw, 0, 9);
      expect(removeEdgeResistance(shown, 0, 9)).toBeCloseTo(raw, 8);
    }
  });
});

describe('projectEnd and snapTarget', () => {
  it('projects the UIScrollView deceleration distance v * d / (1 - d)', () => {
    // 0.02 items/ms is 1.12 px/ms at a 56px row; 0.998/(0.002) = 499.
    expect(projectEnd(10, 0.02)).toBeCloseTo(10 + 0.02 * 499, 9);
    expect(projectEnd(10, -0.02)).toBeCloseTo(10 - 0.02 * 499, 9);
    expect(projectEnd(10, 0)).toBe(10);
    expect(DECELERATION_RATE).toBe(0.998);
  });
  it('honours a custom rate', () => {
    expect(projectEnd(0, 1, 0.5)).toBeCloseTo(1, 12);
  });
  it('snaps a slow release to the nearest item', () => {
    expect(snapTarget(4.4, 0, 0, 99)).toBe(4);
    expect(snapTarget(4.6, 0, 0, 99)).toBe(5);
    expect(snapTarget(4.5, 0, 0, 99)).toBe(5);
  });
  it('ignores sub-threshold drift velocity', () => {
    const drift = MIN_FLING_VELOCITY * 0.9;
    expect(snapTarget(4.4, drift, 0, 99)).toBe(4);
    expect(snapTarget(4.4, -drift, 0, 99)).toBe(4);
  });
  it('uses the projected end for a throw, in either direction', () => {
    expect(snapTarget(10, 0.02, 0, 99)).toBe(Math.round(10 + 0.02 * 499));
    expect(snapTarget(50, -0.02, 0, 99)).toBe(Math.round(50 - 0.02 * 499));
  });
  it('treats a velocity exactly at the threshold as a throw', () => {
    expect(snapTarget(0, MIN_FLING_VELOCITY, 0, 99)).toBe(
      Math.round(MIN_FLING_VELOCITY * 499)
    );
    expect(snapTarget(0, 0.0006, 0, 99)).toBe(0);
    expect(snapTarget(0, 0.002, 0, 99)).toBe(1);
  });
  it('clamps to the list ends', () => {
    expect(snapTarget(95, 0.1, 0, 99)).toBe(99);
    expect(snapTarget(3, -0.1, 0, 99)).toBe(0);
    expect(snapTarget(-0.4, 0, 0, 99)).toBe(0);
    expect(snapTarget(99.4, 0, 0, 99)).toBe(99);
  });
});

describe('VelocityTracker', () => {
  it('measures constant-speed motion', () => {
    const tracker = new VelocityTracker();
    for (let t = 0; t <= 80; t += 16) tracker.push(t * 0.01, t);
    expect(tracker.velocity(85)).toBeCloseTo(0.01, 9);
  });
  it('is zero when there is no history', () => {
    expect(new VelocityTracker().velocity(100)).toBe(0);
  });
  it('is zero when the finger rested before lifting', () => {
    const tracker = new VelocityTracker();
    for (let t = 0; t <= 80; t += 16) tracker.push(t * 0.01, t);
    expect(tracker.velocity(80 + VELOCITY_STALE_MS)).toBeCloseTo(0.01, 9);
    expect(tracker.velocity(80 + VELOCITY_STALE_MS + 1)).toBe(0);
  });
  it('is zero for a single sample or a span under 8ms', () => {
    const tracker = new VelocityTracker();
    tracker.push(0, 0);
    expect(tracker.velocity(5)).toBe(0);
    tracker.push(1, 7);
    expect(tracker.velocity(8)).toBe(0);
    tracker.push(2, 8);
    expect(tracker.velocity(9)).toBeGreaterThan(0);
  });
  it('only looks at the trailing 100ms window', () => {
    const tracker = new VelocityTracker();
    // Fast early motion, then a slow final stretch.
    for (let t = 0; t <= 100; t += 10) tracker.push(t * 0.05, t);
    for (let t = 110; t <= 300; t += 10) tracker.push(5 + (t - 100) * 0.002, t);
    expect(tracker.velocity(300)).toBeCloseTo(0.002, 6);
  });
  it('signs the velocity and caps a violent throw', () => {
    const tracker = new VelocityTracker();
    for (let t = 0; t <= 48; t += 16) tracker.push(-t, t);
    expect(tracker.velocity(48)).toBe(-MAX_FLING_VELOCITY);
    tracker.reset();
    for (let t = 0; t <= 48; t += 16) tracker.push(t, t);
    expect(tracker.velocity(48)).toBe(MAX_FLING_VELOCITY);
  });
  it('forgets samples after reset', () => {
    const tracker = new VelocityTracker();
    tracker.push(0, 0);
    tracker.push(1, 50);
    tracker.reset();
    expect(tracker.velocity(60)).toBe(0);
  });
  it('keeps memory bounded on a long drag', () => {
    const tracker = new VelocityTracker();
    for (let t = 0; t <= 10_000; t += 8) tracker.push(t * 0.001, t);
    expect(tracker.velocity(10_000)).toBeCloseTo(0.001, 9);
  });
});

describe('createRelease', () => {
  it('starts exactly where the finger left, moving at the release velocity', () => {
    const curve = createRelease(10, 0.02, snapTarget(10, 0.02, 0, 99));
    const start = curve.at(0);
    expect(start.position).toBeCloseTo(10, 9);
    expect(start.velocity).toBeCloseTo(0.02, 9);
    expect(start.done).toBe(false);
  });
  it('coasts the projected distance as UIScrollView does', () => {
    // Exact projection of 0.02 items/ms is 9.98 items; the curve must carry
    // the dial there and rest on the snapped item.
    const target = snapTarget(10, 0.02, 0, 99);
    const curve = createRelease(10, 0.02, target);
    expect(curve.target).toBe(20);
    const end = curve.at(curve.duration);
    expect(end).toEqual({ position: 20, velocity: 0, done: true });
    // Early on it decays like 0.998^t: after 200ms about 33% of the throw.
    const fraction = (curve.at(200).position - 10) / (target - 10);
    expect(fraction).toBeGreaterThan(0.3);
    expect(fraction).toBeLessThan(0.45);
  });
  it('moves monotonically toward the target with no overshoot when the spring is not bounded', () => {
    const curve = createRelease(10, 0.02, 20);
    let previous = 10;
    for (let t = 0; t <= curve.duration; t += 8) {
      const { position } = curve.at(t);
      expect(position).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(position).toBeLessThanOrEqual(20);
      previous = position;
    }
  });
  it('decelerates: speed never rises after the first tenth of the throw', () => {
    const curve = createRelease(0, 0.05, 25);
    let previous = Number.POSITIVE_INFINITY;
    for (let t = 100; t < curve.duration - 8; t += 8) {
      const { velocity } = curve.at(t);
      expect(velocity).toBeLessThanOrEqual(previous + 1e-12);
      previous = velocity;
    }
  });
  it('snaps a still release in a quarter second or so, without overshoot', () => {
    const curve = createRelease(4.4, 0, 4);
    expect(curve.duration).toBeGreaterThan(200);
    expect(curve.duration).toBeLessThan(700);
    for (let t = 0; t <= curve.duration; t += 8) {
      expect(curve.at(t).position).toBeGreaterThanOrEqual(4 - 1e-9);
    }
    expect(curve.at(curve.duration).position).toBe(4);
  });
  it('starts a non-zero release already at rest when nothing is left to do', () => {
    const curve = createRelease(4, 0, 4);
    expect(curve.duration).toBe(0);
    expect(curve.at(0)).toEqual({ position: 4, velocity: 0, done: true });
  });
  it('bounces past a hard stop and returns, within the overshoot cap', () => {
    // Thrown at the end of the list: target is the last item.
    const curve = createRelease(98.6, 0.1, 99);
    let peak = 0;
    for (let t = 0; t <= curve.duration; t += 4) {
      peak = Math.max(peak, curve.at(t).position - 99);
    }
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThanOrEqual(MAX_OVERSHOOT_ITEMS + 1e-9);
    expect(curve.at(curve.duration).position).toBe(99);
  });
  it('springs back from a pulled-past-the-end position', () => {
    const curve = createRelease(-1.2, 0, 0);
    expect(curve.at(0).position).toBeCloseTo(-1.2, 9);
    expect(curve.at(60).position).toBeGreaterThan(-1.2);
    expect(curve.at(curve.duration).position).toBe(0);
  });
  it('carries momentum into a reversal when the target is behind the motion', () => {
    // Moving forward at release but rounding back: the dial keeps going a
    // touch before it returns, instead of snapping its velocity to zero.
    const curve = createRelease(5.3, 0.001, 5);
    expect(curve.at(0).velocity).toBeCloseTo(0.001, 9);
    expect(curve.at(curve.duration).position).toBe(5);
  });
  it('treats negative time as the start', () => {
    const curve = createRelease(10, 0.02, 20);
    expect(curve.at(-50)).toEqual(curve.at(0));
  });
  it('always rests within the safety cap', () => {
    const curve = createRelease(0, 0.12, 60);
    expect(curve.duration).toBeLessThan(6000);
    expect(curve.at(6000).done).toBe(true);
  });
});

describe('mutation-hardening: boundaries and windows', () => {
  it('treats a velocity exactly at the fling threshold as a throw', () => {
    // 0.4 + 0.0003 * 499 rounds up; the same release without a throw rounds down.
    expect(snapTarget(0.4, MIN_FLING_VELOCITY, 0, 99)).toBe(1);
    expect(snapTarget(0.4, MIN_FLING_VELOCITY * 0.99, 0, 99)).toBe(0);
  });
  it('keeps the inverse finite and monotonic beyond the asymptote', () => {
    const limit = EDGE_LIMIT_ITEMS;
    expect(rubberBandInverse(limit * 5)).toBeCloseTo(
      rubberBandInverse(limit * 0.999),
      6
    );
    expect(rubberBandInverse(limit * 0.5)).toBeLessThan(
      rubberBandInverse(limit * 0.9)
    );
  });
  it('includes a sample exactly one window back', () => {
    const tracker = new VelocityTracker();
    tracker.push(0, 0);
    tracker.push(1, 100);
    expect(tracker.velocity(100)).toBeCloseTo(0.01, 9);
  });
  it('drops samples older than the window even while they are retained', () => {
    const tracker = new VelocityTracker();
    // Fast to t=40, then slow; everything is inside the retention horizon.
    for (let t = 0; t <= 40; t += 10) tracker.push(t * 0.1, t);
    for (let t = 50; t <= 190; t += 10) tracker.push(4 + (t - 40) * 0.002, t);
    expect(tracker.velocity(190)).toBeCloseTo(0.002, 6);
  });
  it('a release starting at its target with leftover velocity settles gently', () => {
    const curve = createRelease(5, 0.02, 5);
    expect(curve.duration).toBeGreaterThan(300);
    expect(curve.at(0).velocity).toBeCloseTo(0.02, 9);
    expect(curve.at(curve.duration).position).toBe(5);
  });
  it('a release is not done while it is still moving, even if it is on the target', () => {
    const curve = createRelease(5, 0.02, 5);
    expect(curve.at(0).done).toBe(false);
  });
});
