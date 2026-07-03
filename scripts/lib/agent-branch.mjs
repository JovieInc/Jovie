/** Agent-owned branch prefixes — keep in sync with scripts/drain-pr-queue.sh AGENT_RE. */
export const AGENT_BRANCH_RE =
  /^(tim\/|codex\/|agent\/|claude\/|linear\/|feat\/|dependabot\/)/;

/** Graphite merge-queue draft branches — never mutate. */
export const GTMQ_BRANCH_RE = /^gtmq_/;

const JOV_ISSUE_RE = /(^|\/)jov-\d+/i;

export function isAgentBranch(headRefName) {
  const head = String(headRefName ?? '');
  if (!head || GTMQ_BRANCH_RE.test(head)) return false;
  return AGENT_BRANCH_RE.test(head) || JOV_ISSUE_RE.test(head);
}

export function isHardGated(labels = []) {
  const names = labels.map(label =>
    typeof label === 'string' ? label : label?.name
  );
  return names.some(name =>
    ['needs-human-taste', 'needs-human', 'hold', 'gated', 'fast'].includes(name)
  );
}