/**
 * Deterministic scoring and ranking for backlog orchestrator.
 *
 * Converts classifications into a sortable score and
 * resolves founder-fast-track and production-red overrides.
 */

export const QUEUE_RANKING_RECEIPT_SCHEMA = 'jovie.queue-ranking/v2';

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

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function confidenceFor(classification) {
  if (classification.mrrConfidence === 'high') return 0.8;
  if (classification.mrrConfidence === 'medium') return 0.55;
  return 0.25;
}

function valueEvidence(classification, fallbackScore) {
  const supplied =
    classification.economic?.expectedValue ?? classification.expectedValue;
  if (
    finiteNonNegative(supplied?.amount) &&
    ['usd', 'normalized-value'].includes(supplied?.unit) &&
    supplied?.sourceRef
  ) {
    return {
      amount: supplied.amount,
      unit: supplied.unit,
      confidence: Math.max(0, Math.min(1, supplied.confidence ?? 0)),
      sourceRefs: [supplied.sourceRef],
    };
  }
  return {
    amount: fallbackScore,
    unit: 'normalized-value',
    confidence: confidenceFor(classification),
    sourceRefs: [`backlog-classification:${classification.identifier}`],
  };
}

function costEvidence(classification) {
  const supplied =
    classification.economic?.fullyLoadedCost ?? classification.fullyLoadedCost;
  const amount = supplied?.expectedTotal?.amount;
  const unit = supplied?.expectedTotal?.unit ?? supplied?.valuationUnit;
  const missing = supplied?.uncertainty?.missingSourceContracts ?? [
    'fully-loaded-cost-receipt',
  ];
  return {
    amount: finiteNonNegative(amount) ? amount : null,
    knownLowerBound: finiteNonNegative(supplied?.knownLowerBound)
      ? supplied.knownLowerBound
      : 0,
    unit: ['usd', 'normalized-value'].includes(unit) ? unit : null,
    confidence: Math.max(
      0,
      Math.min(1, supplied?.uncertainty?.confidence ?? 0)
    ),
    sourceRefs: Array.isArray(supplied?.sourceContracts)
      ? supplied.sourceContracts
      : [],
    missingSourceContracts: [...new Set(missing)].sort(),
  };
}

function preventionEvidence(classification, valueUnit) {
  const supplied =
    classification.economic?.preventionLeverage ??
    classification.preventionLeverage;
  if (
    finiteNonNegative(supplied?.amount) &&
    supplied?.unit === valueUnit &&
    supplied?.sourceRef
  ) {
    return {
      amount: supplied.amount,
      unit: supplied.unit,
      confidence: Math.max(0, Math.min(1, supplied.confidence ?? 0)),
      sourceRefs: [supplied.sourceRef],
    };
  }
  return {
    amount: null,
    unit: valueUnit,
    confidence: 0,
    sourceRefs: [],
  };
}

function queueEconomicRecord(candidate) {
  const expectedValue = valueEvidence(candidate, candidate.score);
  const fullyLoadedCost = costEvidence(candidate);
  const preventionLeverage = preventionEvidence(candidate, expectedValue.unit);
  const comparable =
    fullyLoadedCost.amount !== null &&
    fullyLoadedCost.unit === expectedValue.unit &&
    preventionLeverage.unit === expectedValue.unit &&
    preventionLeverage.amount !== null &&
    fullyLoadedCost.missingSourceContracts.length === 0;
  return {
    candidate,
    expectedValue,
    fullyLoadedCost,
    preventionLeverage,
    comparable,
    expectedNetValue: comparable
      ? expectedValue.amount +
        preventionLeverage.amount -
        fullyLoadedCost.amount
      : null,
  };
}

/**
 * Rank the existing admission candidates. Economic ordering is used only when
 * every candidate has a comparable complete receipt; otherwise the current
 * deterministic score remains the provisional order and the missing contracts
 * are explicit. This avoids turning an unknown cost into a fabricated zero.
 */
export function rankQueueCandidates(
  candidates,
  { selectedAt = new Date().toISOString() } = {}
) {
  const records = candidates.map(queueEconomicRecord);
  const units = [...new Set(records.map(record => record.expectedValue.unit))];
  const economic =
    records.length > 0 &&
    records.every(record => record.comparable) &&
    units.length === 1;
  const legacy = records.toSorted(
    (left, right) =>
      right.candidate.score - left.candidate.score ||
      left.candidate.identifier.localeCompare(right.candidate.identifier)
  );
  const ranked = economic
    ? records.toSorted(
        (left, right) =>
          right.expectedNetValue - left.expectedNetValue ||
          left.candidate.identifier.localeCompare(right.candidate.identifier)
      )
    : legacy;
  const selected = ranked[0] ?? null;
  const displaced = ranked[1] ?? null;
  const missingSourceContracts = [
    ...new Set(
      records.flatMap(record =>
        record.comparable
          ? []
          : record.fullyLoadedCost.missingSourceContracts.map(
              source => `${record.candidate.identifier}:${source}`
            )
      )
    ),
  ].sort();
  const displacedOpportunity = displaced?.comparable
    ? Math.max(0, displaced.expectedNetValue)
    : null;
  const confidence = selected
    ? Math.min(
        selected.expectedValue.confidence,
        selected.fullyLoadedCost.confidence,
        selected.preventionLeverage.confidence
      )
    : 0;
  const receipt = {
    schema: QUEUE_RANKING_RECEIPT_SCHEMA,
    selectedAt,
    mode: economic ? 'fully-loaded-economic' : 'provisional-missing-cost',
    selectedCandidate: selected?.candidate.identifier ?? null,
    displacedCandidate: displaced?.candidate.identifier ?? null,
    estimatedOpportunityCost: {
      amount: displacedOpportunity,
      unit: economic ? units[0] : null,
      sourceRefs: displaced
        ? [
            ...new Set([
              ...displaced.expectedValue.sourceRefs,
              ...displaced.fullyLoadedCost.sourceRefs,
              ...displaced.preventionLeverage.sourceRefs,
            ]),
          ].sort()
        : [],
      confidence: displaced?.comparable
        ? Math.min(
            displaced.expectedValue.confidence,
            displaced.fullyLoadedCost.confidence,
            displaced.preventionLeverage.confidence
          )
        : 0,
    },
    orderingChanged:
      Boolean(selected && legacy[0]) &&
      selected.candidate.identifier !== legacy[0].candidate.identifier,
    confidence,
    missingSourceContracts,
    rankings: ranked.map((record, index) => ({
      rank: index + 1,
      candidate: record.candidate.identifier,
      expectedValue: record.expectedValue,
      fullyLoadedCost: record.fullyLoadedCost,
      preventionLeverage: record.preventionLeverage,
      expectedNetValue: record.expectedNetValue,
    })),
  };
  return {
    ranked: ranked.map(record => record.candidate),
    receipt,
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
// JOV-INV-028: human-review labels do not erase active machine capacity.
const PROTECTED_LEASE_LABELS = new Set([
  'blocked',
  'codex-blocked',
  'incident',
  'protected',
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
