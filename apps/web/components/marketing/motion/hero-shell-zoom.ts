/**
 * Hero shell zoom-out: scroll-linked, CSS transforms only, zero GL.
 *
 * The pinned hero (100svh) is driven by progress p over scroll 0 to one
 * viewport. The product shell scales from 1.94 down to its rest frame while the
 * claim form stays under the eye; the headline lifts and dims through the move;
 * the logo row enters at the end. The page owns the markup and reads the CSS
 * variables bindHeroShellZoom writes. Reduced motion and no-JS are the rest
 * frame: headline above the full shell, logo row below.
 */
import {
  type BezierCurve,
  CINEMATIC_CURVE,
  motionPresets,
} from '@/lib/motion/presets';

const Z = motionPresets.heroShellZoom;
const REST_SCALE = Z.restFrameWidth / Z.shellWidth;

export interface HeroZoomFrame {
  shellScale: number;
  /** translate() applied before scale(), with transform-origin 0 0. */
  shellTranslate: { x: number; y: number };
  headlineY: number;
  headlineOpacity: number;
  frameEdgeOpacity: number;
  logoRowOpacity: number;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const span = (x: number, a: number, b: number) => clamp((x - a) / (b - a));

/** Parses `cubic-bezier(a, b, c, d)`; null when it is anything else. */
export function parseCubicBezier(value: string): BezierCurve | null {
  const m = /cubic-bezier\(([^)]+)\)/.exec(value);
  const n = m?.[1].split(',').map(Number);
  return n?.length === 4 && n.every(Number.isFinite)
    ? [n[0], n[1], n[2], n[3]]
    : null;
}

/** cubic-bezier(x1,y1,x2,y2) at x, by bisection on the x polynomial. */
export function cubicBezier([x1, y1, x2, y2]: BezierCurve, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  let lo = 0;
  let hi = 1;
  let t = x;
  for (let i = 0; i < 24; i++) {
    const v = ((1 - cx - bx) * t + bx) * t * t + cx * t - x;
    if (Math.abs(v) < 1e-5) break;
    if (v > 0) hi = t;
    else lo = t;
    t = (lo + hi) / 2;
  }
  return ((1 - cy - by) * t + by) * t * t + cy * t;
}

/** Everything the hero shows at scroll progress p (0 to 1). Pure. */
export function heroZoomFrame(
  p: number,
  curve: BezierCurve = CINEMATIC_CURVE
): HeroZoomFrame {
  const z = cubicBezier(curve, span(p, Z.zoomRange[0], Z.zoomRange[1]));
  const s = lerp(Z.scaleFrom, REST_SCALE, z);
  const x = lerp(Z.anchorFrom.x, Z.restFrameX + Z.anchor.x * REST_SCALE, z);
  const y = lerp(Z.anchorFrom.y, Z.restFrameY + Z.anchor.y * REST_SCALE, z);
  const bell = Math.sin(Math.PI * z);
  return {
    shellScale: s,
    shellTranslate: { x: x - Z.anchor.x * s, y: y - Z.anchor.y * s },
    headlineY: lerp(Z.headlineYFrom, Z.headlineYTo, z) - Z.headlineLift * bell,
    headlineOpacity: 1 - Z.headlineDim * bell,
    frameEdgeOpacity: z,
    logoRowOpacity: span(p, Z.logoRowFrom, 1),
  };
}

/** Scroll progress: one viewport of scroll is 0 to 1. */
export function heroZoomProgress(scrollY: number, viewportHeight: number) {
  return viewportHeight > 0 && Number.isFinite(scrollY)
    ? clamp(scrollY / (viewportHeight * Z.scrollRangeSvh))
    : 0;
}

/**
 * Writes the frame as CSS variables on `root` from a passive scroll listener.
 * Returns cleanup. Reduced motion writes the rest frame once and listens to
 * nothing.
 */
export function bindHeroShellZoom(root: HTMLElement): () => void {
  const view = root.ownerDocument.defaultView;
  if (!view) return () => {};
  const curve =
    parseCubicBezier(
      view
        .getComputedStyle(root)
        .getPropertyValue('--ds-motion-cinematic-easing')
    ) ?? CINEMATIC_CURVE;
  const set = (name: string, value: number, unit = '') =>
    root.style.setProperty(`--hero-zoom-${name}`, `${value.toFixed(3)}${unit}`);
  const apply = (p: number) => {
    const f = heroZoomFrame(p, curve);
    set('scale', f.shellScale);
    set('x', f.shellTranslate.x, 'px');
    set('y', f.shellTranslate.y, 'px');
    set('headline-y', f.headlineY, 'px');
    set('headline-o', f.headlineOpacity);
    set('edge-o', f.frameEdgeOpacity);
    set('logos-o', f.logoRowOpacity);
    set('logos-y', (1 - f.logoRowOpacity) * Z.logoRowOffsetPx, 'px');
  };
  if (view.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply(1);
    return () => {};
  }
  const onScroll = () =>
    apply(heroZoomProgress(view.scrollY, view.innerHeight));
  onScroll();
  view.addEventListener('scroll', onScroll, { passive: true });
  return () => view.removeEventListener('scroll', onScroll);
}
