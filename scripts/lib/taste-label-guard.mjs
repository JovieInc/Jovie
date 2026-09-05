/**
 * Taste-label guard.
 *
 * `needs:taste` and `needs-human-taste` are retired pre-landing holds. Taste is
 * steered before a PR opens or certified after landing behind a feature flag.
 * This module remains as a compatibility backstop and removes either label from
 * every PR, regardless of title or `ux:material` metadata.
 *
 * See .claude/rules/release.md and docs/company/autonomous-shipping-doctrine.md.
 */

/** Taste-gate labels (both the GitHub PR form and the Linear form). */
export const TASTE_LABELS = ['needs:taste', 'needs-human-taste'];

/** Signal consumed by the automated classifier; it never preserves a PR hold. */
export const MATERIAL_UX_MARKER = 'ux:material';

/**
 * Conventional-commit types that can NEVER be a taste call on their own.
 * A change of one of these types only gets a taste gate if it ALSO carries the
 * explicit `ux:material` marker.
 */
export const NON_TASTE_COMMIT_TYPES = new Set([
  'chore',
  'deps',
  'build',
  'ci',
  'fix',
  'refactor',
  'test',
  'docs',
  'perf',
  'style',
  'revert',
]);

/**
 * Extract the lowercased conventional-commit type from a PR title.
 * Returns null when the title has no conventional-commit prefix (in which case
 * the guard stays conservative and does not strip the label).
 * @param {string} title
 * @returns {string | null}
 */
export function conventionalCommitType(title) {
  if (typeof title !== 'string') return null;
  const match = title.trim().match(/^([a-z]+)(?:\([^)]*\))?!?:\s/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * @param {readonly string[]} labels
 * @returns {string[]} the taste labels present on the PR (canonical casing)
 */
export function tasteLabelsOn(labels = []) {
  const present = new Set(labels.map(label => String(label).toLowerCase()));
  return TASTE_LABELS.filter(label => present.has(label));
}

/**
 * @param {readonly string[]} labels
 */
export function hasMaterialUxMarker(labels = []) {
  return labels
    .map(label => String(label).toLowerCase())
    .includes(MATERIAL_UX_MARKER);
}

/**
 * Decide whether a retired taste hold is present.
 *
 * @param {{ title?: string, labels?: readonly string[] }} input
 * @returns {{
 *   ok: boolean,
 *   level: 'pass' | 'error',
 *   commitType: string | null,
 *   offendingLabels: string[],
 *   reason: string,
 * }}
 *   `ok: false` (level `error`) means a taste label is mis-applied and should be
 *   removed so the PR can auto-flow.
 */
export function evaluateTasteLabel({ title = '', labels = [] }) {
  const offendingLabels = tasteLabelsOn(labels);
  const commitType = conventionalCommitType(title);

  if (offendingLabels.length === 0) {
    return {
      ok: true,
      level: 'pass',
      commitType,
      offendingLabels: [],
      reason: 'No taste label present.',
    };
  }

  return {
    ok: false,
    level: 'error',
    commitType,
    offendingLabels,
    reason:
      'Pre-landing taste holds are retired. Steer before PR creation or certify the landed feature behind a flag.',
  };
}
