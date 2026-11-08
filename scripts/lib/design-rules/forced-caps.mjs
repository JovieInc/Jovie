/**
 * The one all-caps rule (ASR-022, Tim 2026-11-08: "caps lock should be
 * banned"). UI must not force text into capitals; artist and release names
 * are data and keep their own spelling, so only the styling is banned.
 *
 * One source of truth for three checks:
 * - the component certificate's `forced-caps` criterion (per component),
 * - the shrink-only repo ratchet (apps/web/tests/unit/design-system/
 *   no-uppercase-ratchet.test.ts),
 * - the rendered-page check (expectNoForcedCaps in apps/web/tests/e2e/
 *   helpers/preview-media-quality.ts), through isForcedCapsElement.
 */

/**
 * Any `uppercase` styling token: the Tailwind utility, CSS
 * `text-transform: uppercase` and inline `textTransform: 'uppercase'`.
 * Whole word only, so `normal-case` or `uppercaseLabel` don't count.
 */
export const FORCED_CAPS_PATTERN = /(?<![\w-])uppercase(?![\w-])/g;

/** @param {string} line */
export function isCommentLine(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('*') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*')
  );
}

/** @param {string} line */
export function countForcedCapsInLine(line) {
  if (isCommentLine(line)) return 0;
  return (line.match(FORCED_CAPS_PATTERN) ?? []).length;
}

/**
 * Every line of `source` that forces caps, with its 1-based number and count.
 * @param {string} source
 * @returns {{line: number, count: number}[]}
 */
export function findForcedCaps(source) {
  /** @type {{line: number, count: number}[]} */
  const hits = [];
  source.split('\n').forEach((text, i) => {
    const count = countForcedCapsInLine(text);
    if (count) hits.push({ line: i + 1, count });
  });
  return hits;
}

/** @param {string} source */
export function countForcedCaps(source) {
  return findForcedCaps(source).reduce((n, h) => n + h.count, 0);
}

/**
 * Whether a rendered element shouts: its computed text-transform is
 * uppercase, it is visible, and it has text of its own (not only children).
 * @param {{textTransform?: string, display?: string, visibility?: string, ownText?: string}} el
 */
export function isForcedCapsElement(el) {
  if (el.textTransform !== 'uppercase') return false;
  if (el.display === 'none' || el.visibility === 'hidden') return false;
  return Boolean(el.ownText?.trim());
}
