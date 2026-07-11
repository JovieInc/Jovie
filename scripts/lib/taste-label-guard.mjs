/**
 * Taste-label guard.
 *
 * Tim's directive (#product, 2026-06-26): `needs:taste` / `needs-human-taste`
 * is ONLY for a material, subjective UX/visual judgment that only a human can
 * make — a new or changed user-facing experience, a brand/visual-identity call,
 * or a materially different interaction/information design.
 *
 * NOT taste calls (these auto-flow, no human gate): chores, dependency updates,
 * version bumps, bug fixes, restoring a previously-approved design, aligning UX
 * to existing guardrails/tokens, default-yes guardrail work (perf, security,
 * a11y, on-grid, token-correct), and admin/internal tooling.
 *
 * Over-labeling forces a human to review work that should auto-flow — the
 * opposite of the self-healing-company goal (taste gates should shrink, not
 * grow). This module is the in-repo backstop for the labeler that applies the
 * label (`pr_gates.taste_surface`, Hermes lane). It decides, from a PR's
 * conventional-commit type + labels alone, whether a taste label is mis-applied.
 *
 * See .claude/rules/release.md and docs/company/autonomous-shipping-doctrine.md.
 */

/** Taste-gate labels (both the GitHub PR form and the Linear form). */
export const TASTE_LABELS = ['needs:taste', 'needs-human-taste'];

/** Explicit positive signal that a change IS a material UX judgment. */
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
 * Decide whether a PR's taste label is correctly applied.
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

  if (hasMaterialUxMarker(labels)) {
    return {
      ok: true,
      level: 'pass',
      commitType,
      offendingLabels: [],
      reason: `Taste label retained — \`${MATERIAL_UX_MARKER}\` marker present.`,
    };
  }

  if (commitType && NON_TASTE_COMMIT_TYPES.has(commitType)) {
    return {
      ok: false,
      level: 'error',
      commitType,
      offendingLabels,
      reason: `\`${commitType}\` changes are not taste calls — chores, dependency updates, CI/bug fixes, refactors, and guardrail-alignment auto-flow. Add \`${MATERIAL_UX_MARKER}\` if this PR actually makes a material UX change.`,
    };
  }

  return {
    ok: true,
    level: 'pass',
    commitType,
    offendingLabels: [],
    reason: `Taste label retained — "${commitType ?? 'untyped'}" change may carry a material UX judgment.`,
  };
}
