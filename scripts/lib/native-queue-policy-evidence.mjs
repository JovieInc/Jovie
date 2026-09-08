import { createHash } from 'node:crypto';
import { HARD_HOLD_LABELS } from '../merge-queue-backend.mjs';

export const SCHEMA = 'jovie-native-queue-eval/v1';
export const digest = value =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const sha = value =>
  typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
export const time = value =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
export const requiredNames = [
  'PR Ready',
  'Migration Guard',
  'Fork PR Gate',
  'PR Size Guard',
];

export function schedulerDeadline(scheduler, policySha) {
  // A diagnostic cohort deadline, not a guaranteed delivery SLA. The native
  // workflow is event-driven. Its policy job and drain budget bound this test;
  // a late API call or replaced pending run still makes the observation fail.
  const read = (receipt, path) => {
    if (
      receipt?.ref !== policySha ||
      receipt?.path !== path ||
      receipt?.encoding !== 'base64'
    )
      return null;
    const bytes = Buffer.from(receipt.content ?? '', 'base64');
    const hash = createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex');
    return hash === receipt.sha ? bytes.toString() : null;
  };
  const workflow = read(
    scheduler?.workflow,
    '.github/workflows/merge-queue-autoenroll.yml'
  );
  const drain = read(scheduler?.drain, 'scripts/drain-pr-queue.sh');
  if (
    !workflow ||
    !drain ||
    !workflow.includes('group: merge-queue-drain-mutex') ||
    !workflow.includes('cancel-in-progress: false') ||
    !workflow.includes('workflow_run:') ||
    /^\s+DRAIN_MAX_SECONDS:/m.test(workflow)
  )
    return null;
  const job = /(?:^|\n)  fleet-policy:([\s\S]*?)(?=\n  [a-z][a-z-]*:|$)/.exec(
    workflow
  )?.[1];
  const minutes = Number(/timeout-minutes: ([1-9][0-9]*)/.exec(job ?? '')?.[1]);
  const seconds = Number(
    /DRAIN_MAX_SECONDS="\$\{DRAIN_MAX_SECONDS:-([1-9][0-9]*)\}"/.exec(
      drain
    )?.[1]
  );
  return minutes > 0 && seconds > 0 ? minutes * 60_000 + seconds * 1000 : null;
}

// Exact context names only. A later pending/failing result supersedes old green.
export function checkFailures(checks, required, revision, before = Infinity) {
  if (!Array.isArray(checks) || !sha(revision)) return ['checks-unavailable'];
  return required.flatMap(requirement => {
    const name = requirement.context;
    const matching = checks.filter(
      c =>
        c.name === name &&
        c.sha === revision &&
        Date.parse(c.startedAt) <= before &&
        (!requirement.integration_id || c.appId === requirement.integration_id)
    );
    matching.sort(
      (a, b) =>
        Date.parse(b.startedAt) - Date.parse(a.startedAt) ||
        Number(b.id) - Number(a.id)
    );
    const c = matching[0];
    return c &&
      c.state === 'success' &&
      time(c.startedAt) &&
      time(c.completedAt) &&
      Date.parse(c.completedAt) <= before
      ? []
      : [`required-check:${name}:${c?.state ?? 'missing'}`];
  });
}

export function disposition(pr, policy) {
  const reasons = [];
  if (!pr || !sha(pr.headRefOid) || !sha(pr.baseRefOid))
    reasons.push('revision-unavailable');
  if (pr?.state !== 'OPEN') reasons.push(`state:${pr?.state ?? 'unknown'}`);
  if (pr?.isDraft !== false) reasons.push('draft-or-unknown');
  if (pr?.baseRefName !== 'main')
    reasons.push(`base:${pr?.baseRefName ?? 'unknown'}`);
  if (pr?.mergeable !== 'MERGEABLE')
    reasons.push(`mergeable:${pr?.mergeable ?? 'unknown'}`);
  if (!Array.isArray(pr?.labels)) reasons.push('labels-unavailable');
  for (const label of pr?.labels ?? [])
    if (HARD_HOLD_LABELS.has(label)) reasons.push(`hold:${label}`);
  if (!Array.isArray(pr?.files)) reasons.push('files-unavailable');
  if (pr?.files?.includes('CHANGELOG.md')) reasons.push('pre-land-changelog');
  if (
    pr?.reviewDecision === 'CHANGES_REQUESTED' ||
    (policy.review.required_approving_review_count > 0 &&
      pr?.reviewDecision !== 'APPROVED')
  )
    reasons.push('required-review');
  reasons.push(...checkFailures(pr?.checks, policy.required, pr?.headRefOid));
  const q = pr?.mergeQueueEntry;
  const admitted =
    pr?.isInMergeQueue === true &&
    typeof q?.id === 'string' &&
    Number.isInteger(q.position) &&
    q.position > 0 &&
    ['QUEUED', 'AWAITING_CHECKS', 'MERGEABLE', 'LOCKED'].includes(q.state);
  return {
    number: pr?.number,
    head: pr?.headRefOid,
    base: pr?.baseRefOid,
    // GitHub may return UNKNOWN mergeability while an entry is building. Keep
    // native membership visible, with unmet evidence separate from eligibility.
    type: admitted ? 'ADMITTED' : reasons.length ? 'INELIGIBLE' : 'ELIGIBLE',
    reasons,
  };
}
