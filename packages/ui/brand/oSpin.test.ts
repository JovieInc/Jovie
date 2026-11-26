import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSpinPlayer,
  planSpin,
  SPIN,
  sampleSpin,
  spinAt,
  spinCurve,
} from './oSpin';

const trace = (omega: number, theta = 0) => {
  const plan = planSpin({ theta, omega });
  const pts = [];
  for (let t = 0; t <= plan.seconds + 0.01; t += 0.002) {
    pts.push({ t, ...spinAt(plan, t) });
  }
  return { plan, pts };
};

describe('spin physics', () => {
  for (const omega of [720, 500, 300, 150, 95, 60, -720, -400, -120]) {
    it(`omega ${omega}: settles on a multiple of 360 in the travel direction`, () => {
      const { plan } = trace(omega, 17);
      const dir = Math.sign(omega);
      expect(Math.abs(plan.home % 360)).toBe(0);
      expect(Math.sign(plan.home - 17)).toBe(dir);
      expect(spinAt(plan, plan.seconds + 1)).toEqual({
        theta: plan.home,
        omega: 0,
      });
    });

    it(`omega ${omega}: never passes home by more than 2 degrees`, () => {
      const { plan, pts } = trace(omega, 17);
      const dir = Math.sign(omega);
      const over = Math.max(...pts.map(p => dir * (p.theta - plan.home)));
      expect(over).toBeLessThanOrEqual(SPIN.maxOvershoot);
    });

    it(`omega ${omega}: never turns back and stays under the speed cap`, () => {
      const { pts } = trace(omega, 17);
      const dir = Math.sign(omega);
      for (const p of pts) {
        expect(Math.abs(p.omega)).toBeLessThanOrEqual(SPIN.maxOmega + 1e-6);
        // tolerance: a settle may brush back by the overshoot allowance only
        expect(dir * p.omega).toBeGreaterThan(-60);
      }
    });
  }

  it('caps an impulse at 720 deg/s', () => {
    const plan = planSpin({ theta: 0, omega: 5000 });
    expect(plan.start.omega).toBe(SPIN.maxOmega);
    const { pts } = trace(5000);
    expect(Math.max(...pts.map(p => Math.abs(p.omega)))).toBeLessThanOrEqual(
      SPIN.maxOmega
    );
  });

  it('free phase is exponential friction', () => {
    const plan = planSpin({ theta: 0, omega: 720 });
    const w = spinAt(plan, 0.25).omega;
    expect(w).toBeCloseTo(720 * Math.exp(-SPIN.friction * 0.25), 6);
    // hands off to the spring at 90 deg/s
    expect(plan.atHandoff.omega).toBe(SPIN.settleBelow);
  });

  it('a slow nudge goes straight to the spring and settles at home', () => {
    const plan = planSpin({ theta: 40, omega: 30 });
    expect(plan.freeSeconds).toBe(0);
    expect(plan.home).toBe(360);
  });

  it('a full flick is friction from 720 down to the handoff, then the settle', () => {
    const { plan } = trace(720, 0);
    expect(plan.freeSeconds).toBeCloseTo(
      Math.log(720 / SPIN.settleBelow) / SPIN.friction,
      9
    );
    expect(plan.seconds).toBe(plan.freeSeconds + plan.spring.settle);
  });

  it('interrupt keeps theta and omega continuous and adds the impulse', () => {
    const first = planSpin({ theta: 0, omega: 600 });
    for (const at of [
      0.1,
      0.4,
      first.freeSeconds + 0.05,
      first.seconds - 0.1,
    ]) {
      const live = spinAt(first, at);
      const second = planSpin({ theta: live.theta, omega: live.omega + 200 });
      expect(second.start.theta).toBe(live.theta);
      expect(second.start.omega).toBeCloseTo(
        Math.max(-SPIN.maxOmega, Math.min(SPIN.maxOmega, live.omega + 200)),
        9
      );
      // with no impulse the replan carries the same velocity just after
      const same = planSpin({ theta: live.theta, omega: live.omega });
      const dt = 0.001;
      const after = spinAt(same, dt);
      expect((after.theta - live.theta) / dt).toBeCloseTo(live.omega, -1);
    }
  });

  it('omega is the derivative of theta along the whole curve', () => {
    const { plan } = trace(650, 5);
    const dt = 0.0005;
    for (let t = 0.05; t < plan.seconds - 0.05; t += 0.07) {
      const num =
        (spinAt(plan, t + dt).theta - spinAt(plan, t - dt).theta) / (2 * dt);
      expect(num).toBeCloseTo(spinAt(plan, t).omega, -1);
    }
  });

  it('samples a 60 point linear() easing from 0 to 1', () => {
    const curve = spinCurve({ theta: 0, omega: 600 });
    const stops = curve.easing
      .replace('linear(', '')
      .replace(')', '')
      .split(', ');
    expect(stops).toHaveLength(SPIN.easingPoints);
    expect(Number(stops[0])).toBe(0);
    expect(Number(stops[stops.length - 1])).toBe(1);
    expect(curve.durationMs).toEqual(Math.round(curve.plan.seconds * 1000));
    expect(curve.endAngle).toBe(curve.plan.home);
    expect(sampleSpin(curve.plan).easing).toBe(curve.easing);
  });
});

describe('spin player', () => {
  const animations: Array<{
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions;
    cancel: ReturnType<typeof vi.fn>;
    onfinish: (() => void) | null;
  }> = [];
  let matches = false;

  beforeEach(() => {
    animations.length = 0;
    matches = false;
    Object.defineProperty(Element.prototype, 'animate', {
      configurable: true,
      value: vi.fn(
        (keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
          const a = { keyframes, options, cancel: vi.fn(), onfinish: null };
          animations.push(a);
          return a;
        }
      ),
    });
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches, media: '' }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(Element.prototype, 'animate');
  });

  const make = (clock: { t: number }) => {
    const el = document.createElement('div');
    return createSpinPlayer({ element: () => el, now: () => clock.t });
  };

  it('plays transform: rotate only, with a linear() easing', () => {
    const player = make({ t: 0 });
    player.impulse(600);
    expect(animations).toHaveLength(1);
    const { keyframes, options } = animations[0];
    for (const k of keyframes) expect(Object.keys(k)).toEqual(['transform']);
    expect(String(options.easing)).toMatch(/^linear\(/);
    expect(options.duration).toBeTruthy();
  });

  it('an interrupt cancels the old animation and starts from the live angle', () => {
    const clock = { t: 0 };
    const player = make(clock);
    player.impulse(600);
    clock.t = 300;
    const live = player.state();
    expect(live.omega).toBeGreaterThan(0);
    player.impulse(150);
    expect(animations[0].cancel).toHaveBeenCalled();
    expect(animations).toHaveLength(2);
    expect(animations[1].keyframes[0]).toEqual({
      transform: `rotate(${live.theta}deg)`,
    });
  });

  it('cancels cleanly when the animation finishes and when stopped', () => {
    const player = make({ t: 0 });
    player.impulse(500);
    animations[0].onfinish?.();
    expect(animations[0].cancel).toHaveBeenCalled();
    expect(player.state()).toEqual({ theta: 0, omega: 0 });
    player.impulse(500);
    player.stop();
    expect(animations[1].cancel).toHaveBeenCalled();
  });

  it('does nothing under reduced motion', () => {
    matches = true;
    const player = make({ t: 0 });
    player.impulse(700);
    expect(animations).toHaveLength(0);
    expect(player.state()).toEqual({ theta: 0, omega: 0 });
  });
});
