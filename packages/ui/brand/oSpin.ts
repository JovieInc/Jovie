import { type RefObject, useEffect, useMemo, useRef } from 'react';

import { skipOneShotMotion } from './jovie-o-motion';

/**
 * Spin, with real physics (slice 4a). Pure model plus one Web Animation.
 *
 * One angular state per O: theta (degrees) and omega (degrees/s).
 *
 *   free    omega' = -kf * omega. Friction carries the impulse down.
 *   settle  once |omega| < SETTLE_BELOW, a near-critically-damped spring
 *           (stiffness 180, damping 26, mass 1) pulls theta to the nearest
 *           home (a multiple of 360) in the direction of travel. It never
 *           turns back for a home behind it and overshoots by at most 2 deg.
 *
 * Both phases are closed-form, so theta and omega are readable at any time
 * and an interrupt adds its impulse to the live omega without ever resetting
 * it. A spin is played as `transform: rotate`, a Web Animation with a CSS
 * linear() easing sampled from the curve: compositor only, no frame loop.
 */

export const SPIN = {
  /** Free-phase friction, 1/s. */
  friction: 3.2,
  /** Below this speed the spring takes over, deg/s. */
  settleBelow: 90,
  stiffness: 180,
  damping: 26,
  mass: 1,
  /** Peak angular speed, deg/s. */
  maxOmega: 720,
  /** The most a settle may pass its home, deg. */
  maxOvershoot: 2,
  /** Points in the sampled linear() easing. */
  easingPoints: 60,
} as const;

export interface SpinState {
  readonly theta: number;
  readonly omega: number;
}

interface Spring {
  /** Natural frequency and damping ratio of the (possibly retuned) spring. */
  readonly wn: number;
  readonly zeta: number;
  /** Position relative to home, signed so home is 0 and travel is toward +. */
  readonly x0: number;
  readonly v0: number;
}

export interface SpinPlan {
  readonly start: SpinState;
  /** End of the free phase, s. */
  readonly freeSeconds: number;
  readonly atHandoff: SpinState;
  /** +1 or -1. */
  readonly dir: 1 | -1;
  readonly home: number;
  readonly spring: Spring;
  readonly seconds: number;
}

const clampOmega = (w: number) =>
  Math.max(-SPIN.maxOmega, Math.min(SPIN.maxOmega, w));

/** Spring displacement and velocity at time t after the handoff. */
function springAt(s: Spring, t: number): { x: number; v: number } {
  const sigma = s.zeta * s.wn;
  const wd = s.wn * Math.sqrt(1 - s.zeta * s.zeta);
  const a = s.x0;
  const b = (s.v0 + sigma * s.x0) / wd;
  const e = Math.exp(-sigma * t);
  const c = Math.cos(wd * t);
  const n = Math.sin(wd * t);
  return {
    x: e * (a * c + b * n),
    v: e * ((b * wd - sigma * a) * c + (-a * wd - sigma * b) * n),
  };
}

const ZETA = SPIN.damping / (2 * Math.sqrt(SPIN.stiffness * SPIN.mass));
const WN = Math.sqrt(SPIN.stiffness / SPIN.mass);

interface SpringShape {
  readonly peak: number;
  readonly overshoot: number;
  readonly settle: number;
}

function measure(s: Spring): SpringShape {
  let peak = 0;
  let overshoot = 0;
  let settle = 0;
  for (let t = 0; t <= 6; t += 0.002) {
    const { x, v } = springAt(s, t);
    peak = Math.max(peak, Math.abs(v));
    overshoot = Math.max(overshoot, x);
    if (Math.abs(x) > 0.02 || Math.abs(v) > 0.5) settle = t;
  }
  return { peak, overshoot, settle: settle + 0.002 };
}

/**
 * The spring toward a given home. A home far ahead would whip the O past the
 * speed cap, so the same spring is slowed (stiffness and damping scaled
 * together, ratio unchanged) until its peak speed fits.
 */
function springTo(x0: number, v0: number): Spring & SpringShape {
  let scale = 1;
  let spring: Spring = { wn: WN, zeta: ZETA, x0, v0 };
  let shape = measure(spring);
  for (let i = 0; i < 8 && shape.peak > SPIN.maxOmega * 0.98; i++) {
    scale *= (SPIN.maxOmega * 0.96) / shape.peak;
    spring = { wn: WN * scale, zeta: ZETA, x0, v0 };
    shape = measure(spring);
  }
  return { ...spring, ...shape };
}

/** Plan a spin from a live state. Pure. */
export function planSpin(from: SpinState): SpinPlan {
  const omega0 = clampOmega(from.omega);
  const fast = Math.abs(omega0) >= SPIN.settleBelow;
  const freeSeconds = fast
    ? Math.log(Math.abs(omega0) / SPIN.settleBelow) / SPIN.friction
    : 0;
  const handoff: SpinState = fast
    ? {
        theta:
          from.theta +
          (omega0 * (1 - SPIN.settleBelow / Math.abs(omega0))) / SPIN.friction,
        omega: Math.sign(omega0) * SPIN.settleBelow,
      }
    : { theta: from.theta, omega: omega0 };

  // Direction of travel; at rest the nearest home wins.
  const dir: 1 | -1 = handoff.omega >= 0 ? 1 : -1;
  const still = handoff.omega === 0;
  const ahead =
    dir === 1
      ? Math.ceil((handoff.theta - 1e-9) / 360) * 360
      : Math.floor((handoff.theta + 1e-9) / 360) * 360;
  const first = still ? Math.round(handoff.theta / 360) * 360 : ahead;

  let chosen: (Spring & SpringShape) | undefined;
  let home = first;
  for (let k = 0; k < 4; k++) {
    home = first + (still ? 0 : dir * 360 * k);
    const x0 = dir * (handoff.theta - home);
    chosen = springTo(x0, dir * handoff.omega);
    if (chosen.overshoot <= SPIN.maxOvershoot * 0.95 || still) break;
  }
  const spring = chosen as Spring & SpringShape;
  return {
    start: { theta: from.theta, omega: omega0 },
    freeSeconds,
    atHandoff: handoff,
    dir,
    home,
    spring,
    seconds: freeSeconds + spring.settle,
  };
}

/** theta and omega at time t (s) into the plan. Closed form. */
export function spinAt(plan: SpinPlan, t: number): SpinState {
  if (t <= 0) return plan.start;
  if (t >= plan.seconds) return { theta: plan.home, omega: 0 };
  if (t < plan.freeSeconds) {
    return {
      theta:
        plan.start.theta +
        (plan.start.omega * (1 - Math.exp(-SPIN.friction * t))) / SPIN.friction,
      omega: plan.start.omega * Math.exp(-SPIN.friction * t),
    };
  }
  const { x, v } = springAt(plan.spring, t - plan.freeSeconds);
  return { theta: plan.home + plan.dir * x, omega: plan.dir * v };
}

export interface SpinCurve {
  /** CSS linear() easing of progress, 0 at the start and 1 at the end angle. */
  readonly easing: string;
  readonly durationMs: number;
  readonly startAngle: number;
  readonly endAngle: number;
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** Sample a plan into a linear() easing at SPIN.easingPoints points. */
export function sampleSpin(plan: SpinPlan): SpinCurve {
  const span = plan.home - plan.start.theta;
  const n = SPIN.easingPoints;
  const stops: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * plan.seconds;
    stops.push(
      i === n - 1 || span === 0
        ? i === 0
          ? 0
          : 1
        : r4((spinAt(plan, t).theta - plan.start.theta) / span)
    );
  }
  return {
    easing: `linear(${stops.join(', ')})`,
    durationMs: Math.round(plan.seconds * 1000),
    startAngle: plan.start.theta,
    endAngle: plan.home,
  };
}

/** Plan and sample in one step. */
export function spinCurve(from: SpinState): SpinCurve & { plan: SpinPlan } {
  const plan = planSpin(from);
  return { ...sampleSpin(plan), plan };
}

export interface SpinPlayer {
  /** Add an impulse (deg/s) to the live motion. Never resets omega. */
  impulse(omega: number): void;
  /** Where the O is right now. */
  state(): SpinState;
  /** Stop and rest at the nearest home (used when the window hides). */
  stop(): void;
}

interface PlayerOptions {
  readonly element: () => Element | null;
  readonly now?: () => number;
}

/** Plays spins as one Web Animation on `transform: rotate`. */
export function createSpinPlayer({
  element,
  now = () => performance.now(),
}: PlayerOptions): SpinPlayer {
  let plan: SpinPlan | null = null;
  let startedAt = 0;
  let animation: Animation | null = null;

  const live = (): SpinState => {
    if (!plan) return { theta: 0, omega: 0 };
    return spinAt(plan, (now() - startedAt) / 1000);
  };

  const rest = () => {
    animation?.cancel();
    animation = null;
    plan = null;
  };

  return {
    state: live,
    stop: rest,
    impulse(omega) {
      if (skipOneShotMotion()) return;
      const el = element();
      if (!el) return;
      const cur = live();
      const next = planSpin({ theta: cur.theta, omega: cur.omega + omega });
      const curve = sampleSpin(next);
      animation?.cancel();
      animation = null;
      if (curve.durationMs <= 0 || curve.startAngle === curve.endAngle) {
        plan = null;
        return;
      }
      plan = next;
      startedAt = now();
      const anim = el.animate(
        [
          { transform: `rotate(${curve.startAngle}deg)` },
          { transform: `rotate(${curve.endAngle}deg)` },
        ],
        {
          duration: curve.durationMs,
          easing: curve.easing,
          fill: 'forwards',
        }
      );
      animation = anim;
      // Home is a multiple of 360, the same pixels as the resting transform.
      const landed = () => {
        if (animation !== anim) return;
        rest();
      };
      anim.onfinish = landed;
    },
  };
}

/**
 * Spin an element. Does nothing under reduced motion (the O stays home) and
 * stops when the document is hidden. The element rotates about its own centre.
 */
export function useOSpin(target: RefObject<Element | null>): SpinPlayer {
  const player = useMemo(
    () => createSpinPlayer({ element: () => target.current }),
    [target]
  );
  const playerRef = useRef(player);
  playerRef.current = player;

  useEffect(() => {
    const onHide = () => {
      if (document.hidden) playerRef.current.stop();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      playerRef.current.stop();
    };
  }, []);

  return player;
}
