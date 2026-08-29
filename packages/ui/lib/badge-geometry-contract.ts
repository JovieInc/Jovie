/**
 * Canonical Badge geometry. Variant and tone may change color only.
 * Overflow wraps in constrained surfaces instead of clipping or overlapping.
 */
export const BADGE_SHARED_GEOMETRY_CLASS =
  'inline-flex max-w-full min-w-0 items-center justify-center gap-1 rounded-(--system-b-radius-pill) border border-transparent align-middle whitespace-normal break-words text-center font-medium tracking-tight [&>*]:min-w-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)/30 focus-visible:ring-offset-1';

export const BADGE_SIZE_GEOMETRY = {
  sm: 'px-1.5 py-0 text-3xs leading-5',
  md: 'px-2 py-0.5 text-xs leading-5',
  lg: 'px-2.5 py-0.5 text-xs leading-5',
  xl: 'px-3 py-1 text-xs leading-5',
} as const;

export type BadgeSizeGeometry = keyof typeof BADGE_SIZE_GEOMETRY;
