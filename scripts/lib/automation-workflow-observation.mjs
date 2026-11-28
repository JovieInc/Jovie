// Existing dead-man clock, at most eight exact attempt job lookups on its one
// job-qualified registry entry per check. Keep the existing quota recovery.
import { githubReadFailure, readGithubJson } from './github-json-read.mjs';

const MAX_JOB_RUNS = 8;
const JOB_PAGE = 100;
const workflowStart = run => run?.run_started_at ?? run?.created_at;

/**
 * A completed workflow can be green when the heartbeat never ran, or red
 * after a successful heartbeat because an independent job failed.
 */
export async function observeGithubWorkflowJob(
  receipt,
  { base, branch, fetchImpl, token, apiUrl, nowMs }
) {
  const context = { fetchImpl, token, apiUrl, nowMs };
  const read = await readGithubJson(
    `${base}?status=completed&per_page=${MAX_JOB_RUNS}${branch}`,
    context
  );
  if (!read.ok) return githubReadFailure(read);
  const rows = read.body?.workflow_runs;
  if (!Array.isArray(rows))
    return { ok: false, reason: 'github-runs-unreadable' };
  const runs = rows
    .filter(run => !receipt.events || receipt.events.includes(run?.event))
    .sort((a, b) =>
      String(workflowStart(b) ?? '').localeCompare(
        String(workflowStart(a) ?? '')
      )
    )
    .slice(0, MAX_JOB_RUNS);

  for (const run of runs) {
    if (
      !Number.isSafeInteger(run?.id) ||
      run.id < 1 ||
      !Number.isSafeInteger(run.run_attempt) ||
      run.run_attempt < 1
    ) {
      return { ok: false, reason: 'github-run-attempt-unreadable' };
    }
    const jobs = await readGithubJson(
      `${apiUrl}/repos/${receipt.repo}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=${JOB_PAGE}`,
      context
    );
    if (!jobs.ok) return githubReadFailure(jobs);
    const list = jobs.body?.jobs;
    if (
      !Array.isArray(list) ||
      jobs.body.total_count !== list.length ||
      list.length > JOB_PAGE
    ) {
      return { ok: false, reason: 'github-attempt-jobs-incomplete' };
    }
    const matching = list.filter(job => job?.name === receipt.job);
    if (matching.length !== 1)
      return { ok: false, reason: 'github-heartbeat-job-unreadable' };
    const [job] = matching;
    if (
      !Number.isSafeInteger(job.id) ||
      job.id < 1 ||
      job.run_id !== run.id ||
      job.run_attempt !== run.run_attempt ||
      job.status !== 'completed'
    ) {
      return { ok: false, reason: 'github-heartbeat-job-identity-unreadable' };
    }
    if (job.conclusion === 'skipped') continue;

    const start = Date.parse(job.started_at);
    const end = Date.parse(job.completed_at);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end < start ||
      end > nowMs
    )
      return { ok: false, reason: 'github-heartbeat-job-clock-unreadable' };
    const accepted = (receipt.conclusions ?? ['success']).includes(
      job.conclusion
    );
    return {
      ok: true,
      lastProofAt: accepted ? job.completed_at : null,
      startedAt: job.started_at,
      endedAt: job.completed_at,
      ref: String(run.id),
      outcome: accepted ? 'completed' : 'failed',
      url: job.html_url,
      ...(accepted
        ? {}
        : {
            reason: `heartbeat-job-${job.conclusion ?? 'unknown'}[${run.id}]`,
          }),
    };
  }
  const capped =
    rows.length > MAX_JOB_RUNS ||
    Number(read.body.total_count) > rows.length ||
    (rows.length === MAX_JOB_RUNS && read.body.total_count !== rows.length);
  return {
    ok: !capped,
    lastProofAt: null,
    reason: capped
      ? 'heartbeat-job-search-capped'
      : 'no-heartbeat-job-executed',
  };
}

/**
 * A conclusive success among the latest runs disproves a failure streak.
 * Use execution start as the conservative proof clock. Completion metadata
 * can be updated after the execution, and reading history cannot refresh it.
 * @returns {Promise<{ok: boolean, reason?: string, deferred?: boolean, lastProofAt?: string, quotaEvidence?: object, recoveryEvidence?: object}>}
 */
export async function observeWorkflowFailureStreak(
  receipt,
  { fetchImpl, token, nowMs = Date.now(), apiUrl }
) {
  const streak = receipt.streak ?? 3;
  const branch = receipt.branch
    ? `&branch=${encodeURIComponent(receipt.branch)}`
    : '';
  const url = `${apiUrl}/repos/${receipt.repo}/actions/workflows/${encodeURIComponent(receipt.workflow)}/runs?status=completed&per_page=50${branch}`;
  const read = await readGithubJson(url, { fetchImpl, token, apiUrl, nowMs });
  if (!read.ok) return githubReadFailure(read);
  if (!Array.isArray(read.body?.workflow_runs))
    return { ok: false, reason: 'github-runs-unreadable' };

  const newest = read.body.workflow_runs
    .filter(
      run => run?.conclusion === 'success' || run?.conclusion === 'failure'
    )
    .sort((a, b) =>
      String(workflowStart(b) ?? '').localeCompare(
        String(workflowStart(a) ?? '')
      )
    )
    .slice(0, streak);
  const unreliable = newest.some(run => {
    const started = Date.parse(workflowStart(run));
    const completed = Date.parse(run.updated_at);
    return (
      (run.status && run.status !== 'completed') ||
      !Number.isFinite(started) ||
      !Number.isFinite(completed) ||
      completed < started ||
      completed > nowMs
    );
  });
  if (unreliable)
    return { ok: false, reason: 'github-failure-streak-clock-unreadable' };
  if (newest.some(run => run.conclusion === 'success')) {
    return {
      ok: true,
      lastProofAt: workflowStart(newest[0]),
      reason: 'no-failure-streak',
    };
  }
  if (newest.length === streak) {
    return {
      ok: true,
      lastProofAt: null,
      reason: `${streak}-consecutive-failures[${newest.map(run => run.id).join(',')}]`,
    };
  }
  return {
    ok: true,
    lastProofAt: null,
    reason: 'insufficient-conclusive-failure-streak-history',
  };
}
