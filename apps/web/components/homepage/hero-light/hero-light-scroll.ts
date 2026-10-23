/**
 * Scroll progress for the homepage hero canvas.
 *
 * The document scroll position is the only input. Nothing listens for wheel
 * or touch, and nothing calls preventDefault. Browsers with scroll-driven
 * animations own the CSS variable; everyone else gets this passive fallback.
 * Reduced motion stays at progress 0 (the full-bleed still).
 */

/** Same interval as `animation-range: 0px 42svh` in HomepageHeroCanvas.css. */
export const HERO_CANVAS_SCROLL_RANGE = 0.42;

export function heroCanvasScrollRange(viewportHeight: number): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 1;
  return viewportHeight * HERO_CANVAS_SCROLL_RANGE;
}

export function heroCanvasScrollProgress(
  scrollY: number,
  rangePx: number
): number {
  if (!Number.isFinite(scrollY) || scrollY <= 0) return 0;
  if (!Number.isFinite(rangePx) || rangePx <= 0) return 0;
  if (scrollY >= rangePx) return 1;
  return scrollY / rangePx;
}

export function bindHeroCanvasScroll(root: HTMLElement): () => void {
  const view = root.ownerDocument.defaultView;
  if (!view) return () => {};
  if (view.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return () => {};
  }
  const forceFallback = root.dataset.heroCanvasScroll === 'fallback';
  const supportsScrollTimeline =
    view.CSS?.supports?.('animation-timeline: scroll()') ?? false;
  if (supportsScrollTimeline && !forceFallback) return () => {};

  const apply = () => {
    root.style.setProperty(
      '--hero-canvas-progress',
      heroCanvasScrollProgress(
        view.scrollY,
        heroCanvasScrollRange(view.innerHeight)
      ).toString()
    );
  };
  apply();
  view.addEventListener('scroll', apply, { passive: true });
  return () => view.removeEventListener('scroll', apply);
}
