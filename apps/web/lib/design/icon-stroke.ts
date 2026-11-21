/**
 * Optical stroke policy for Lucide UI icons (JOV-14004).
 *
 * Founder lock 2026-11-21: Cursor dark-mode cleanliness at chrome sizes;
 * Linear-like presence as optical size grows. Beat default Lucide 2 / ad-hoc
 * 2.25–2.5 which read too heavy vs Geist/Linear.
 *
 * Stroke values are Lucide `strokeWidth` units on the 24×24 viewBox (not CSS px).
 * Prefer passing `size` that matches the painted optical size so the ladder
 * tracks what the eye sees.
 */

export const ICON_STROKE = {
  /** ≤16px chrome (sidebar, controls) — Cursor-clean */
  chrome: 1.5,
  /** 17–20px mid controls */
  mid: 1.65,
  /** ≥21px feature / large marks — Linear weight at larger scale */
  feature: 1.75,
} as const;

export type IconStrokeToken = keyof typeof ICON_STROKE;

/** Default painted size when callers omit `size` (matches Lucide + sidebar). */
export const ICON_STROKE_DEFAULT_SIZE = 16;

/**
 * Resolve stroke for a painted optical size in CSS pixels.
 * Explicit call-site `strokeWidth` always wins over this helper.
 */
export function iconStrokeForSize(
  sizePx: number | undefined = ICON_STROKE_DEFAULT_SIZE
): number {
  const size =
    typeof sizePx === 'number' && Number.isFinite(sizePx) && sizePx > 0
      ? sizePx
      : ICON_STROKE_DEFAULT_SIZE;

  if (size <= 16) return ICON_STROKE.chrome;
  if (size <= 20) return ICON_STROKE.mid;
  return ICON_STROKE.feature;
}
