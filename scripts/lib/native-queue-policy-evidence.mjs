import { createHash } from 'node:crypto';

// Explicit stop intent is distinct from stale controller or priority labels.
const STOP_LABELS = new Set(['hold', 'gated', 'incident']);
const MACHINE_LABELS = new Set([
  'queue-deferred',
  'needs-conflict-resolution',
  'fast',
]);

export const SCHEMA = 'jovie-native-queue-eval/v2';
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
  const labels = Array.isArray(pr?.labels) ? pr.labels : [];
  for (const label of labels)
    if (STOP_LABELS.has(label)) reasons.push(`hold:${label}`);
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
    machineLabels: labels.filter(label => MACHINE_LABELS.has(label)),
  };
}
