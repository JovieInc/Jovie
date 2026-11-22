/**
 * Accent pack contract constants. One place, read by accent-pack-lib.mjs.
 * Contract: .claude/rules/ui.md "Accent pack"; long form
 * docs/design-system/DETAILS.md "Accent color follows the founder rotation rule".
 */

/** Fixed rotation order. Green (mint) and red come last. */
export const ACCENT_ORDER = Object.freeze([
  'ion',
  'ultra',
  'pulse',
  'orange',
  'mint',
  'red',
]);

/**
 * Smallest peer set that may use green (mint) or red as a decorative or series
 * color. Tim, Nov 22 2026: "when you have 6 colors at once showing data and
 * one is green it becomes clear the green is not success. but if there's only
 * one or two or 3 it would look like success." Sets of 5 or fewer rotate only
 * ion, ultra, pulse and orange and wrap back to ion (item 5 is not adjacent to
 * item 1). Real success and error status is exempt.
 */
export const GREEN_RED_MIN_SET = 6;

/** Rotation pool for a peer set of `size` items. */
export const ROTATION_CORE = Object.freeze(['ion', 'ultra', 'pulse', 'orange']);

/** The accent item `index` gets in a set of `size` peers. Mirrors getRotationAccent. */
export function expectedAccent(index, size) {
  const pool = size >= GREEN_RED_MIN_SET ? ACCENT_ORDER : ROTATION_CORE;
  return pool[index % pool.length];
}

/** Roots the sweep covers. */
export const SCAN_ROOTS = Object.freeze([
  'apps/web/app',
  'apps/web/components',
  'apps/web/lib',
  'apps/web/styles',
  'packages/ui',
  'apps/ovie',
]);

/** Directory names the sweep never enters, on top of paths.mjs SKIP_DIRS. */
export const SKIP_PATH =
  /(^|\/)(__tests__|__mocks__|tests?|e2e|fixtures|stories|storybook)\//;

/**
 * Token source files. They define the palette, so off-pack variable and
 * literal rules (a) skip them. Gradient, order and per-item rules still run.
 */
export const TOKEN_SOURCE_FILES = Object.freeze([
  'apps/web/styles/design-system.css',
]);

/**
 * Data-viz paths. A chart legitimately rotates the pack to tell series apart,
 * so rule (d) file-level "two accents in one file" skips these. This is not
 * a blanket exemption: item-level (one element carrying two accents), gradient,
 * order and off-pack rules still apply to them.
 */
export const DATA_VIZ_PATH =
  /(chart|graph|sparkline|heatmap|visuali[sz]ation|analytics\/.*(viz|panel)|donut|pie|legend)/i;

/**
 * Functions that hand out an accent by item position. A file that defines one
 * and can return mint or red must name GREEN_RED_MIN_SET (or `minSet`) so the
 * helper skips green and red below the threshold.
 */
export const ROTATION_HELPER_NAME =
  /^(?:get)?(?:rotation|rotate)\w*accent\w*$|^(?:get)?accent(?:for|by|at)(?:index|position|item)\w*$|^(?:get)?rotation\w*$/i;

/** Names whose arrays or maps are status lookups, not rotations. */
export const STATUS_NAME =
  /status|tone|severity|state|health|priority|variant|level|intent|kind|result|outcome|validation|success|error|danger|toast|alert|badge/i;

/**
 * An element or array item is a status role when it names status props or
 * variants. Detected by identifiers and values, never by path.
 */
export const STATUS_IDENT =
  /status|severity|success|error|valid|danger|destructive|warning|health|passed|failed|failure|variant|tone|intent|toast|alert/i;
export const STATUS_TAG =
  /(Badge|Toast|Alert|Status|Validation|Error|Success|Banner|Callout|Notice|Indicator|Pill|Chip)$/;
export const STATUS_VALUE =
  /^(success|error|destructive|danger|warning|failed|failure|positive|negative|healthy|good|bad|valid|invalid|ok|passed)$/i;

/** Accent hexes beyond the six pack hexes: scene, dark-mode and mark variants. */
export const EXTRA_PACK_HEX = Object.freeze([
  '#3faff3',
  '#a789f0',
  '#eb6ac6',
  '#a982ff',
  '#ff48d2',
  '#ff677d',
  '#0084d1',
  '#00bcff',
]);
