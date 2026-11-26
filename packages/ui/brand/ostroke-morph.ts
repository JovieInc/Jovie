import { JOVIE_O_EASE, JOVIE_O_MOTION_TOKENS } from './jovie-o-motion';
import { lerpState, type StrokeState } from './ostroke-poses';

/** Solve a CSS cubic-bezier(x1, y1, x2, y2) easing for progress 0..1. */
export function cubicBezierEase(css: string): (t: number) => number {
  const nums = /cubic-bezier\(([^)]+)\)/.exec(css)?.[1].split(',').map(Number);
  if (!nums || nums.length !== 4 || nums.some(n => !Number.isFinite(n))) {
    return t => t;
  }
  const [x1, y1, x2, y2] = nums;
  const bez = (a: number, b: number, s: number) =>
    3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  return t => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let s = t;
    for (let i = 0; i < 24; i++) {
      const x = bez(x1, x2, s);
      if (Math.abs(x - t) < 1e-5) break;
      if (x < t) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return bez(y1, y2, s);
  };
}

export const inOutEase = cubicBezierEase(JOVIE_O_EASE.inOut);

type MorphToken = '--duration-normal' | '--duration-slow';

/**
 * A duration token's live value. The CSS custom property is the truth (it is
 * 0ms under prefers-reduced-motion); the JS mirror is the fallback for SSR and
 * environments without the stylesheet.
 */
export function tokenMs(token: MorphToken): number {
  const fallback = JOVIE_O_MOTION_TOKENS[token];
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function')
    return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  const m = /^([\d.]+)(ms|s)$/.exec(raw);
  if (!m) return fallback;
  return Number(m[1]) * (m[2] === 's' ? 1000 : 1);
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export interface MorphController {
  /** Jump to a state. Cancels any running morph. */
  snap(state: StrokeState): void;
  /** Morph from the live state. Interrupting a morph continues from where it is. */
  to(target: StrokeState, ms: number, onDone?: () => void): void;
  /** Change the destination of a running morph without restarting it. */
  retarget(target: StrokeState): void;
  cancel(): void;
  running(): boolean;
  current(): StrokeState;
}

interface MorphOptions {
  readonly initial: StrokeState;
  readonly write: (state: StrokeState) => void;
  readonly now?: () => number;
  readonly ease?: (t: number) => number;
}

/**
 * The one requestAnimationFrame loop. It is scheduled only while a morph runs
 * and is never re-armed once the morph lands, so a mark at rest ticks nothing.
 */
export function createMorph({
  initial,
  write,
  now = () => performance.now(),
  ease = inOutEase,
}: MorphOptions): MorphController {
  let live = initial;
  let from = initial;
  let target = initial;
  let startedAt = 0;
  let duration = 0;
  let frame = 0;
  let done: (() => void) | undefined;

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };

  const tick = () => {
    frame = 0;
    const t = duration <= 0 ? 1 : Math.min(1, (now() - startedAt) / duration);
    live = t >= 1 ? target : lerpState(from, target, ease(t));
    write(live);
    if (t < 1) {
      frame = requestAnimationFrame(tick);
      return;
    }
    const cb = done;
    done = undefined;
    cb?.();
  };

  return {
    snap(state) {
      stop();
      done = undefined;
      live = from = target = state;
      write(live);
    },
    to(next, ms, onDone) {
      stop();
      from = live;
      target = next;
      done = onDone;
      if (ms <= 0) {
        live = next;
        write(live);
        done = undefined;
        onDone?.();
        return;
      }
      duration = ms;
      startedAt = now();
      frame = requestAnimationFrame(tick);
    },
    retarget(next) {
      target = next;
    },
    cancel() {
      stop();
      done = undefined;
    },
    running: () => frame !== 0,
    current: () => live,
  };
}
