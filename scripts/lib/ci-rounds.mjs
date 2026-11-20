/**
 * CI round trips per merged PR and the Source Validation first-push pass rate
 * (JOV-9727). Pure: takes the pull_request workflow runs and merged PRs the
 * shipping SLO collector already fetched, so it adds no API call.
 *
 * A "round" is a distinct PR head sha that Source Validation ran on. The
 * target is <= 1.3 rounds per merged PR; `pnpm preflight:changed` exists to
 * get there by catching repo rules before the first push.
 */
export const SOURCE_VALIDATION_PATH = '.github/workflows/source-validation.yml';
export const ROUNDS_TARGET = 1.3;

const isSourceValidation = run =>
  run.path === SOURCE_VALIDATION_PATH ||
  /source-validation\.yml$/.test(run.workflow ?? '');

function nearestRank(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.max(1, Math.ceil((p / 100) * sorted.length)) - 1];
}

/**
 * @param {object[]} prRuns pull_request workflow runs (head_sha, head_branch,
 *   created_at, run_attempt, conclusion, path)
 * @param {object[]} mergedPrs merged PRs (number, headRefName, mergedAt)
 * @returns {{prs:number, roundsMean:number|null, roundsP95:number|null,
 *   firstPushPassRate:number|null, firstPushSamples:number, target:number}}
 */
export function ciRoundsMetrics(
  prRuns,
  mergedPrs,
  { sinceMs = 0, nowMs = Date.now() } = {}
) {
  const byBranch = new Map();
  for (const run of prRuns) {
    if (!isSourceValidation(run) || !run.head_branch || !run.head_sha) continue;
    const list = byBranch.get(run.head_branch) ?? [];
    list.push(run);
    byBranch.set(run.head_branch, list);
  }
  const rounds = [];
  let firstPass = 0;
  let firstSamples = 0;
  for (const pr of mergedPrs) {
    const merged = Date.parse(pr.mergedAt);
    if (!Number.isFinite(merged) || merged < sinceMs || merged > nowMs)
      continue;
    const runs = byBranch.get(pr.headRefName);
    if (!runs?.length) continue;
    const bySha = new Map();
    for (const run of runs) {
      const rec = bySha.get(run.head_sha) ?? {
        at: Infinity,
        attempt: 0,
        conclusion: null,
      };
      rec.at = Math.min(rec.at, Date.parse(run.created_at) || Infinity);
      // The final attempt decides: a flaky re-run is not a rule the author missed.
      if (
        (run.run_attempt ?? 1) >= rec.attempt &&
        run.status !== 'in_progress'
      ) {
        rec.attempt = run.run_attempt ?? 1;
        rec.conclusion = run.conclusion;
      }
      bySha.set(run.head_sha, rec);
    }
    const shas = [...bySha.values()].sort((a, b) => a.at - b.at);
    rounds.push(shas.length);
    if (shas[0].conclusion) {
      firstSamples += 1;
      if (shas[0].conclusion === 'success') firstPass += 1;
    }
  }
  const sorted = [...rounds].sort((a, b) => a - b);
  return {
    prs: rounds.length,
    roundsMean: rounds.length
      ? rounds.reduce((a, b) => a + b, 0) / rounds.length
      : null,
    roundsP95: nearestRank(sorted, 95),
    firstPushPassRate: firstSamples ? firstPass / firstSamples : null,
    firstPushSamples: firstSamples,
    target: ROUNDS_TARGET,
  };
}

/** Flat keys for the SLO feed (reported, not yet ratcheted). */
export function flattenCiRounds(m) {
  return {
    'ci_rounds.per_merged_pr.mean': m?.roundsMean ?? null,
    'ci_rounds.per_merged_pr.p95': m?.roundsP95 ?? null,
    'source_validation.first_push_pass_rate': m?.firstPushPassRate ?? null,
  };
}
