import { JOVIE_O_EASE, skipOneShotMotion } from './jovie-o-motion';

/**
 * Ovie's eyes (JOV-7760). In Ovie the O becomes OV, and the pair reads as
 * the robot dog's eyes. Three behaviours, all rare and all mechanical rather
 * than cartoon: the counters iris shut and open like a lens (blink), shift a
 * few percent toward the cursor (glance), and dilate once when the page wakes
 * (perk). Nothing here runs under reduced motion, while the O is busy, or
 * while the tab is hidden.
 */

export const OVIE_EYES_TIMING = {
  closeMs: 90,
  holdMs: 40,
  openMs: 170,
  /** First blink after this long on the page, then a random gap in range. */
  firstBlinkMs: [5000, 9000],
  blinkGapMs: [11000, 24000],
  /** A page gets this many blinks at most; after that the eyes just watch. */
  maxBlinks: 6,
  glanceMs: 380,
  glanceHoldMs: 1100,
  glanceReturnMs: 620,
  glanceCooldownMs: 2600,
  /** Pointer must be within this many px of the mark to draw a glance. */
  glanceRadiusPx: 520,
  /** At full glance the O turns its seed this far toward the target. */
  glanceTurnDeg: 32,
  /** ...and the v leans this far, % of its width. */
  glanceLeanPct: 3,
  perkMs: 520,
} as const;

const T = OVIE_EYES_TIMING;
const E = JOVIE_O_EASE;

export interface OvieEyesElements {
  readonly root: SVGSVGElement;
  /** The O's counter and the v's notch: the two apertures. */
  readonly irises: readonly SVGGraphicsElement[];
  /** The O (turns so its seed, the glint, faces the target). */
  readonly o: SVGGraphicsElement;
  /** The v (leans toward the target). */
  readonly v: SVGGraphicsElement | null;
}

export function blink(els: OvieEyesElements): Promise<void> {
  if (skipOneShotMotion()) return Promise.resolve();
  const total = T.closeMs + T.holdMs + T.openMs;
  const runs = els.irises.map(el => {
    // The O's counter irises to a point; the v's notch is a lid and drops
    // from its top edge.
    const shut = el.classList.contains('jo-lid') ? '1 0' : '0';
    return el.animate(
      [
        { scale: '1', easing: E.in },
        { scale: shut, offset: T.closeMs / total },
        { scale: shut, offset: (T.closeMs + T.holdMs) / total, easing: E.out },
        { scale: '1' },
      ],
      { duration: total }
    );
  });
  return Promise.all(runs.map(a => a.finished)).then(
    () => undefined,
    () => undefined
  );
}

/**
 * dx, dy in -1..1: where to look, relative to the mark. The geometry never
 * deforms: the O turns so the seed (its glint) swings toward the target and
 * the v leans a hair the same way, like a lens housing tracking.
 */
export function glance(
  els: OvieEyesElements,
  dx: number,
  dy: number
): Promise<void> {
  if (skipOneShotMotion()) return Promise.resolve();
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  // The seed rests at 12; aim it along (dx, dy) but never past a glance.
  const aim = (Math.atan2(clamp(dx), -clamp(dy)) * 180) / Math.PI;
  const deg = Math.max(-T.glanceTurnDeg, Math.min(T.glanceTurnDeg, aim));
  const lean = clamp(dx) * T.glanceLeanPct;
  const total = T.glanceMs + T.glanceHoldMs + T.glanceReturnMs;
  const go = T.glanceMs / total;
  const back = (T.glanceMs + T.glanceHoldMs) / total;
  const runs = [
    els.o.animate(
      [
        { rotate: '0deg', easing: E.out },
        { rotate: `${deg}deg`, offset: go },
        { rotate: `${deg}deg`, offset: back, easing: E.inOut },
        { rotate: '0deg' },
      ],
      { duration: total }
    ),
  ];
  if (els.v) {
    runs.push(
      els.v.animate(
        [
          { translate: '0 0', easing: E.out },
          { translate: `${lean}% 0`, offset: go },
          { translate: `${lean}% 0`, offset: back, easing: E.inOut },
          { translate: '0 0' },
        ],
        { duration: total }
      )
    );
  }
  return Promise.all(runs.map(a => a.finished)).then(
    () => undefined,
    () => undefined
  );
}

/** On wake: the pair lifts a hair and the apertures open wide, once. */
export function perk(els: OvieEyesElements): Promise<void> {
  if (skipOneShotMotion()) return Promise.resolve();
  const runs = [
    els.root.animate(
      [
        { transform: 'translateY(0)' },
        { transform: 'translateY(-6%)', offset: 0.35 },
        { transform: 'translateY(0)' },
      ],
      { duration: T.perkMs, easing: E.out }
    ),
    ...els.irises.map(el =>
      el.animate(
        [{ scale: '1' }, { scale: '1.14', offset: 0.35 }, { scale: '1' }],
        { duration: T.perkMs, easing: E.out }
      )
    ),
  ];
  return Promise.all(runs.map(a => a.finished)).then(
    () => undefined,
    () => undefined
  );
}

const between = ([lo, hi]: readonly number[], rnd: () => number) =>
  lo + (hi - lo) * rnd();

/**
 * Wire the ambient behaviours to a mounted OV. Returns a cleanup function.
 * `isBusy` is read on every tick so a loading O never blinks.
 */
export function attachOvieEyes(
  els: OvieEyesElements,
  isBusy: () => boolean,
  rnd: () => number = Math.random
): () => void {
  if (skipOneShotMotion()) return () => {};
  let blinks = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastGlance = 0;
  let frame = 0;
  let acting = false;

  const act = (run: () => Promise<void>) => {
    if (acting || isBusy() || document.hidden) return;
    acting = true;
    run().finally(() => {
      acting = false;
    });
  };

  const scheduleBlink = (range: readonly number[]) => {
    if (blinks >= T.maxBlinks) return;
    timer = setTimeout(
      () => {
        blinks += 1;
        act(() => blink(els));
        scheduleBlink(T.blinkGapMs);
      },
      between(range, rnd)
    );
  };

  const onPointer = (event: PointerEvent) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const now = performance.now();
      if (now - lastGlance < T.glanceCooldownMs + T.glanceHoldMs) return;
      const box = els.root.getBoundingClientRect();
      const vx = event.clientX - (box.left + box.width / 2);
      const vy = event.clientY - (box.top + box.height / 2);
      const dist = Math.hypot(vx, vy);
      if (dist > T.glanceRadiusPx || dist < box.height) return;
      lastGlance = now;
      act(() => glance(els, vx / dist, vy / dist));
    });
  };

  const onVisible = () => {
    if (!document.hidden) act(() => perk(els));
  };

  scheduleBlink(T.firstBlinkMs);
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', onPointer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
