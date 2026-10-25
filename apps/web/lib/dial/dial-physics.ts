/**
 * Pure physics for the release-page service dial. Positions are measured in
 * items (1 = one row), velocities in items per millisecond, times in ms. Nothing
 * here touches the DOM, timers or React, so every rule is unit-testable with
 * plain numbers and a fake clock.
 *
 * The constants mirror UIKit: UIScrollView.DecelerationRate.normal (0.998 per
 * ms), the 0.55 rubber-band coefficient used by UIScrollView overscroll, and a
 * critically damped spring for snapping (what UIPickerView settles with).
 */

/** UIScrollView.DecelerationRate.normal, applied per millisecond. */
export const DECELERATION_RATE = 0.998;
/** Rubber-band coefficient from UIScrollView overscroll. */
export const RUBBER_BAND_COEFFICIENT = 0.55;
/** Furthest the dial may be pulled past either end, in items. */
export const EDGE_LIMIT_ITEMS = 2;
/** Velocity is measured over this trailing window. */
export const VELOCITY_WINDOW_MS = 100;
/** A finger that rests this long before lifting throws nothing (iOS rule). */
export const VELOCITY_STALE_MS = 60;
/** Slower than this (items/ms) counts as a plain release. */
export const MIN_FLING_VELOCITY = 0.0003;
/** Cap on a throw, items/ms (about 6700 px/s at a 56px row). */
export const MAX_FLING_VELOCITY = 0.12;
/** Spring stiffness (1/ms) for a release with no useful velocity. */
export const SNAP_STIFFNESS = 0.012;
/** Bounds for the stiffness of a throw, so tails stay short but smooth. */
export const MIN_FLING_STIFFNESS = 0.0035;
export const MAX_FLING_STIFFNESS = 0.03;
/** Furthest a bounce may travel past an end, in items. */
export const MAX_OVERSHOOT_ITEMS = 0.6;
const REST_POSITION_EPSILON = 0.006;
const REST_VELOCITY_EPSILON = 0.0002;
const MAX_RELEASE_MS = 6000;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * UIScrollView rubber band: how far the content shows for a drag of `offset`
 * past an edge, with `limit` as the asymptote.
 */
export function rubberBand(
  offset: number,
  limit: number = EDGE_LIMIT_ITEMS,
  coefficient: number = RUBBER_BAND_COEFFICIENT
): number {
  if (offset <= 0) return 0;
  return (1 - 1 / ((offset * coefficient) / limit + 1)) * limit;
}

/** Inverse of {@link rubberBand}: the raw drag that shows `shown`. */
export function rubberBandInverse(
  shown: number,
  limit: number = EDGE_LIMIT_ITEMS,
  coefficient: number = RUBBER_BAND_COEFFICIENT
): number {
  if (shown <= 0) return 0;
  const bounded = Math.min(shown, limit * 0.999);
  return (limit / coefficient) * (1 / (1 - bounded / limit) - 1);
}

/** Maps a raw (finger-driven) position to the one shown, resisting past ends. */
export function applyEdgeResistance(
  raw: number,
  min: number,
  max: number,
  limit: number = EDGE_LIMIT_ITEMS
): number {
  if (raw < min) return min - rubberBand(min - raw, limit);
  if (raw > max) return max + rubberBand(raw - max, limit);
  return raw;
}

/** Inverse of {@link applyEdgeResistance}. */
export function removeEdgeResistance(
  shown: number,
  min: number,
  max: number,
  limit: number = EDGE_LIMIT_ITEMS
): number {
  if (shown < min) return min - rubberBandInverse(min - shown, limit);
  if (shown > max) return max + rubberBandInverse(shown - max, limit);
  return shown;
}

/** Where a throw would coast to with exponential deceleration `rate` per ms. */
export function projectEnd(
  position: number,
  velocity: number,
  rate: number = DECELERATION_RATE
): number {
  return position + (velocity * rate) / (1 - rate);
}

/** The item a release settles on: nearest to the projected end, in range. */
export function snapTarget(
  position: number,
  velocity: number,
  min: number,
  max: number,
  rate: number = DECELERATION_RATE
): number {
  const fling = Math.abs(velocity) >= MIN_FLING_VELOCITY ? velocity : 0;
  return clamp(Math.round(projectEnd(position, fling, rate)), min, max);
}

interface Sample {
  readonly position: number;
  readonly time: number;
}

/** Trailing-window velocity estimate (items/ms) from timestamped positions. */
export class VelocityTracker {
  private samples: Sample[] = [];

  reset(): void {
    this.samples = [];
  }

  push(position: number, time: number): void {
    this.samples.push({ position, time });
    const horizon = time - VELOCITY_WINDOW_MS * 2;
    while (this.samples.length > 2 && this.samples[0]!.time < horizon) {
      this.samples.shift();
    }
  }

  /** Velocity at release time `now`; zero if the finger rested before lifting. */
  velocity(now: number): number {
    const last = this.samples.at(-1);
    if (!last || now - last.time > VELOCITY_STALE_MS) return 0;
    const recent = this.samples.filter(
      sample => sample.time >= last.time - VELOCITY_WINDOW_MS
    );
    const first = recent[0]!;
    const span = last.time - first.time;
    if (span < 8) return 0;
    const velocity = (last.position - first.position) / span;
    return clamp(velocity, -MAX_FLING_VELOCITY, MAX_FLING_VELOCITY);
  }
}

export interface ReleaseState {
  readonly position: number;
  readonly velocity: number;
  readonly done: boolean;
}

export interface ReleaseCurve {
  readonly target: number;
  /** Milliseconds until the curve is at rest. */
  readonly duration: number;
  at(elapsed: number): ReleaseState;
}

/**
 * Critically damped spring from `position` (moving at `velocity`) to `target`.
 * With stiffness = velocity / distance the curve is exactly UIScrollView's
 * exponential deceleration, so a throw coasts the projected distance; with a
 * stiffer spring it is the short snap UIPickerView uses.
 */
export function createRelease(
  position: number,
  velocity: number,
  target: number
): ReleaseCurve {
  const offset = position - target;
  const toward = -offset;
  const natural = toward === 0 ? 0 : velocity / toward;
  const stiffness =
    natural > 0
      ? clamp(natural, MIN_FLING_STIFFNESS, MAX_FLING_STIFFNESS)
      : SNAP_STIFFNESS;
  const lead = velocity + stiffness * offset;
  const at = (elapsed: number): ReleaseState => {
    const t = Math.max(0, elapsed);
    const decay = Math.exp(-stiffness * t);
    const displacement = (offset + lead * t) * decay;
    const speed = (lead - stiffness * offset - stiffness * lead * t) * decay;
    const done =
      Math.abs(displacement) < REST_POSITION_EPSILON &&
      Math.abs(speed) < REST_VELOCITY_EPSILON;
    if (done) return { position: target, velocity: 0, done: true };
    const shown = clamp(
      target + displacement,
      Math.min(position, target) - MAX_OVERSHOOT_ITEMS,
      Math.max(position, target) + MAX_OVERSHOOT_ITEMS
    );
    return { position: shown, velocity: speed, done: false };
  };
  let duration = MAX_RELEASE_MS;
  for (let t = 0; t < MAX_RELEASE_MS; t += 8) {
    if (at(t).done) {
      duration = t;
      break;
    }
  }
  return { target, duration, at };
}
