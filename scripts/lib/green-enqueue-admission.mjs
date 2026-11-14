/**
 * Green-to-enqueue admission facts for the liveness observer
 * (scripts/automation-liveness.mjs). That file's size budget never rises, so
 * the per-head required-green timing read and the queue-removal hold live
 * here, next to the enroll-controller policy they mirror.
 *
 * JOV-8788 (2026-11-14): #25253 sat ready, green and CLEAN for 205 minutes
 * while the enroll controller correctly refused it — its exact head had
 * already been removed from the merge queue REENROLL_MAX_REMOVALS times
 * (bounded re-admission, .github/workflows/merge-queue-green-enroll.yml), so
 * only a new head or a human release re-admits it. The dead-man counted the
 * PR as automation silence and filed a false P0. Such a head is held for its
 * owner, like a defect hold or a label hold, not waiting on the automation.
 */
import { readGithubJson } from './github-json-read.mjs';

/** Merge-queue failure-hold status context on a head (ci-plan). */
export const FAILURE_HOLD_CONTEXT = 'jovie-queue-failure-hold/v1';

/** Failure-hold classes that need a new head from the PR's owner. */
export const DEFECT_HOLD_CLASSES = new Set([
  'deterministic-source',
  'unclassified',
]);

/**
 * Pairs with REENROLL_MAX_REMOVALS in
 * .github/workflows/merge-queue-green-enroll.yml: after this many queue
 * removals on one unchanged head the controller stops re-admitting it
 * automatically. automation-liveness-green-to-enqueue.test.mjs pins the two
 * constants equal so they cannot drift silently.
 */
export const QUEUE_REMOVAL_REENROLL_MAX = 3;

/**
 * When the exact head turned required-green: the latest success among each
 * required name's check runs (completed_at) and commit statuses (created_at).
 * Null when any required name has no success yet.
 *
 * JOV-8788: run 43163802915 reported green-enqueue-checks-unreadable while
 * its own budget sampler showed the shared-github-token REST budget at
 * 0/5000. A denied or exhausted Actions token must not flip the observation
 * unknown, so these reads retry once unauthenticated, like the run-list
 * observers (JOV-11677); a public read that also fails keeps it red.
 */
export async function requiredGreenAt(
  repo,
  sha,
  checks,
  { fetchImpl, token, apiUrl }
) {
  const runs = await readGithubJson(
    `${apiUrl}/repos/${repo}/commits/${sha}/check-runs?filter=latest&per_page=100`,
    { fetchImpl, token }
  );
  const statuses = await readGithubJson(
    `${apiUrl}/repos/${repo}/commits/${sha}/status?per_page=100`,
    { fetchImpl, token }
  );
  if (!runs.ok || !statuses.ok) return { ok: false };
  let greenAt = -Infinity;
  for (const check of checks) {
    const times = [
      ...(runs.body?.check_runs ?? [])
        .filter(run => run?.name === check && run?.conclusion === 'success')
        .map(run => Date.parse(run.completed_at ?? '')),
      ...(statuses.body?.statuses ?? [])
        .filter(row => row?.context === check && row?.state === 'success')
        .map(row => Date.parse(row.created_at ?? '')),
    ].filter(Number.isFinite);
    if (!times.length) return { ok: true, greenAt: null, holdClass: null };
    greenAt = Math.max(greenAt, Math.max(...times));
  }
  // The merge-queue failure hold is a commit status on the head (ci-plan):
  // description `class=<class>;n=..;run=..`. A real-defect hold needs a new
  // head from its owner; it is reported, not counted as promotion latency.
  const hold = (statuses.body?.statuses ?? []).find(
    row => row?.context === FAILURE_HOLD_CONTEXT
  );
  const holdClass =
    /(?:^|;)class=([a-z-]+)/.exec(String(hold?.description ?? ''))?.[1] ?? null;
  return {
    ok: true,
    greenAt: Number.isFinite(greenAt) ? greenAt : null,
    holdClass,
  };
}

/**
 * True when the enroll controller will not re-admit this exact head
 * automatically: the newest post-commit queue removal was by a person (only
 * an explicit release re-admits that head), or the head already spent the
 * bounded re-admission budget. Counts removal events newer than the head
 * commit like the controller's removalsOnHead, so a new head resets the
 * hold. A missing timeline cannot certify a hold, so the PR keeps counting
 * and the dead-man stays sensitive.
 */
export function queueRemovalHold(pr) {
  const committedAt = pr?.commits?.nodes?.[0]?.commit?.committedDate;
  const removals = (pr?.timelineItems?.nodes ?? []).filter(
    node => node?.createdAt && (!committedAt || node.createdAt > committedAt)
  );
  if (removals.length === 0) return false;
  const newest = removals.reduce((a, b) =>
    String(a.createdAt) > String(b.createdAt) ? a : b
  );
  const actor = newest.actor;
  const humanDequeue =
    actor?.__typename === 'User' &&
    !/\[bot\]$/i.test(String(actor?.login ?? ''));
  return humanDequeue || removals.length >= QUEUE_REMOVAL_REENROLL_MAX;
}
