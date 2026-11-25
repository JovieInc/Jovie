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

/** Fractional / non-formula Tailwind spacing overrides (default theme). */
const TAILWIND_SPACING_OVERRIDES: Readonly<Record<string, number>> = {
  '2.5': 10,
  '3.5': 14,
};

const CLASS_SIZE_RE = /(?:^|\s)(?:!)?(?:size|h|w)-(\d+(?:\.\d+)?)(?=\s|$)/g;

const CLASS_ARBITRARY_SIZE_RE =
  /(?:^|\s)(?:!)?(?:size|h|w)-\[(\d+(?:\.\d+)?)(px|rem)\](?=\s|$)/g;

/** Default Tailwind spacing: N → N×4px (0.25rem). */
function spacingTokenToPx(token: string): number | undefined {
  const override = TAILWIND_SPACING_OVERRIDES[token];
  if (override !== undefined) return override;
  const n = Number(token);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n * 4;
}

function considerMax(current: number | undefined, next: number): number {
  return current === undefined ? next : Math.max(current, next);
}

/**
 * Infer painted optical size from Tailwind `size-*` / `h-*` / `w-*` classes
 * when callers omit the Lucide `size` prop (common Icon pattern).
 * Supports formula spacing (`size-14` → 56), fractions (`h-3.5`), and
 * arbitrary bracket px/rem utilities. Returns the largest match.
 */
export function opticalSizeFromClassName(
  className: string | undefined
): number | undefined {
  if (!className) return undefined;

  let maxPx: number | undefined;

  for (const match of className.matchAll(CLASS_SIZE_RE)) {
    const px = spacingTokenToPx(match[1] ?? '');
    if (px === undefined) continue;
    maxPx = considerMax(maxPx, px);
  }

  for (const match of className.matchAll(CLASS_ARBITRARY_SIZE_RE)) {
    const value = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(value) || value <= 0) continue;
    const px = unit === 'rem' ? value * 16 : value;
    maxPx = considerMax(maxPx, px);
  }

  return maxPx;
}
