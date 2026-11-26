/**
 * DORA keys for the Shipping SLO store (founder ask 2026-11-22). Pure, I/O-free.
 *
 * Input is the Production Controller evidence the stage collector already reads
 * (scripts/lib/stage-collect.mjs → raw.stages.controllers): every non-skipped
 * production-controller.yml run with its jobs
 *   { id, headSha, conclusion, createdAt, url?, jobs: [{ name, conclusion,
 *     startedAt, completedAt }] }
 * plus the merged PRs the report already lists. Job conclusions arrive upper
 * case from GraphQL and lower case from REST; both are accepted.
 *
 * Definitions (all timestamps are job completions or merge times, never estimates):
 *
 *   Production promotion (a deployment): one generation SHA (the run title's
 *   source SHA, as merge-to-live.mjs reads it) whose "Promote to Production"
 *   job succeeded. Reruns and re-triggered runs of the same SHA collapse into
 *   one promotion at the earliest successful promote completion (`liveAt`), so
 *   a rerun never double counts.
 *
 *   Deploy frequency: promotions with liveAt in the window / window days.
 *   A generation whose promote job ran but never succeeded was stopped by a
 *   pre-alias gate and is `blockedGenerations`, not a deployment.
 *
 *   Failed deployment: a promotion with at least one of
 *     (a) rollback: the "Centralized production rollback" job ran (concluded
 *         success or failure) in any run of that SHA;
 *     (b) failed production probe: the latest attempt of "Post-Deploy Smoke
 *         (Production)", "Post-Deploy Auth Smoke (Production)", "Sentry Error
 *         Gate (production)" or the public-profile alias usable-result gate
 *         concluded failure or timed_out. A probe that failed and then passed
 *         on a rerun of the same SHA is a flake (`flakedProbes`), not a failure;
 *     (c) revert: a PR merged on main whose title is a revert (the
 *         isRevertSubject rule) and names the reverted PR as "#N", where the
 *         promotion is the first one that contained #N, did not yet contain the
 *         revert, and the revert merged within FAILURE_WINDOW_MS of liveAt.
 *         "Contained" means the generation head merged at or after the PR (the
 *         same time-ancestry stage-derive and productionLag use); the head's
 *         merge time comes from mergedPrs, falling back to liveAt.
 *   Reverts that name no PR, or name one outside the collected window, are
 *   listed as `unattributedReverts` and never counted.
 *
 *   Change failure rate: failed / promotions, both over liveAt in the window.
 *   Promotions younger than FAILURE_WINDOW_MS are still `provisional` (a
 *   revert can still land) and a later snapshot may raise the rate.
 *
 *   Failed deployment recovery time: failed liveAt → restore, where restore is
 *   the successful rollback's completion when one ran, else the latest of the
 *   per-cause restores: probe failure → liveAt of the next promotion without a
 *   rollback or probe failure; revert → liveAt of the first such promotion that
 *   contains the revert. A failure not yet restored is `open` and excluded.
 *
 * Missing inputs make a metric null with a reason, never zero.
 */

import { computePercentile } from './ci-duration-ratchet.mjs';
import { isRevertSubject } from './main-red-eject.mjs';

export const DAY_MS = 86_400_000;
export const FAILURE_WINDOW_MS = DAY_MS;
const PROMOTE_JOB = /Promote to Production$/;
const ROLLBACK_JOB = /Centralized production rollback$/;
const VERIFIED_JOB = /^Production Verified$/;
export const PRODUCTION_PROBES = Object.freeze([
  /Post-Deploy Smoke \(Production\)$/,
  /Post-Deploy Auth Smoke \(Production\)$/,
  /Sentry Error Gate \(production\)$/,
  /Production public-profile alias usable-result gate$/,
]);
// Checks list at most 80 jobs per run (stage-collect RUN_JOBS); a full list
// may be cut, so the run is reported as possibly incomplete.
const JOB_LIST_CAP = 80;

const ms = at => (at ? Date.parse(at) : Number.NaN);
const lc = value => String(value ?? '').toLowerCase();
const FAILED = new Set(['failure', 'timed_out']);
const RAN = new Set(['success', 'failure', 'timed_out']);

const percentiles = values => ({
  n: values.length,
  p50: values.length ? computePercentile(values, 50) : null,
  p95: values.length ? computePercentile(values, 95) : null,
});

/**
 * The reverted PR a revert title names: inside the quotes of GitHub's
 * `Revert "<title> (#N)"`, else the first "#N" (`revert(main-red): x (#N)`).
 * A title naming only the revert's own number names nothing.
 */
export function revertedPrNumber(title, ownNumber = null) {
  const text = String(title ?? '');
  const quoted = /"([^"]*)"/.exec(text)?.[1];
  const inner = quoted ? /#(\d+)/.exec(quoted)?.[1] : null;
  const first = inner ?? /#(\d+)/.exec(text)?.[1] ?? null;
  const n = first == null ? null : Number(first);
  return n === ownNumber ? null : n;
}

/**
 * One row per promoted generation SHA, newest first. Jobs from every run of
 * that SHA (reruns, re-triggers) are pooled before probes are judged.
 */
function bySha(runs) {
  const out = new Map();
  for (const run of runs ?? []) {
    const sha = run?.headSha ?? null;
    if (!sha) continue;
    const entry = out.get(sha) ?? { sha, runs: [], jobs: [] };
    entry.runs.push(run);
    entry.jobs.push(...(run.jobs ?? []));
    out.set(sha, entry);
  }
  return out.values();
}

/** Attempts of one job that ran, oldest first. */
const attemptsOf = (jobs, re) =>
  jobs
    .filter(j => re.test(j?.name ?? '') && RAN.has(lc(j.conclusion)))
    .sort(
      (a, b) =>
        ms(a.completedAt ?? a.startedAt) - ms(b.completedAt ?? b.startedAt)
    );

export function productionPromotions(runs) {
  const rows = [];
  for (const { sha, runs: shaRuns, jobs } of bySha(runs)) {
    const promotes = jobs
      .filter(
        j =>
          PROMOTE_JOB.test(j?.name ?? '') &&
          lc(j.conclusion) === 'success' &&
          Number.isFinite(ms(j.completedAt))
      )
      .sort((a, b) => ms(a.completedAt) - ms(b.completedAt));
    if (!promotes.length) continue;
    const liveAt = promotes[0].completedAt;
    const rollbacks = jobs.filter(
      j => ROLLBACK_JOB.test(j?.name ?? '') && RAN.has(lc(j.conclusion))
    );
    const rolledBackAt =
      rollbacks
        .filter(j => lc(j.conclusion) === 'success' && j.completedAt)
        .map(j => j.completedAt)
        .sort()[0] ?? null;
    const failedProbes = [];
    const flakedProbes = [];
    for (const probe of PRODUCTION_PROBES) {
      const attempts = attemptsOf(jobs, probe);
      if (!attempts.length) continue;
      const name = attempts.at(-1).name;
      if (FAILED.has(lc(attempts.at(-1).conclusion))) failedProbes.push(name);
      else if (attempts.some(j => FAILED.has(lc(j.conclusion))))
        flakedProbes.push(name);
    }
    // Production Verified also needs Lighthouse; a generation it failed is
    // counted (`unverified`) but is not a change failure on its own, since
    // no remediation is filed for it.
    const verified = attemptsOf(jobs, VERIFIED_JOB).at(-1);
    rows.push({
      sha,
      runIds: shaRuns.map(r => r.id).filter(id => id != null),
      liveAt,
      unverified: Boolean(verified && FAILED.has(lc(verified.conclusion))),
      rollback: rollbacks.length > 0,
      rolledBackAt,
      failedProbes,
      flakedProbes,
      jobListMayBeCut: shaRuns.some(r => (r.jobs ?? []).length >= JOB_LIST_CAP),
    });
  }
  return rows.sort((a, b) => ms(b.liveAt) - ms(a.liveAt));
}

/**
 * Generations whose promote ran and never succeeded: a pre-alias gate (for
 * example the auth/billing journey gate) stopped them, so production kept
 * the previous generation. Not deployments and not change failures; counted
 * so a promote streak that blocks shipping stays visible.
 */
export function blockedPromotions(runs) {
  const rows = [];
  for (const { sha, jobs } of bySha(runs)) {
    const attempts = attemptsOf(jobs, PROMOTE_JOB);
    if (!attempts.length) continue;
    if (attempts.some(j => lc(j.conclusion) === 'success')) continue;
    rows.push({
      sha,
      attempts: attempts.length,
      blockedAt: attempts.at(-1).completedAt ?? null,
    });
  }
  return rows;
}

/** Attribute merged revert PRs to the promotion that first shipped the reverted change. */
export function attributeReverts(promotions, mergedPrs) {
  const prs = mergedPrs ?? [];
  const byNumber = new Map(prs.map(p => [p.number, p]));
  const mergedAtBySha = new Map(
    prs
      .map(p => [p.mergeCommitSha ?? p.mergeCommit?.oid ?? null, p.mergedAt])
      .filter(([sha, at]) => sha && at)
  );
  const headAt = p => ms(mergedAtBySha.get(p.sha) ?? p.liveAt);
  const byLive = [...promotions].sort((a, b) => ms(a.liveAt) - ms(b.liveAt));
  const attributed = [];
  const unattributed = [];
  for (const revert of prs) {
    if (!revert?.mergedAt || !isRevertSubject(revert.title)) continue;
    const number = revertedPrNumber(revert.title, revert.number);
    const target = number != null ? byNumber.get(number) : null;
    if (!target?.mergedAt) {
      unattributed.push({
        number: revert.number,
        reason:
          number == null
            ? 'revert names no PR'
            : `reverted #${number} is outside the collected window`,
      });
      continue;
    }
    const first = byLive.find(p => headAt(p) >= ms(target.mergedAt));
    if (!first) continue; // the reverted change never reached production
    const revertMs = ms(revert.mergedAt);
    if (headAt(first) >= revertMs) continue; // shipped together with its revert
    if (revertMs - ms(first.liveAt) > FAILURE_WINDOW_MS) continue;
    attributed.push({
      sha: first.sha,
      revert: revert.number,
      reverted: number,
      revertMergedAt: revert.mergedAt,
      containsRevert: p => headAt(p) >= revertMs,
    });
  }
  return { attributed, unattributed };
}

/**
 * Deploy frequency, change failure rate and failed deployment recovery over
 * [sinceMs, nowMs]. `inputs` carries collection health so a gap reads as null
 * with a reason instead of a zero.
 */
export function doraMetrics({
  runs,
  mergedPrs,
  sinceMs,
  nowMs,
  controllerSource = null,
  missing = null,
}) {
  const windowDays = (nowMs - sinceMs) / DAY_MS;
  const empty = reason => ({
    windowDays,
    deployFrequency: { perDay: null, promotions: null, reason },
    changeFailureRate: { rate: null, failed: null, promotions: null, reason },
    recovery: { n: 0, p50: null, p95: null, open: null, reason },
    partial: [],
    failures: [],
    unattributedReverts: [],
  });
  if (missing) return empty(missing);
  if (!Array.isArray(runs))
    return empty('production controller runs not collected');
  if (controllerSource && controllerSource.ok === false)
    return empty(
      `production controller collection failed: ${controllerSource.error ?? 'unknown error'}`
    );
  const inWindowRuns = runs.filter(r => {
    const at = ms(r?.createdAt);
    return Number.isFinite(at) && at >= sinceMs - DAY_MS && at <= nowMs;
  });
  if (!inWindowRuns.length)
    return empty('no production controller runs in window');
  const withJobs = inWindowRuns.filter(r => (r.jobs ?? []).length > 0);
  if (!withJobs.length)
    return empty('production controller jobs not collected');

  const all = productionPromotions(runs);
  const inWindow = p => {
    const at = ms(p.liveAt);
    return at >= sinceMs && at <= nowMs;
  };
  const promotions = all.filter(inWindow);
  const blocked = blockedPromotions(runs).filter(b => {
    const t = ms(b.blockedAt);
    return t >= sinceMs && t <= nowMs;
  });
  const partial = [];
  if (withJobs.length < inWindowRuns.length)
    partial.push(
      `${inWindowRuns.length - withJobs.length} controller runs without jobs`
    );
  for (const note of controllerSource?.partial ?? [])
    partial.push(`controller listing: ${note}`);
  const cut = promotions.filter(p => p.jobListMayBeCut).length;
  if (cut) partial.push(`${cut} promotions may have a cut job list`);

  const prsCollected = Array.isArray(mergedPrs) && mergedPrs.length > 0;
  const { attributed, unattributed } = prsCollected
    ? attributeReverts(all, mergedPrs)
    : { attributed: [], unattributed: [] };
  const revertsBySha = new Map();
  for (const a of attributed)
    revertsBySha.set(a.sha, [...(revertsBySha.get(a.sha) ?? []), a]);

  const inRunFailed = p => p.rollback || p.failedProbes.length > 0;
  const isFailed = p => inRunFailed(p) || revertsBySha.has(p.sha);
  const byLive = [...all].sort((a, b) => ms(a.liveAt) - ms(b.liveAt));
  /** @type {(p: any, extra?: (q: any) => boolean) => any} */
  const healthyAfter = (p, extra = () => true) =>
    byLive.find(
      q => ms(q.liveAt) > ms(p.liveAt) && !inRunFailed(q) && extra(q)
    ) ?? null;

  const failures = [];
  const recoveries = [];
  let open = 0;
  for (const p of promotions.filter(isFailed)) {
    const causes = [];
    if (p.rollback) causes.push('rollback');
    if (p.failedProbes.length) causes.push('probe');
    const reverts = revertsBySha.get(p.sha) ?? [];
    if (reverts.length) causes.push('revert');
    let restoredAt = p.rolledBackAt;
    if (!restoredAt) {
      const ends = [];
      if (p.failedProbes.length || p.rollback)
        ends.push(healthyAfter(p)?.liveAt ?? null);
      for (const r of reverts)
        ends.push(healthyAfter(p, r.containsRevert)?.liveAt ?? null);
      restoredAt = ends.includes(null)
        ? null
        : (ends.sort((a, b) => ms(b) - ms(a))[0] ?? null);
    }
    const seconds = restoredAt
      ? (ms(restoredAt) - ms(p.liveAt)) / 1000
      : Number.NaN;
    if (Number.isFinite(seconds) && seconds >= 0) recoveries.push(seconds);
    else open += 1;
    failures.push({
      sha: p.sha.slice(0, 12),
      liveAt: p.liveAt,
      causes,
      failedProbes: p.failedProbes,
      reverts: reverts.map(r => ({ revert: r.revert, reverted: r.reverted })),
      restoredAt,
      recoverySeconds: Number.isFinite(seconds) ? seconds : null,
      runIds: p.runIds,
    });
  }

  const provisional = promotions.filter(
    p => ms(p.liveAt) > nowMs - FAILURE_WINDOW_MS
  ).length;
  const rate = !prsCollected
    ? null
    : promotions.length
      ? failures.length / promotions.length
      : null;
  return {
    windowDays,
    deployFrequency: {
      perDay: promotions.length / windowDays,
      promotions: promotions.length,
      blockedGenerations: blocked.length,
      blockedAttempts: blocked.reduce((sum, b) => sum + b.attempts, 0),
      reason: null,
    },
    changeFailureRate: {
      rate,
      failed: failures.length,
      promotions: promotions.length,
      provisional,
      flakedProbes: promotions.filter(p => p.flakedProbes.length).length,
      unverified: promotions.filter(p => p.unverified).length,
      reason: !prsCollected
        ? 'merged PRs not collected; reverts cannot be attributed'
        : promotions.length
          ? null
          : 'no production promotions in window',
    },
    recovery: {
      ...percentiles(recoveries),
      open,
      reason: failures.length ? null : 'no failed deployments in window',
    },
    partial,
    failures,
    unattributedReverts: unattributed,
  };
}

/** Flat ratchet values (seconds / ratio / per_day); null when not measured. */
export function flattenDora(dora) {
  const num = v => (Number.isFinite(v) ? v : null);
  return {
    'dora.deploy_frequency.per_day': num(dora?.deployFrequency?.perDay),
    'dora.change_failure_rate': num(dora?.changeFailureRate?.rate),
    'dora.failed_deployment_recovery.p95': num(dora?.recovery?.p95),
  };
}

/** `dora` block of shipping-slo-latest.json: the four keys in one place. */
export function doraGistBlock(dora, flat) {
  return {
    windowDays: dora?.windowDays ?? null,
    deploysPerDay: flat['dora.deploy_frequency.per_day'] ?? null,
    promotions: dora?.deployFrequency?.promotions ?? null,
    // Lead time for changes stays the existing merged → Production Verified
    // key so there is one lead-time number, not two.
    leadTimeForChangesP95Seconds:
      flat['production_lag.merged_to_verified.p95'] ?? null,
    changeFailureRate: flat['dora.change_failure_rate'] ?? null,
    failedDeployments: dora?.changeFailureRate?.failed ?? null,
    provisionalPromotions: dora?.changeFailureRate?.provisional ?? null,
    flakedProbePromotions: dora?.changeFailureRate?.flakedProbes ?? null,
    unverifiedPromotions: dora?.changeFailureRate?.unverified ?? null,
    blockedPromotions: dora?.deployFrequency?.blockedGenerations ?? null,
    failedDeploymentRecovery: {
      n: dora?.recovery?.n ?? 0,
      p50Seconds: dora?.recovery?.p50 ?? null,
      p95Seconds: dora?.recovery?.p95 ?? null,
      open: dora?.recovery?.open ?? null,
    },
    reasons: Object.fromEntries(
      [
        ['deployFrequency', dora?.deployFrequency?.reason],
        ['changeFailureRate', dora?.changeFailureRate?.reason],
        ['failedDeploymentRecovery', dora?.recovery?.reason],
      ].filter(([, reason]) => reason)
    ),
    partial: dora?.partial ?? [],
    unattributedReverts: dora?.unattributedReverts ?? [],
  };
}

const LANE_FIELDS = [
  'queued',
  'started',
  'blocked',
  'oldestQueuedH',
  'p50QueuedH',
  'leftQueueSinceLast',
  'finishedSinceLast',
  'hoursSinceLastExit',
];
/**
 * Per-lane flow block from the lanes doctor (scripts/lanes/work_lane.py
 * `view()`: { team: { at, lanes: { lane: measure } } }). Keeps only the
 * numeric measure fields and marks a team stale after `staleAfterMs`.
 *
 * @param {any} view
 * @param {{ nowMs?: number, staleAfterMs?: number }} [opts]
 */
export function lanesFlowBlock(view, { nowMs, staleAfterMs = DAY_MS } = {}) {
  if (!view || typeof view !== 'object' || Array.isArray(view))
    return { teams: {}, reason: 'no lanes doctor snapshot supplied' };
  const teams = {};
  for (const [team, data] of Object.entries(view)) {
    const at = Number.isFinite(Number(data?.at))
      ? new Date(Number(data.at) * 1000).toISOString()
      : (data?.at ?? null);
    const lanes = {};
    for (const [lane, m] of Object.entries(data?.lanes ?? {})) {
      if (!m || typeof m !== 'object') continue;
      lanes[lane] = Object.fromEntries(
        LANE_FIELDS.map(f => [f, Number.isFinite(m[f]) ? m[f] : null])
      );
      lanes[lane].stuck = Boolean(m.stuck);
    }
    teams[team] = {
      at,
      stale: !at || nowMs - Date.parse(at) > staleAfterMs,
      lanes,
    };
  }
  return {
    teams,
    reason: Object.keys(teams).length ? null : 'empty lanes doctor snapshot',
  };
}
