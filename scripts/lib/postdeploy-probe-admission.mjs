// Pure landed-probe admission; transport and side effects belong to the workflow.
import { createHash } from 'node:crypto';
export const PROBE_OUTCOME_SCHEMA = 'jovie.postdeploy-probe-outcomes/v1';
export const PROBE_JOBS = Object.freeze({
  smoke: {
    name: 'Post-Deploy Smoke (Landed Production)',
    steps: ['Verify production endpoints are healthy'],
  },
  auth: {
    name: 'Post-Deploy Auth Smoke (Landed Production)',
    steps: ['Run production auth smoke tests'],
  },
  lighthouse: {
    name: 'Lighthouse CI (Landed Production)',
    steps: [
      'Collect Lighthouse against exact production deployment',
      'Assert Lighthouse production budgets',
      'Validate and upload hash-sealed Lighthouse evidence',
    ],
  },
});
const REPOSITORY = 'JovieInc/Jovie';
const WORKFLOW = '.github/workflows/postdeploy-probes.yml';
const SHA = /^[a-f0-9]{40}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const MAX_PASS_AGE = 12 * 60 * 60 * 1000;
const MAX_ARTIFACTS = 100;
/** @typedef {{sha: string, deploymentId: string, origin: string, policyDigest: string}} ProbeTarget */
/** @typedef {{repository: string, workflowPath: string, workflowSha: string, runId: number, runAttempt: number, mode: 'automatic'|'manual'|'clock', now?: string, target: ProbeTarget}} ProbeContext */
/** @typedef {{runAttempt: number, mode: 'automatic'|'manual', completedAt: string, status: 'pending'|'passed'|'failed'|'incomplete', authActualStatus: string, jobsDigest: string|null}} ProbeAttempt */
/** @typedef {{schema: string, repository: string, workflowPath: string, workflowSha: string, runId: number, target: ProbeTarget, attempts: ProbeAttempt[]}} ProbeLedger */
/** @typedef {ProbeAttempt & {runId: number}} HistoricalAttempt */
/** @param {unknown} value @returns {value is Record<string, unknown>} */
const object = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
/** @param {unknown} value @returns {value is number} */
const positive = value => Number.isSafeInteger(value) && Number(value) > 0;
/** @param {unknown} value */
const timestamp = value =>
  typeof value === 'string' ? Date.parse(value) : Number.NaN;
/** @param {unknown} value */
const hash = value =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** @param {unknown} input @returns {input is ProbeTarget} */
function targetValid(input) {
  return (
    object(input) &&
    typeof input.sha === 'string' &&
    SHA.test(input.sha) &&
    typeof input.deploymentId === 'string' &&
    /^dpl_[A-Za-z0-9]+$/u.test(input.deploymentId) &&
    typeof input.origin === 'string' &&
    /^https:\/\/jovie-[a-z0-9-]+-jovie\.vercel\.app$/u.test(input.origin) &&
    typeof input.policyDigest === 'string' &&
    DIGEST.test(input.policyDigest)
  );
}
/** @param {unknown} input @returns {input is ProbeContext} */
function contextValid(input) {
  return (
    object(input) &&
    input.repository === REPOSITORY &&
    input.workflowPath === WORKFLOW &&
    typeof input.workflowSha === 'string' &&
    SHA.test(input.workflowSha) &&
    positive(input.runId) &&
    positive(input.runAttempt) &&
    targetValid(input.target) &&
    ['automatic', 'manual', 'clock'].includes(String(input.mode)) &&
    (input.now === undefined || Number.isFinite(timestamp(input.now)))
  );
}
/** @param {ProbeTarget} target */
export function probeTargetKey(target) {
  if (!targetValid(target)) throw new Error('Invalid exact landed target');
  return hash([
    REPOSITORY,
    WORKFLOW,
    target.sha,
    target.deploymentId,
    target.origin,
    target.policyDigest,
  ]);
}
/** @param {ProbeTarget} target */
export function admissionArtifactName(target) {
  return `postdeploy-probe-outcomes-${probeTargetKey(target)}`;
}
/** @param {ProbeContext} context @param {unknown} response @returns {Omit<ProbeAttempt, 'runAttempt'|'mode'>|null} */
function jobOutcome(context, response) {
  if (
    !object(response) ||
    !Array.isArray(response.jobs) ||
    !positive(response.total_count) ||
    response.total_count !== response.jobs.length ||
    response.jobs.length > 100 ||
    response.jobs.some(job => !object(job) || !positive(job.id)) ||
    new Set(response.jobs.map(job => job.id)).size !== response.jobs.length
  )
    return null;
  const rows = [];
  let failed = false;
  let allPassed = true;
  let authActualStatus = 'unknown';
  let latest = 0;
  for (const [key, definition] of Object.entries(PROBE_JOBS)) {
    const matches = response.jobs.filter(job => job.name === definition.name);
    if (matches.length !== 1) return null;
    const job = matches[0];
    if (
      job.run_id !== context.runId ||
      job.run_attempt !== context.runAttempt ||
      job.head_sha !== context.workflowSha ||
      job.head_branch !== 'main' ||
      job.status !== 'completed' ||
      !Number.isFinite(timestamp(job.completed_at)) ||
      ![
        'success',
        'failure',
        'cancelled',
        'timed_out',
        'skipped',
        'neutral',
        'action_required',
      ].includes(job.conclusion)
    )
      return null;
    const steps = definition.steps.map(name => {
      const matches = Array.isArray(job.steps)
        ? job.steps.filter(step => object(step) && step.name === name)
        : [];
      if (matches.length > 1) return null;
      const step = matches[0];
      return {
        name,
        status: step?.status ?? 'missing',
        conclusion: step?.conclusion ?? 'missing',
      };
    });
    if (steps.some(step => step === null)) return null;
    const executed = steps.every(
      step => step.status === 'completed' && step.conclusion === 'success'
    );
    if (key === 'auth')
      authActualStatus = executed
        ? 'passed'
        : job.conclusion === 'success'
          ? 'not-configured'
          : 'failed';
    failed ||= [
      'failure',
      'cancelled',
      'timed_out',
      'action_required',
    ].includes(job.conclusion);
    allPassed &&= job.conclusion === 'success' && executed;
    latest = Math.max(latest, timestamp(job.completed_at));
    rows.push({
      id: job.id,
      name: job.name,
      conclusion: job.conclusion,
      completedAt: job.completed_at,
      steps,
    });
  }
  return {
    completedAt: new Date(latest).toISOString(),
    status: failed
      ? 'failed'
      : allPassed && authActualStatus === 'passed'
        ? 'passed'
        : 'incomplete',
    authActualStatus,
    jobsDigest: hash(rows),
  };
}
/** @param {unknown} input @param {ProbeContext} context @returns {input is ProbeLedger} */
function ledgerValid(input, context) {
  if (
    !object(input) ||
    input.schema !== PROBE_OUTCOME_SCHEMA ||
    input.repository !== REPOSITORY ||
    input.workflowPath !== WORKFLOW ||
    typeof input.workflowSha !== 'string' ||
    !SHA.test(input.workflowSha) ||
    !positive(input.runId) ||
    !targetValid(input.target) ||
    probeTargetKey(input.target) !== probeTargetKey(context.target) ||
    !Array.isArray(input.attempts) ||
    input.attempts.length < 1 ||
    input.attempts.length !== 1
  )
    return false;
  const seen = new Set();
  for (const attempt of input.attempts) {
    if (
      !object(attempt) ||
      !positive(attempt.runAttempt) ||
      seen.has(attempt.runAttempt) ||
      !['automatic', 'manual'].includes(String(attempt.mode)) ||
      !Number.isFinite(timestamp(attempt.completedAt)) ||
      !['pending', 'passed', 'failed', 'incomplete'].includes(
        String(attempt.status)
      ) ||
      typeof attempt.authActualStatus !== 'string' ||
      (attempt.status === 'pending'
        ? attempt.jobsDigest !== null
        : typeof attempt.jobsDigest !== 'string' ||
          !DIGEST.test(attempt.jobsDigest))
    )
      return false;
    seen.add(attempt.runAttempt);
  }
  return true;
}
/** @param {ProbeContext} context @param {unknown} input @returns {{entries: HistoricalAttempt[], reason: string|null}} */
function readHistory(context, input) {
  const invalid = reason => ({ entries: [], reason });
  if (
    !object(input) ||
    input.complete !== true ||
    !Array.isArray(input.artifacts) ||
    !Number.isSafeInteger(input.total_count) ||
    input.total_count !== input.artifacts.length ||
    input.artifacts.length > MAX_ARTIFACTS
  )
    return invalid('history-incomplete');
  const entries = [];
  const artifactIds = new Set();
  const attempts = new Set();
  for (const artifact of input.artifacts) {
    if (
      !object(artifact) ||
      !positive(artifact.id) ||
      artifactIds.has(artifact.id) ||
      artifact.expired !== false ||
      !object(artifact.workflow_run) ||
      !positive(artifact.workflow_run.id) ||
      !ledgerValid(artifact.ledger, context) ||
      artifact.ledger.runId !== artifact.workflow_run.id ||
      !Array.isArray(artifact.proofs)
    )
      return invalid('artifact-untrusted');
    artifactIds.add(artifact.id);
    for (const entry of artifact.ledger.attempts) {
      const attemptKey = `${artifact.ledger.runId}:${entry.runAttempt}`;
      const name = admissionArtifactName(context.target);
      if (
        attempts.has(attemptKey) ||
        entry.status !== 'pending' ||
        (artifact.name !== name &&
          artifact.name !== `${name}-attempt-${entry.runAttempt}`)
      )
        return invalid('capsule-mismatch');
      attempts.add(attemptKey);
      if (
        artifact.ledger.runId === context.runId &&
        entry.runAttempt >= context.runAttempt
      )
        return invalid('current-or-future-attempt');
      const proofs = artifact.proofs.filter(
        proof =>
          object(proof) &&
          object(proof.run) &&
          proof.run.run_attempt === entry.runAttempt
      );
      if (proofs.length !== 1) return invalid('attempt-proof-missing');
      const proof = proofs[0];
      const run = proof.run;
      if (
        proof.complete !== true ||
        run.id !== artifact.ledger.runId ||
        run.run_attempt !== entry.runAttempt ||
        run.path !== WORKFLOW ||
        run.head_sha !== artifact.ledger.workflowSha ||
        run.head_branch !== 'main' ||
        !object(run.repository) ||
        run.repository.full_name !== REPOSITORY ||
        !object(run.head_repository) ||
        run.head_repository.full_name !== REPOSITORY ||
        run.event !==
          (entry.mode === 'manual' ? 'workflow_dispatch' : 'workflow_run') ||
        !['completed', 'in_progress'].includes(run.status)
      )
        return invalid('producer-mismatch');
      let observed = entry;
      if (run.status === 'completed') {
        const outcome = jobOutcome(
          {
            ...context,
            runId: run.id,
            runAttempt: entry.runAttempt,
            workflowSha: run.head_sha,
          },
          proof.jobs
        );
        if (!outcome) return invalid('job-proof-unavailable');
        observed = { ...entry, ...outcome };
      }
      if (
        timestamp(observed.completedAt) >
        timestamp(context.now ?? new Date().toISOString())
      )
        return invalid('future-evidence');
      entries.push({ ...observed, runId: artifact.ledger.runId });
    }
  }
  return { entries, reason: null };
}
/** @param {unknown} context @param {unknown} artifact */
export function validateProbeReservation(context, artifact) {
  if (
    !contextValid(context) ||
    !object(artifact) ||
    !ledgerValid(artifact.ledger, context) ||
    artifact.ledger.runId !== context.runId ||
    artifact.ledger.workflowSha !== context.workflowSha ||
    !artifact.ledger.attempts.some(
      entry =>
        entry.runAttempt === context.runAttempt &&
        entry.mode === context.mode &&
        entry.status === 'pending'
    )
  )
    return false;
  // Cross-prove this reservation without treating it as completed probe proof.
  return (
    readHistory(
      { ...context, runAttempt: context.runAttempt + 1 },
      {
        complete: true,
        total_count: 1,
        artifacts: [artifact],
      }
    ).reason === null
  );
}
/** @param {unknown} input @param {unknown} history */
export function evaluateProbeAdmission(input, history) {
  const result = (decision, admitted, reason, failureCount = 0) => ({
    decision,
    admitted,
    reason,
    failureCount,
    quotaDeferred: decision === 'quota-deferred',
    outcomeArtifactName: contextValid(input)
      ? admissionArtifactName(input.target)
      : '',
    targetKey: contextValid(input) ? probeTargetKey(input.target) : '',
    notifyOnFailure:
      admitted &&
      failureCount === 0 &&
      contextValid(input) &&
      input.mode === 'automatic',
  });
  if (!contextValid(input))
    return result('defer-unknown', false, 'context-malformed');
  if (input.mode === 'manual')
    return result('manual-override', true, 'explicit-manual');
  if (input.mode === 'clock')
    return result('clock-bypass', false, 'explicit-certification-only');
  if (object(history) && history.quotaDeferred === true)
    return result('quota-deferred', false, 'github-quota');
  const checked = readHistory(input, history);
  if (checked.reason) return result('defer-unknown', false, checked.reason);
  const entries = checked.entries.sort(
    (a, b) =>
      timestamp(b.completedAt) - timestamp(a.completedAt) ||
      b.runId - a.runId ||
      b.runAttempt - a.runAttempt
  );
  if (entries.length === 0)
    return result('admit-initial', true, 'complete-empty-namespace');
  const latest = entries[0];
  if (latest.status === 'passed') {
    const age =
      timestamp(input.now ?? new Date().toISOString()) -
      timestamp(latest.completedAt);
    return age <= MAX_PASS_AGE
      ? result('reuse-passed', false, 'actual-prior-pass')
      : result('admit-refresh', true, 'pass-older-than-12h');
  }
  let failures = 0;
  for (const entry of entries) {
    if (entry.status === 'passed') break;
    if (entry.status !== 'failed')
      return result('defer-unknown', false, 'unresolved-attempt', failures);
    if (++failures >= 2)
      return result('defer-failures', false, 'retry-budget-spent', failures);
  }
  return result('admit-retry', true, 'one-actual-failure', failures);
}
/** @param {ProbeContext} context @param {ProbeAttempt[]} attempts @returns {ProbeLedger} */
function ledger(context, attempts) {
  if (attempts.length !== 1)
    throw new Error('Attempt evidence limit reached; never truncate');
  return {
    schema: PROBE_OUTCOME_SCHEMA,
    repository: REPOSITORY,
    workflowPath: WORKFLOW,
    workflowSha: context.workflowSha,
    runId: context.runId,
    target: context.target,
    attempts,
  };
}
/** @param {unknown} context */
export function reserveProbeAttempt(context) {
  if (!contextValid(context) || context.mode === 'clock')
    throw new Error('Invalid reservation context');
  return ledger(context, [
    {
      runAttempt: context.runAttempt,
      mode: context.mode,
      completedAt: context.now ?? new Date().toISOString(),
      status: 'pending',
      authActualStatus: 'unknown',
      jobsDigest: null,
    },
  ]);
}
/** Local outcome only; never upload this over an immutable pending capsule.
 * @param {unknown} context @param {unknown} jobs */
export function recordProbeAttempt(context, jobs) {
  if (!contextValid(context) || context.mode === 'clock')
    throw new Error('Invalid outcome context');
  const outcome = jobOutcome(context, jobs);
  if (!outcome) throw new Error('Complete exact-attempt probe jobs required');
  return ledger(context, [
    { runAttempt: context.runAttempt, mode: context.mode, ...outcome },
  ]);
}
