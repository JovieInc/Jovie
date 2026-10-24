// Deduped Linear intake for post-merge Mutation Diff score-floor breaches
// (JOV-8857). A baselined billing, auth, or Stripe file scoring under its
// floor gets exactly one open issue per file: the canonical
// upsertLinearIssueByTitleFingerprint primitive dedupes by fingerprint and
// updates the same issue on a later red run.

import {
  logRemediationDryRun,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './linear-issue-intake.mjs';

/** Title/search fingerprint prefix; the apps/web-relative file follows ':'. */
export const FINGERPRINT_PREFIX = 'mutation-score-floor';

// Abuse cap: a single red run cannot file more issues than this, however
// many high-risk files breached. Runs normally mutate at most 6 files.
export const MUTATION_FLOOR_ISSUE_CAP = 10;

/** @param {string} file apps/web-relative */
export function mutationFloorFingerprint(file) {
  return `${FINGERPRINT_PREFIX}:${file}`;
}

/**
 * Stable remediation label key per file. Linear label keys accept only
 * lowercase alphanumerics and hyphens, so flatten the path.
 * @param {string} file apps/web-relative
 */
export function mutationFloorLabelKey(file) {
  return `${FINGERPRINT_PREFIX}-${file
    .replace(/[^a-zA-Z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase()}`;
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null} the workflow run URL, or null off CI
 */
export function buildWorkflowRunUrl(env = process.env) {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = env ?? {};
  if (!GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !GITHUB_RUN_ID) return null;
  return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
}

/**
 * @typedef {{ file: string, score: number | null, floor: number,
 *   valid?: number }} FloorFailure
 */

/**
 * Build the upsert payload for one floor breach.
 * @param {FloorFailure} failure
 * @param {{ runUrl?: string | null, artifactName?: string | null }} [context]
 */
export function buildMutationFloorIssue(
  failure,
  { runUrl = null, artifactName = null } = {}
) {
  const fingerprint = mutationFloorFingerprint(failure.file);
  const score = failure.score === null ? 'n/a' : `${failure.score}%`;
  /** @type {string[]} */
  const lines = [
    `Post-merge Mutation Diff scored \`${failure.file}\` at **${score}**, below its recorded floor of **${failure.floor}%**.`,
    '',
    `- File: \`${failure.file}\``,
    `- Measured score: ${score}`,
    `- Floor: ${failure.floor}% (lock-up ratchet; floors may only move up)`,
    `- Valid mutants: ${typeof failure.valid === 'number' ? failure.valid : 'n/a'}`,
    `- Run: ${runUrl ?? 'unknown run (local invocation)'}`,
  ];
  if (artifactName) {
    lines.push(
      `- Report artifact: \`${artifactName}\` (apps/web/reports/mutation/diff/)`
    );
  }
  lines.push(
    '- Baseline: `scripts/mutation-score-baseline.json`',
    '',
    'Killed-mutant coverage on this billing, auth, or Stripe surface dropped under its floor. Add or strengthen tests that kill the surviving mutants, then re-run the Mutation Diff workflow. Do not lower the floor.',
    '',
    'This issue is deduped per file: a later red run updates this issue instead of filing another.'
  );
  return {
    fingerprint,
    title:
      `[${fingerprint}] ${failure.file}: mutation score ${score} is below floor ${failure.floor}%`.slice(
        0,
        240
      ),
    description: lines.join('\n'),
    priority: 2,
  };
}

/**
 * File or update exactly one open Linear issue per floor-breach file.
 * Filing failures are recorded, never thrown: the job's exit code stays
 * driven by the floor failures themselves, and a missing LINEAR_API_KEY
 * (the read-only-token window) degrades to logged no-ops.
 * @param {{
 *   failures: FloorFailure[],
 *   runUrl?: string | null,
 *   artifactName?: string | null,
 *   env?: Record<string, string | undefined>,
 *   apiKey?: string,
 *   fetchImpl?: typeof fetch,
 *   upsertIssue?: typeof upsertLinearIssueByTitleFingerprint,
 * }} input
 */
export async function fileMutationFloorIssues({
  failures,
  runUrl = null,
  artifactName = null,
  env = process.env,
  apiKey,
  fetchImpl,
  upsertIssue = upsertLinearIssueByTitleFingerprint,
}) {
  const noop = { ok: true, filed: [], skipped: [], capped: 0 };
  if (!Array.isArray(failures) || failures.length === 0) return noop;

  if (!remediationTriggersEnabled(env)) {
    const dryRun = logRemediationDryRun({
      action: 'upsert',
      key: 'mutation-floor',
      fingerprint: failures
        .map(failure => mutationFloorFingerprint(failure.file))
        .join(','),
    });
    return { ...noop, dryRun };
  }

  // One issue per file per run, however many breaches arrive for it.
  const deduped = new Map();
  for (const failure of failures) {
    if (!deduped.has(failure.file)) deduped.set(failure.file, failure);
  }
  const unique = [...deduped.values()];
  const withinCap = unique.slice(0, MUTATION_FLOOR_ISSUE_CAP);
  const skipped = unique
    .slice(MUTATION_FLOOR_ISSUE_CAP)
    .map(failure => ({ file: failure.file, reason: 'cap_exceeded' }));

  /** @type {{ file: string, ok: boolean, action?: string, reason?: string,
   *  id?: string | null, identifier?: string | null, url?: string | null,
   *  reopened?: boolean }[]} */
  const filed = [];
  for (const failure of withinCap) {
    const issue = buildMutationFloorIssue(failure, { runUrl, artifactName });
    const result = await upsertIssue({
      fingerprint: issue.fingerprint,
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      reopenTerminal: true,
      labelKey: mutationFloorLabelKey(failure.file),
      ...(apiKey === undefined ? {} : { apiKey }),
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
    });
    filed.push({ file: failure.file, ...result });
  }
  return { ok: true, filed, skipped, capped: skipped.length };
}
