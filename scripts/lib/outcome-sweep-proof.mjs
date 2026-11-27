// api-budget: github-actions-token 12/hr - up to four exact attempt job reads per existing twenty-minute liveness bucket, sharing the outcome sweep's existing combined five-read limit
// The existing inventory sweep still reads at most five run-list pages.
// Exact attempt job reads use spare budget only on observed failures and
// recovery candidates for an unresolved issue.
import { GITHUB_API } from '../../packages/api-client/github.ts';
import { readGithubJson } from './github-json-read.mjs';
import { workflowOutcomeProof } from './workflow-outcome-proof.mjs';

export const SWEEP_JOBS_LIMIT = 4;
export const RUNNER_HEALTH_RECOVERY_STEP = 'Confirm fresh runner heartbeat';
const PENDING_LIMIT = 24;
const SEEN_LIMIT = 64;
const EVENT = /^[a-z][a-z0-9_]*$/;
const JOB_CONCLUSIONS = new Map([
  ['failure', 'failure'],
  ['timed_out', 'failure'],
  ['startup_failure', 'failure'],
  ['cancelled', 'cancelled'],
  ['skipped', 'skipped'],
  ['neutral', 'skipped'],
  ['success', 'success'],
]);

export function sweepRunIdentity(run) {
  if (
    !/^[1-9][0-9]*$/.test(String(run?.id)) ||
    !Number.isSafeInteger(run?.run_number) ||
    run.run_number < 1 ||
    !Number.isSafeInteger(run?.run_attempt) ||
    run.run_attempt < 1 ||
    !/^[a-f0-9]{40}$/.test(run?.head_sha ?? '')
  ) {
    return null;
  }
  return {
    id: String(run.id),
    number: run.run_number,
    attempt: run.run_attempt,
    sha: run.head_sha,
  };
}

function runKey({ id, attempt, sha }) {
  return `${id}:${attempt}:${sha}`;
}

export function hasSeenSweepRun(record, run) {
  const identity = sweepRunIdentity(run);
  return Boolean(
    identity &&
      Array.isArray(record.seen) &&
      record.seen.includes(runKey(identity))
  );
}

function qualifiedSuccess(file, steps) {
  // The writer is currently disabled. When enabled, a Linear quota defer can
  // complete the job without a lifecycle evaluation, so no green is proven.
  if (file === 'linear-sync-on-merge.yml') return false;
  if (file !== 'runner-health-monitor.yml') return true;
  const markers = Array.isArray(steps)
    ? steps.filter(step => step?.name === RUNNER_HEALTH_RECOVERY_STEP)
    : [];
  return (
    markers.length === 1 &&
    markers[0].status === 'completed' &&
    markers[0].conclusion === 'success'
  );
}

export async function readSweepJobs({
  file,
  repo,
  token,
  identity,
  event,
  fetchImpl,
  nowMs,
}) {
  if (!EVENT.test(event ?? ''))
    return { ok: false, reason: 'attempt_event_missing' };
  const url = `${GITHUB_API}/repos/${repo}/actions/runs/${identity.id}/attempts/${identity.attempt}/jobs?per_page=100&page=1`;
  const read = await readGithubJson(url, {
    fetchImpl,
    token,
    nowMs,
    apiUrl: GITHUB_API,
  });
  if (!read.ok) return { ok: false, reason: read.reason };
  const { jobs, total_count: total } = read.body ?? {};
  if (
    !Array.isArray(jobs) ||
    total !== jobs.length ||
    jobs.length === 0 ||
    jobs.length > 100
  ) {
    return { ok: false, reason: 'attempt_job_inventory_incomplete' };
  }
  const results = new Map();
  for (const job of jobs) {
    const result = JOB_CONCLUSIONS.get(job?.conclusion);
    if (
      !result ||
      typeof job.name !== 'string' ||
      !job.name.trim() ||
      String(job.run_id) !== identity.id ||
      job.head_sha !== identity.sha ||
      (job.run_attempt != null && job.run_attempt !== identity.attempt) ||
      job.status !== 'completed'
    ) {
      return { ok: false, reason: 'attempt_job_identity_mismatch' };
    }
    const id = `job_${Buffer.from(`${event}\0${job.name}`, 'utf8').toString('base64url')}`;
    if (results.has(id))
      return { ok: false, reason: 'duplicate_attempt_job_name' };
    results.set(id, {
      result:
        result === 'success' && !qualifiedSuccess(file, job.steps)
          ? 'skipped'
          : result,
    });
  }
  return { ok: true, results: JSON.stringify(Object.fromEntries(results)) };
}

export function readableSweepProof(proof) {
  return proof?.replace(/^- job_([a-zA-Z0-9_-]+):/gm, (_match, id) => {
    const [event, name] = Buffer.from(id, 'base64url')
      .toString('utf8')
      .split('\0', 2);
    return `- ${String(name ?? event).replace(/[\r\n]/g, ' ')} (${event}):`;
  });
}

/**
 * Add conclusive workflow attempts to bounded persistent job-proof work.
 * A never-observed schedule cannot overwrite a known failed probe.
 */
function validSavedObservation(entry) {
  const id = entry?.identity;
  return (
    (entry?.verdict === 'red' || entry?.verdict === 'green') &&
    EVENT.test(entry.event ?? '') &&
    Boolean(
      id &&
        sweepRunIdentity({
          id: id.id,
          run_number: id.number,
          run_attempt: id.attempt,
          head_sha: id.sha,
        })
    )
  );
}

export function queueSweepObservations(record, observations) {
  const saved = Array.isArray(record.pending) ? record.pending : [];
  const valid = saved.filter(validSavedObservation);
  const pending = new Map(
    valid.slice(-PENDING_LIMIT).map(entry => [runKey(entry.identity), entry])
  );
  const seen = new Set(
    Array.isArray(record.seen)
      ? record.seen.filter(key => typeof key === 'string')
      : []
  );
  let overflow =
    record.overflow === true ||
    valid.length !== saved.length ||
    saved.length > PENDING_LIMIT ||
    (record.pending != null && !Array.isArray(record.pending));
  let hadRed = record.state === 'red';
  for (const { verdict, run } of observations) {
    const identity = sweepRunIdentity(run);
    if (!identity || !EVENT.test(run.event ?? '')) {
      if (verdict === 'red') overflow = true;
      continue;
    }
    const key = runKey(identity);
    if (seen.has(key) || pending.has(key)) continue;
    if (verdict === 'red') hadRed = true;
    if (!hadRed) continue;
    if (pending.size === PENDING_LIMIT) {
      overflow = true;
      continue;
    }
    pending.set(key, {
      verdict,
      identity,
      event: run.event,
      url: run.html_url,
    });
  }
  return {
    ...record,
    pending: [...pending.values()],
    seen: [...seen],
    overflow,
  };
}

export async function advanceSweepProof({
  file,
  record,
  readJobs,
  budget,
  log,
}) {
  const pending = [...(record.pending ?? [])];
  const seen = [...(record.seen ?? [])];
  let proof = record.proof;
  let recovery = record.recovery;
  let holdReason = record.holdReason;
  while (pending.length && budget.remaining > 0) {
    const entry = pending[0];
    budget.remaining -= 1;
    const evidence = await readJobs(entry.identity, entry.event);
    if (!evidence.ok) {
      holdReason = evidence.reason;
      break;
    }
    const next = workflowOutcomeProof({
      cached: proof ? JSON.stringify(proof) : record.legacyRed ? 'red' : '',
      source: file,
      results: evidence.results,
      conclusion: entry.verdict === 'red' ? 'failure' : 'success',
      identity: entry.identity,
    });
    if (next.state) proof = next.state;
    if (next.action === 'red') recovery = undefined;
    if (next.action === 'green' && next.previous === 'red') {
      recovery = { url: entry.url, proof: readableSweepProof(next.proof) };
    }
    holdReason = next.action === 'hold' ? next.reason : undefined;
    seen.push(runKey(pending.shift().identity));
  }
  if (pending.length && !holdReason)
    holdReason = 'attempt_job_read_budget_deferred';
  if (record.overflow) holdReason = 'outcome_scope_history_incomplete';
  if (holdReason)
    log(JSON.stringify({ sweep: file, action: 'hold', reason: holdReason }));
  return {
    ...record,
    pending,
    seen: seen.slice(-SEEN_LIMIT),
    proof,
    recovery,
    holdReason,
  };
}
