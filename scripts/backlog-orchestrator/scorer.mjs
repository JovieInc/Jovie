/**
 * Deterministic scoring and ranking for backlog orchestrator.
 *
 * Converts classifications into a sortable score and
 * resolves founder-fast-track and production-red overrides.
 */

export const QUEUE_RANKING_RECEIPT_SCHEMA = 'jovie.queue-ranking/v2';

// JOV-7091: upstream prevention leverage. A bounded machine-enforceable
// prevention change (guardrail/invariant/ratchet) earns queue priority only
// when evidence shows it protects multiple queued issues from a repeated
// defect class. A bare "invariant" label or title is never sufficient.
export const PREVENTION_MIN_AFFECTED = 2;
export const PREVENTION_SCORE_CAP = 25;

const PREVENTION_LABEL_PATTERN =
  /^(?:invariant|guardrail|ratchet|ci-gate|quality-gate|prevention)$/i;
const PREVENTION_TITLE_PATTERN =
  /\b(?:guardrail|invariant|ratchet|regression[- ]gate|prevention)\b/i;
const PREVENTION_AUTHORITY_LABELS = new Set([
  'founder-request',
  'summer-priority',
]);

const PREVENTION_SEVERITY_WEIGHTS = {
  'revenue-protection': 1.5,
  reliability: 1.25,
  paid: 1.1,
  throughput: 1.0,
  retention: 1.0,
  activation: 0.9,
  expansion: 0.9,
  acquisition: 0.75,
  unknown: 0.5,
};

function candidateLabelNames(candidate) {
  const source = candidate?.issue?.labels ?? candidate?.labels;
  const nodes = source?.nodes || source || [];
  return nodes
    .map(label => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean);
}

function defectClassTerms(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 4)
  );
}

/**
 * Assess whether a candidate is an evidence-backed cross-cutting prevention
 * change. Returns a normalized-value receipt or null when the evidence is too
 * weak (no prevention signal, or fewer than PREVENTION_MIN_AFFECTED queued
 * issues sharing the defect class it protects).
 */
export function assessPreventionLeverage(candidate, queue = []) {
  const labels = candidateLabelNames(candidate);
  const signalLabel =
    labels.find(label => PREVENTION_LABEL_PATTERN.test(label)) ?? null;
  const signalTitle = PREVENTION_TITLE_PATTERN.test(candidate?.title || '');
  if (!signalLabel && !signalTitle) return null;

  const area = candidate?.area;
  const related = new Set(
    (candidate?.relatedIssues || []).map(relation => relation.identifier)
  );
  const terms = defectClassTerms(
    `${candidate?.title || ''} ${candidate?.issue?.description || ''}`
  );
  const affected = (queue || []).filter(member => {
    if (!member || member.identifier === candidate.identifier) return false;
    if (related.has(member.identifier)) return true;
    if (area && area !== 'unknown' && member.area === area) return true;
    const memberTerms = defectClassTerms(
      `${member.title || ''} ${member.issue?.description || ''}`
    );
    const shared = [...terms].filter(term => memberTerms.has(term));
    return shared.length >= 2;
  });
  if (affected.length < PREVENTION_MIN_AFFECTED) return null;

  const severityWeight = Math.max(
    PREVENTION_SEVERITY_WEIGHTS[candidate.mrrCategory] ?? 0.5,
    ...affected.map(
      member => PREVENTION_SEVERITY_WEIGHTS[member.mrrCategory] ?? 0.5
    )
  );
  const recurrence = Math.min(1, affected.length / 5);
  const founderEvidence = affected.some(member =>
    candidateLabelNames(member).some(label =>
      PREVENTION_AUTHORITY_LABELS.has(label.toLowerCase())
    )
  );
  const confidence = Math.min(
    1,
    0.35 +
      0.1 * affected.length +
      (signalLabel ? 0.15 : 0) +
      (founderEvidence ? 0.1 : 0)
  );
  const amount =
    Math.round(affected.length * 10 * severityWeight * recurrence * 10) / 10;
  return {
    amount,
    unit: 'normalized-value',
    confidence: Math.round(confidence * 100) / 100,
    sourceRef: `prevention-leverage://${candidate.identifier}`,
    affectedIssues: affected.map(member => member.identifier).sort(),
    reason:
      `${affected.length} queued issue(s) share the protected defect class ` +
      `(severity ${severityWeight}, recurrence ${recurrence})` +
      (signalLabel ? `; label:${signalLabel}` : '; title signal'),
  };
}

/**
 * Bounded score contribution of a prevention assessment. Evidence-gated, so a
 * noisy or mislabeled invariant yields zero adjustment.
 */
export function preventionScoreAdjustment(assessment) {
  if (!assessment) return 0;
  return Math.min(
    PREVENTION_SCORE_CAP,
    Math.round(assessment.amount * assessment.confidence)
  );
}

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

  // JOV-7091: bounded upstream-prevention bonus, derived only from an
  // evidence-backed assessment attached upstream (see assessPreventionLeverage).
  const preventionAdj = preventionScoreAdjustment(classification.prevention);

  const score = Math.max(
    0,
    Math.min(
      100,
      base + confAdj + effortAdj + wsBonus + preventionAdj - relationPenalty
    )
  );

  return {
    score,
    breakdown: {
      base,
      confAdj,
      effortAdj,
      wsBonus,
      relationPenalty,
      preventionAdj,
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
    classification.preventionLeverage ??
    classification.prevention;
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
      reason: supplied.reason ?? null,
      affectedIssues: Array.isArray(supplied.affectedIssues)
        ? [...supplied.affectedIssues].sort()
        : [],
    };
  }
  return {
    amount: null,
    unit: valueUnit,
    confidence: 0,
    sourceRefs: [],
    reason: null,
    affectedIssues: [],
  };
}

function queueEconomicRecord(candidate) {
  // Read the current Linear issue, not a cached classification override.
  // Linear uses 0 for No priority; absent/malformed values get the same last tier.
  const rawPriority = candidate.issue
    ? candidate.issue.priority
    : candidate.priority;
  const priority =
    Number.isInteger(rawPriority) && rawPriority >= 1 && rawPriority <= 4
      ? rawPriority
      : 0;
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
    priority,
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
 * Rank existing eligible admission candidates by explicit Linear priority,
 * then value within each priority tier. This does not confer admission authority.
 * Economic ordering is used only when
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
  const valueRanked = economic
    ? records.toSorted(
        (left, right) =>
          right.expectedNetValue - left.expectedNetValue ||
          left.candidate.identifier.localeCompare(right.candidate.identifier)
      )
    : legacy;
  const priorityRank = record => record.priority || 5;
  // Stable sorting retains the existing economic/score order inside a tier.
  const ranked = valueRanked.toSorted(
    (left, right) => priorityRank(left) - priorityRank(right)
  );
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
  // Order the queue would have had with zero prevention leverage. Compared
  // against the actual winner this explains whether prevention leverage
  // changed the admission order.
  const withoutPreventionByValue = economic
    ? records.toSorted(
        (left, right) =>
          right.expectedValue.amount -
            right.fullyLoadedCost.amount -
            (left.expectedValue.amount - left.fullyLoadedCost.amount) ||
          left.candidate.identifier.localeCompare(right.candidate.identifier)
      )
    : records.toSorted(
        (left, right) =>
          right.candidate.score -
            preventionScoreAdjustment(right.candidate.prevention) -
            (left.candidate.score -
              preventionScoreAdjustment(left.candidate.prevention)) ||
          left.candidate.identifier.localeCompare(right.candidate.identifier)
      );
  const withoutPrevention = withoutPreventionByValue.toSorted(
    (left, right) => priorityRank(left) - priorityRank(right)
  );
  const orderingReasons = [];
  if (selected && valueRanked[0] && selected !== valueRanked[0]) {
    orderingReasons.push('linear-priority');
  }
  if (
    selected &&
    withoutPrevention[0] &&
    selected.candidate.identifier !==
      withoutPrevention[0].candidate.identifier &&
    (selected.preventionLeverage.amount ?? 0) > 0
  ) {
    orderingReasons.push('prevention-leverage');
  }
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
    selectedPriority: selected?.priority ?? null,
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
    orderingReasons,
    confidence,
    missingSourceContracts,
    rankings: ranked.map((record, index) => ({
      rank: index + 1,
      candidate: record.candidate.identifier,
      priority: record.priority,
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
