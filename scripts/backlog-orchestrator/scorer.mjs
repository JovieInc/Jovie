/**
 * Deterministic scoring and ranking for backlog orchestrator.
 *
 * Converts classifications into a sortable score and
 * resolves founder-fast-track and production-red overrides.
 */

/**
 * Score an issue classification deterministically.
 * Returns a numeric score between 0-100 and a breakdown.
 */
export function scoreIssue(classification) {
  const { category, mrrCategory, effort, mrrConfidence, relatedIssues } =
    classification;

  // Base score from category
  let base = 0;

  // Priority categories
  if (
    category === 'duplicate' ||
    category === 'superseded' ||
    category === 'obsolete'
  ) {
    return {
      score: 0,
      breakdown: { reason: 'not actionable', base: 0, adjustments: 0 },
    };
  }

  // MRR value
  const MRR_BASES = {
    'revenue-protection': 95,
    reliability: 75,
    paid: 70,
    activation: 55,
    throughput: 50,
    retention: 45,
    expansion: 40,
    acquisition: 35,
    unknown: 15,
  };
  base = MRR_BASES[mrrCategory] || 15;

  // Confidence adjustment
  const confAdj =
    mrrConfidence === 'high' ? 10 : mrrConfidence === 'medium' ? 3 : -5;

  // Effort penalty (inverted — smaller effort = better for ranking)
  const EFFORT_ADJ = {
    trivial: 10,
    small: 5,
    medium: 0,
    large: -15,
    unknown: -5,
  };
  const effortAdj = EFFORT_ADJ[effort] || -5;

  // Workstream bonus — bundled issues are cheaper to ship
  const wsBonus = classification.workstreamId ? 5 : 0;

  // Penality for many relations (might be messy/duplicate)
  const relationPenalty = Math.min(relatedIssues.length * 2, 10);

  const score = Math.max(
    0,
    Math.min(100, base + confAdj + effortAdj + wsBonus - relationPenalty)
  );

  return {
    score,
    breakdown: {
      base,
      confAdj,
      effortAdj,
      wsBonus,
      relationPenalty,
    },
  };
}

/**
 * Determine if production-red blocks admission.
 * Simple check via the existing health endpoint.
 */
export async function isProductionRed() {
  try {
    const resp = await fetch('https://jov.ie/api/health', {
      signal: AbortSignal.timeout(5000),
    });
    const data = /** @type {any} */ (await resp.json());
    return data.status !== 'ok';
  } catch {
    // Admission is a mutation boundary: unavailable production evidence blocks.
    return true;
  }
}

/**
 * Count active machine-owned shipping leases from the authoritative Linear
 * snapshot. Ordinary In Progress state is not a lease: human-owned,
 * protected, stale, terminal, malformed, and ambiguous evidence all fail
 * closed and contribute zero capacity.
 */
const PROTECTED_LEASE_LABELS = new Set([
  'blocked',
  'codex-blocked',
  'founder-fast-track',
  'human-review-required',
  'incident',
  'needs-human',
  'no-auto',
  'protected',
  'risk:high',
  'tim-approved',
  'tim-owned',
]);
const MACHINE_AGENT_PATTERN =
  /jovie agent|codex issue shipper|machine-agent|machine agent/i;
const TERMINAL_MACHINE_PATTERN =
  /released|stopped|completed|finished|terminal|exited\s+(?:0|without|with)/i;
const LEASE_FIELD_PATTERN =
  /(?:process|pid|workspace|worktree|branch)\s*(?:id|name|path)?\s*[:=]\s*([^\s,;]+)/i;
const MAX_MACHINE_EVIDENCE_AGE_HOURS = 24;

function labelsOf(issue) {
  return (issue?.labels?.nodes || issue?.labels || [])
    .map(label => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean)
    .map(label => label.toLowerCase());
}

function commentsOf(issue) {
  return (issue?.comments?.nodes || issue?.comments || [])
    .filter(comment => comment && typeof (comment.body || comment) === 'string')
    .sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
    );
}

function latestMachineEvidence(issue) {
  return commentsOf(issue).find(comment => {
    const body = typeof comment === 'string' ? comment : comment.body || '';
    const author = `${comment.author?.name || ''} ${comment.author?.email || ''}`;
    return (
      comment.machineAgent === true ||
      comment.source === 'machine-agent' ||
      MACHINE_AGENT_PATTERN.test(`${author} ${body}`)
    );
  });
}

function evidenceBody(evidence) {
  return typeof evidence === 'string'
    ? evidence
    : [evidence?.body, evidence?.event, evidence?.status, evidence?.type]
        .filter(Boolean)
        .join(' ');
}

function isFreshEvidence(evidence, now) {
  const createdAt = new Date(
    typeof evidence === 'string' ? 0 : evidence?.createdAt || 0
  ).getTime();
  const current = new Date(now).getTime();
  return (
    Number.isFinite(createdAt) &&
    Number.isFinite(current) &&
    current >= createdAt &&
    (current - createdAt) / 3_600_000 <= MAX_MACHINE_EVIDENCE_AGE_HOURS
  );
}

/**
 * Return true only when the latest machine evidence explicitly identifies an
 * active lease. Requiring a live process/workspace/branch handle prevents old
 * machine comments from occupying the cap; malformed or ambiguous evidence is
 * deliberately not interpreted optimistically.
 */
export function hasValidActiveMachineLease(
  issue,
  { now = new Date().toISOString() } = {}
) {
  if ((issue?.state?.name || issue?.state) !== 'In Progress') return false;
  if (labelsOf(issue).some(label => PROTECTED_LEASE_LABELS.has(label))) {
    return false;
  }
  const assignee = `${issue?.assignee?.id || ''} ${issue?.assignee?.name || ''} ${issue?.assignee?.email || ''}`;
  if (/tim(?:\s|-|_)*white|itstimwhite|^tim(?:\s|$)/i.test(assignee)) {
    return false;
  }

  const evidence = latestMachineEvidence(issue);
  if (!evidence || !isFreshEvidence(evidence, now)) return false;
  const body = evidenceBody(evidence);
  if (TERMINAL_MACHINE_PATTERN.test(body)) return false;

  // A non-terminal machine comment without all three active handles is
  // ambiguous: do not let it consume or release capacity.
  const handles = [
    ...body.matchAll(new RegExp(LEASE_FIELD_PATTERN.source, 'gi')),
  ].map(match =>
    match[0]
      .split(/\s*[:=]/)[0]
      .toLowerCase()
      .trim()
  );
  const hasProcess = handles.some(handle => /process|pid/.test(handle));
  const hasWorkspace = handles.some(handle =>
    /workspace|worktree/.test(handle)
  );
  const hasBranch = handles.some(handle => /branch/.test(handle));
  return hasProcess && hasWorkspace && hasBranch;
}

export function currentShippingLoad(
  activeIssues = [],
  { now = new Date().toISOString() } = {}
) {
  const count = activeIssues.filter(issue =>
    hasValidActiveMachineLease(issue, { now })
  ).length;
  return { healthy: true, count };
}
