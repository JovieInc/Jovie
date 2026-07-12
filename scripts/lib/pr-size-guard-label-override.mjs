/**
 * PR Size Guard label override.
 *
 * When big-pr/codemod is applied after pr-size-guard.yml already failed, posts a
 * passing "PR Size Guard" check-run via the Checks API (status override only).
 * See .github/workflows/pr-size-guard-label-override.yml and JOV-3580.
 */

/** Required branch-protection context name — must match pr-size-guard.yml job name. */
export const PR_SIZE_GUARD_CHECK_NAME = 'PR Size Guard';

/** Labels that opt out of the size cap (must match pr-size-guard.yml). */
export const SIZE_GUARD_OPT_OUT_LABELS = Object.freeze(['big-pr', 'codemod']);

/**
 * @param {string} label
 * @returns {boolean}
 */
export function isSizeGuardOptOutLabel(label) {
  return SIZE_GUARD_OPT_OUT_LABELS.includes(String(label));
}

/**
 * @param {{
 *   headSha: string;
 *   label: string;
 *   runUrl: string;
 * }} input
 */
export function buildSizeGuardOverrideCheckRun(input) {
  const headSha = String(input.headSha ?? '').trim();
  const label = String(input.label ?? '').trim();
  const runUrl = String(input.runUrl ?? '').trim();

  if (!headSha) {
    throw new Error('headSha is required');
  }
  if (!isSizeGuardOptOutLabel(label)) {
    throw new Error(`unsupported opt-out label: ${label || '(empty)'}`);
  }

  return {
    name: PR_SIZE_GUARD_CHECK_NAME,
    head_sha: headSha,
    status: 'completed',
    conclusion: 'success',
    details_url: runUrl || undefined,
    output: {
      title: 'Opt-out label applied',
      summary: [
        `Label \`${label}\` opts this PR out of the size cap.`,
        '',
        'Status override only — size was not recomputed on this event.',
        'Prefer adding the label before opening the PR, or push after labeling,',
        'so the primary size-guard run records the bypass directly.',
      ].join('\n'),
    },
  };
}

/** Build a success override only after the label workflow recomputed a policy. */
export function buildValidatedSizeGuardCheckRun(input) {
  const headSha = String(input.headSha ?? '').trim();
  const policy = String(input.policy ?? '').trim();
  const runUrl = String(input.runUrl ?? '').trim();
  if (!headSha) throw new Error('headSha is required');
  if (policy !== 'integration-train') {
    throw new Error(`unsupported validated policy: ${policy || '(empty)'}`);
  }
  return {
    name: PR_SIZE_GUARD_CHECK_NAME,
    head_sha: headSha,
    status: 'completed',
    conclusion: 'success',
    details_url: runUrl || undefined,
    output: {
      title: 'Bounded integration train validated',
      summary:
        'The label-event workflow recomputed changed lines/files and validated the machine-readable component PR source block.',
    },
  };
}
