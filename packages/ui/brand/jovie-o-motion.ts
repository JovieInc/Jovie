/**
 * The living O's motion language (JOV-7760).
 *
 * One physical model: the O is a single stroke that starts at the seed and
 * curls round to meet it. Every state is that stroke doing something.
 *
 *   idle      still. The mark at rest is exactly the construction outline.
 *   loading   the stroke unwinds and rewinds while it turns; the seed leads.
 *   thinking  the ring stays whole and the seed orbits once, then rests at 12.
 *   success   the stroke closes and lands with the seed at 12, one settle.
 *   error     the stroke closes, lands, and gives one damped shake.
 *
 * Loops are CSS (they run from server HTML before hydration). One-shots are
 * Web Animations started from the loop's live position, so nothing jumps.
 * Reduced motion: no rotation or travel anywhere; loops become a slow
 * opacity pulse and one-shots resolve instantly.
 */

export const JOVIE_O_STATES = [
  'idle',
  'loading',
  'thinking',
  'success',
  'error',
] as const;

export type JovieOState = (typeof JOVIE_O_STATES)[number];

/** Curves match the design-system motion tokens (design-system.css). */
export const JOVIE_O_EASE = {
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  in: 'cubic-bezier(0.55, 0, 1, 0.45)',
} as const;

export const JOVIE_O_TIMING = {
  /** One turn of the loader. */
  turnMs: 1250,
  /** One unwind + rewind of the tail. */
  windMs: 1700,
  /** Thinking: the seed's orbit including its rest at 12. */
  orbitMs: 2600,
  landMs: 420,
  settleMs: 360,
  shakeMs: 460,
  /** Shortest and longest tail during loading, % of the ring. */
  tailMin: 24,
  tailMax: 76,
} as const;

const T = JOVIE_O_TIMING;
const E = JOVIE_O_EASE;

/**
 * Hoisted once per document (React 19 <style href precedence>). Classes are
 * namespaced `jo-` and keyed off data attributes so the server HTML already
 * animates.
 */
export const JOVIE_O_CSS = `
.jo-turn,.jo-iris,.jo-v{transform-box:fill-box;transform-origin:50% 50%}
.jo-lid{transform-box:fill-box;transform-origin:50% 0}
[data-jo-state=loading] .jo-turn{animation:jo-turn ${T.turnMs}ms linear infinite}
[data-jo-state=loading] .jo-tail{animation:jo-wind ${T.windMs}ms ${E.inOut} infinite}
[data-jo-state=thinking] .jo-turn{animation:jo-orbit ${T.orbitMs}ms infinite}
@keyframes jo-turn{to{transform:rotate(360deg)}}
@keyframes jo-wind{0%,100%{stroke-dasharray:${T.tailMin} 200}50%{stroke-dasharray:${T.tailMax} 200}}
@keyframes jo-orbit{0%{transform:rotate(0);animation-timing-function:${E.inOut}}72%,100%{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){
[data-jo-state] .jo-turn,[data-jo-state] .jo-tail{animation:none!important}
[data-jo-state=loading] .jo-tail{stroke-dasharray:none}
[data-jo-state=loading],[data-jo-state=thinking]{animation:jo-pulse 1600ms ${E.inOut} infinite}
}
@keyframes jo-pulse{50%{opacity:.45}}
`;

/**
 * True when one-shot motion should be skipped: the viewer asked for reduced
 * motion, or the environment has no Web Animations (SSR, old engines, jsdom).
 */
export function skipOneShotMotion(): boolean {
  if (typeof window === 'undefined') return true;
  if (typeof Element === 'undefined' || !('animate' in Element.prototype))
    return true;
  if (!window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Current rotation of an element in degrees, 0..360. */
export function currentRotation(el: Element): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return 0;
  const m = /matrix\(([^)]+)\)/.exec(t);
  if (!m) return 0;
  const [a, b] = m[1].split(',').map(Number);
  const deg = (Math.atan2(b, a) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Current tail length in % of the ring (100 = whole O). */
export function currentTail(el: Element): number {
  const v = getComputedStyle(el).strokeDasharray;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 100;
}

export interface JovieOElements {
  readonly root: SVGSVGElement;
  readonly turn: SVGGElement;
  readonly tail: SVGPathElement;
}

/**
 * success / error one-shots. Call after the element's data-jo-state has
 * changed (CSS loops are already off); `from` carries the loop position the
 * caller sampled before the change.
 */
export function playOutcome(
  els: JovieOElements,
  outcome: 'success' | 'error',
  from: { rotation: number; tail: number }
): Promise<void> {
  if (skipOneShotMotion()) return Promise.resolve();
  let to = Math.ceil(from.rotation / 360) * 360;
  if (to - from.rotation < 90) to += 360;
  const landing =
    from.tail >= 100 && from.rotation % 360 === 0
      ? []
      : [
          els.turn.animate(
            [
              { transform: `rotate(${from.rotation}deg)` },
              { transform: `rotate(${to}deg)` },
            ],
            { duration: T.landMs, easing: E.out }
          ),
          els.tail.animate(
            [
              { strokeDasharray: `${from.tail} 200` },
              { strokeDasharray: '100 200' },
            ],
            { duration: T.landMs, easing: E.out }
          ),
        ];
  const delay = landing.length ? T.landMs * 0.7 : 0;
  const after =
    outcome === 'success'
      ? els.root.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.06)' },
            { transform: 'scale(1)' },
          ],
          { duration: T.settleMs, delay, easing: E.out }
        )
      : els.root.animate(
          [0, -6, 5, -3, 1.5, 0].map(k => ({
            transform: `translateX(${k}%)`,
          })),
          { duration: T.shakeMs, delay, easing: E.out }
        );
  return Promise.all([...landing, after].map(a => a.finished)).then(
    () => undefined,
    () => undefined
  );
}
