// JOV-12617 enrollment hold. Company guards is a required merge-group check,
// but the exact-head failure hold (hold-failed-revision) only hears CI and PR
// Size Guard. A group that failed its size ratchet or guard suite was ejected
// with no hold, so the enroll controller's ejection re-enroll admitted the
// same head again (up to three removals per head) and every entry failed the
// same verdict, rebuilding every group behind it. When an unheld head was
// ejected, the controller reads the ejecting group's Company Guards run. A
// verdict step failing on this head's own tree writes the existing
// deterministic-source hold receipt, so the head stays out until it changes,
// and posts one PR comment per head naming the check. Anything the controller
// cannot prove (runner, network, pin drift, exit 75, cancelled, timed out,
// an unproven group ahead, unreadable evidence) is not deterministic: the
// existing bounded re-enroll keeps running.
import {
  FAILURE_HOLD_CONTEXT,
  parseMergeQueueBranch,
  parseTrustedFailureStatus,
} from '../merge-group-failure-hold.mjs';

export const GUARD_HOLD_WORKFLOW = Object.freeze({
  file: 'company-guards.yml',
  path: '.github/workflows/company-guards.yml',
});
// Steps whose failure is the guard suite's verdict on the checked-out tree.
// Checkout, the pinned-suite fetch, the base fetch and Pin drift (an API read
// that also fails on pin age alone) are infrastructure or time, never a hold.
export const GUARD_VERDICT_STEPS = Object.freeze([
  'Size budgets never rise',
  'Run guards',
]);
export const GUARD_HOLD_MARKER = 'jovie-queue-guard-hold/v1';
export const GUARD_HOLD_REASON = 'deterministic-guard-ejection';
const SHA = /^[0-9a-f]{40}$/;
// A verdict step that only deferred on quota, or a runner that died under it.
const NOT_A_VERDICT =
  /exit code 75\b|github-quota-deferred|runner has received a shutdown signal|lost communication with the server|operation was canceled/i;

const allow = reason => ({ action: 'allow', reason });

/** The later of the head commit and the last removal before `removedAt`. */
export function guardWindowStart({ headCommittedAt, removals, removedAt }) {
  const to = Date.parse(removedAt);
  const times = [headCommittedAt, ...(Array.isArray(removals) ? removals : [])]
    .filter(at => Number.isFinite(Date.parse(at)) && Date.parse(at) < to)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return times.at(-1);
}

/**
 * The latest completed Company Guards merge-group run fronted by this PR in
 * [since, removedAt]. `since` is the later of the head commit and the removal
 * before this one, so a group of an earlier head is never read as this head's.
 */
export function guardRunForRemoval({ runs, prNumber, since, removedAt }) {
  const from = Date.parse(since);
  const to = Date.parse(removedAt);
  if (!Array.isArray(runs) || !Number.isFinite(to)) return null;
  return (
    runs
      .filter(run => {
        const created = Date.parse(run?.created_at);
        return (
          run?.path === GUARD_HOLD_WORKFLOW.path &&
          run.event === 'merge_group' &&
          run.status === 'completed' &&
          parseMergeQueueBranch(run.head_branch)?.prNumber === prNumber &&
          Number.isFinite(created) &&
          (!Number.isFinite(from) || created >= from) &&
          created <= to
        );
      })
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ??
    null
  );
}

/**
 * Is this failed run a guard verdict? Only a `failure` whose failed steps are
 * all verdict steps, with readable annotations that show no quota deferral or
 * runner loss. Every other shape answers not deterministic.
 * @param {{ run: any, jobs?: any[], annotations?: any[] | null }} input
 * @returns {{ deterministic: true, check: string, step: string, jobId: number } | { deterministic: false, reason: string }}
 */
export function guardVerdict({ run, jobs, annotations }) {
  /** @param {string} reason @returns {{ deterministic: false, reason: string }} */
  const no = reason => ({ deterministic: false, reason });
  if (run?.conclusion !== 'failure') return no(`conclusion-${run?.conclusion}`);
  if (!Array.isArray(jobs)) return no('jobs-unavailable');
  const failed = jobs.filter(job => job?.conclusion === 'failure');
  if (failed.length === 0) return no('no-failed-job');
  const steps = failed.map(job => ({
    job,
    steps: (job.steps ?? [])
      .filter(step => step?.conclusion === 'failure')
      .map(step => step.name),
  }));
  if (steps.some(item => item.steps.length === 0)) return no('runner-failure');
  const outside = steps
    .flatMap(item => item.steps)
    .find(step => !GUARD_VERDICT_STEPS.includes(step));
  if (outside) return no(`non-verdict-step:${outside}`);
  if (!Array.isArray(annotations)) return no('annotations-unavailable');
  if (annotations.some(item => NOT_A_VERDICT.test(String(item?.message ?? ''))))
    return no('not-a-verdict');
  return {
    deterministic: true,
    check: steps[0].job.name,
    step: steps[0].steps[0],
    jobId: steps[0].job.id,
  };
}

/** A group based on main, or behind an ahead group whose guards passed. */
export function groupBaseProven({ compareStatus, aheadRuns }) {
  if (compareStatus === 'ahead' || compareStatus === 'identical') return true;
  if (compareStatus !== 'behind' && compareStatus !== 'diverged') return false;
  const ahead = (Array.isArray(aheadRuns) ? aheadRuns : [])
    .filter(run => run?.path === GUARD_HOLD_WORKFLOW.path)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  return ahead?.conclusion === 'success';
}

const markerFor = headSha => `<!-- ${GUARD_HOLD_MARKER} head=${headSha} -->`;

export function guardHoldComment({ check, step, headSha, runUrl }) {
  return [
    `Merge queue hold: \`${check}\` failed at \`${step}\` in this PR's merge group ([run](${runUrl})).`,
    `That is a verdict on head \`${headSha.slice(0, 12)}\`, so the queue will not re-enroll this head. Push a fix and the new head enters the queue on its own.`,
    markerFor(headSha),
  ].join('\n\n');
}

/** One comment per head: a bot comment that already carries this head's marker. */
export function hasGuardHoldComment(comments, headSha) {
  return (Array.isArray(comments) ? comments : []).some(
    comment =>
      comment?.user?.type === 'Bot' &&
      String(comment.body ?? '').includes(markerFor(headSha))
  );
}

export function guardHoldStatus({ repository, run, statuses, headSha }) {
  const failures = (Array.isArray(statuses) ? statuses : [])
    .map(status => parseTrustedFailureStatus(status, repository))
    .filter(Boolean);
  const n = Math.max(0, ...failures.map(item => item.failureNumber)) + 1;
  return {
    sha: headSha,
    context: FAILURE_HOLD_CONTEXT,
    state: 'success',
    description: `class=deterministic-source;n=${n};run=${run.id};try=${run.run_attempt}`,
    target_url: `https://github.com/${repository}/actions/runs/${run.id}`,
  };
}

/**
 * Decide, and persist, the hold for one unheld head that left the queue
 * automatically. Evidence that cannot be read allows. Once the verdict is
 * proven the head is held even if persistence fails; the next sweep retries.
 * The comment is posted before the receipt, so a receipt implies a comment
 * and a sweep that sees the receipt never reaches this function again.
 */
export async function guardEjectionHold(
  { repository, prNumber, headSha, since, removedAt, statuses, persist = true },
  io
) {
  let run;
  let verdict;
  try {
    if (!SHA.test(headSha ?? '')) return allow('guard-head-unknown');
    run = guardRunForRemoval({
      runs: await io.listGuardRuns({
        created: Number.isFinite(Date.parse(since))
          ? `${since}..${removedAt}`
          : `<=${removedAt}`,
      }),
      prNumber,
      since,
      removedAt,
    });
    if (!run) return allow('guard-run-not-found');
    if (run.conclusion !== 'failure') return allow(`guard-${run.conclusion}`);
    const jobs = await io.listJobs(run.id);
    const failedJob = jobs?.find?.(job => job?.conclusion === 'failure');
    const found = guardVerdict({
      run,
      jobs,
      annotations: failedJob ? await io.listAnnotations(failedJob.id) : [],
    });
    if (found.deterministic === false) return allow(`guard-${found.reason}`);
    verdict = found;
    const base = parseMergeQueueBranch(run.head_branch)?.baseSha;
    const compareStatus = base ? await io.compareBase(base) : undefined;
    const aheadRuns =
      compareStatus === 'behind' || compareStatus === 'diverged'
        ? await io.listGuardRuns({ head_sha: base })
        : [];
    if (!groupBaseProven({ compareStatus, aheadRuns }))
      return allow('guard-ahead-unproven');
  } catch (error) {
    return allow(
      `guard-evidence-unavailable:${String(error?.message ?? error).slice(0, 80)}`
    );
  }
  const held = {
    action: 'block',
    reason: GUARD_HOLD_REASON,
    check: verdict.check,
    step: verdict.step,
    runId: run.id,
    commented: false,
    persisted: false,
  };
  if (!persist) return held;
  try {
    if (!hasGuardHoldComment(await io.listComments(), headSha)) {
      await io.createComment(
        guardHoldComment({
          check: verdict.check,
          step: verdict.step,
          headSha,
          runUrl: `https://github.com/${repository}/actions/runs/${run.id}`,
        })
      );
    }
    held.commented = true;
    await io.writeStatus(
      guardHoldStatus({ repository, run, statuses, headSha })
    );
    held.persisted = true;
  } catch (error) {
    held.persistError = String(error?.message ?? error).slice(0, 120);
  }
  return held;
}

/**
 * Run, job and annotation reads need actions: read and checks: read. The Jovie
 * Bot enroll token is minted without either, and asking for an ungranted one
 * fails the mint for every enrollment, so they use the job's GITHUB_TOKEN.
 */
export function guardReader({ github, token }) {
  return token ? new github.constructor({ auth: token }) : github;
}

/** The enroll job's Octokit reads and writes for guardEjectionHold. */
export function octokitGuardIo({
  github,
  reader = github,
  owner,
  repo,
  prNumber,
}) {
  return {
    listGuardRuns: async params =>
      (
        await reader.rest.actions.listWorkflowRuns({
          owner,
          repo,
          workflow_id: GUARD_HOLD_WORKFLOW.file,
          event: 'merge_group',
          per_page: 100,
          ...params,
        })
      ).data.workflow_runs,
    listJobs: async runId =>
      (
        await reader.rest.actions.listJobsForWorkflowRun({
          owner,
          repo,
          run_id: runId,
          filter: 'latest',
          per_page: 100,
        })
      ).data.jobs,
    listAnnotations: async checkRunId =>
      (
        await reader.rest.checks.listAnnotations({
          owner,
          repo,
          check_run_id: checkRunId,
          per_page: 100,
        })
      ).data,
    compareBase: async base =>
      (
        await github.rest.repos.compareCommitsWithBasehead({
          owner,
          repo,
          basehead: `${base}...main`,
          per_page: 1,
        })
      ).data.status,
    listComments: () =>
      github.paginate(github.rest.issues.listComments, {
        owner,
        repo,
        issue_number: prNumber,
        per_page: 100,
      }),
    createComment: body =>
      github.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      }),
    writeStatus: status =>
      github.rest.repos.createCommitStatus({ owner, repo, ...status }),
  };
}
