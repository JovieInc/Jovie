/**
 * Profile composition layer — deterministic design-system rules.
 *
 * Codifies GitHub #11899 (the systemic cause behind #8290 hero squish and
 * #8443 card height): profile layout is driven by fixed media shapes, never
 * by content-height constraints.
 *
 * Rules:
 * 1. Hero media has priority — crop (`object-cover`), never squash. The hero
 *    keeps a fixed aspect ratio (16/7 via the `aspect-hero` token) and never
 *    shrinks below {@link PROFILE_HERO_MIN_HEIGHT_PX}.
 * 2. Cards have defined shapes (compact 1:1 / standard 4:5 / wide 16:9),
 *    never arbitrary content-driven rectangles.
 * 3. Card content must fit inside the shape: the media zone is fixed, text
 *    truncates, and the CTA anchors to the bottom edge.
 *
 * Aspect tokens live in `apps/web/app/globals.css` (`--aspect-hero`,
 * `--aspect-card-standard`); the `--cover-height` floor lives in
 * `apps/web/styles/design-system.css`.
 *
 * All classnames below are literal strings so the Tailwind v4 source scan
 * picks them up — never build them dynamically.
 */

/** Hard floor for profile hero media height — the hero never renders shorter. */
export const PROFILE_HERO_MIN_HEIGHT_PX = 240;

/** Tailwind floor class (240px = `min-h-60` on the 4px spacing scale). */
export const PROFILE_HERO_MIN_HEIGHT_CLASSNAME = 'min-h-60';

/**
 * Full hero composition: fixed 16/7 crop + 240px floor. Hero media inside
 * must render with `fill` + `object-cover` so tight viewports crop the image
 * instead of squashing it.
 */
export const PROFILE_HERO_COMPOSITION_CLASSNAME = 'aspect-hero min-h-60 w-full';

/**
 * Deterministic card shapes — the renderer picks one variant; content adapts
 * to the shape, never the reverse.
 */
export type ProfileCardShape = 'compact' | 'standard' | 'wide';

const PROFILE_CARD_SHAPE_CLASSNAMES: Record<ProfileCardShape, string> = {
  /** 1:1 — dense grid tiles. */
  compact: 'aspect-square',
  /** 4:5 — the default portrait media card (`--aspect-card-standard`). */
  standard: 'aspect-card-standard',
  /** 16:9 — banner / landscape cards. */
  wide: 'aspect-video',
};

/** Resolve the fixed aspect-ratio classname for a card shape. */
export function getProfileCardShapeClassName(shape: ProfileCardShape): string {
  return PROFILE_CARD_SHAPE_CLASSNAMES[shape];
}

/**
 * Bottom anchor for card CTA footers: the footer sits outside the clipped
 * text zone and never moves, regardless of title/metadata length.
 */
export const PROFILE_CARD_FOOTER_ANCHOR_CLASSNAME = 'mt-auto shrink-0';
