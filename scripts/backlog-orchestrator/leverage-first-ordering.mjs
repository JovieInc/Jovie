/**
 * JOV-7423 leverage-first admission order.
 *
 * Extends the JOV-7091 prevention assessment. A bounded shared guard ships
 * before the duplicate leaf repairs it covers. Urgent, revenue, and red work
 * stay ahead of it. An unbounded or in-progress guard releases one proof leaf
 * and holds the rest.
 */

import {
  assessPreventionLeverage,
  candidateLabelNames,
  LEVERAGE_FIRST_SCHEMA,
  PREVENTION_MIN_AFFECTED,
  preventionScoreAdjustment,
  QUEUE_RANKING_RECEIPT_SCHEMA,
} from './scorer.mjs';

const BOUNDED_EFFORT = new Set(['trivial', 'small', 'medium']);
const MISSION_CRITICAL_LABELS = new Set([
  'incident',
  'production-red',
  'main-red',
  'unblock',
  'sev-1',
  'outage',
]);

function identifierNumber(identifier) {
  const match = /(\d+)$/.exec(identifier || '');
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function recordCreatedAt(record) {
  return (
    record?.candidate?.issue?.createdAt || record?.candidate?.createdAt || ''
  );
}

function isMissionCritical(record) {
  if (!record?.candidate) return false;
  if (record.priority === 1) return true;
  if (record.candidate.mrrCategory === 'revenue-protection') return true;
  return candidateLabelNames(record.candidate).some(label =>
    MISSION_CRITICAL_LABELS.has(String(label).toLowerCase())
  );
}

function byAgeThenNumber(left, right) {
  const created = recordCreatedAt(left).localeCompare(recordCreatedAt(right));
  if (created !== 0) return created;
  return (
    identifierNumber(left.candidate.identifier) -
    identifierNumber(right.candidate.identifier)
  );
}

function guardIdentity(guard) {
  return guard?.candidate?.identifier || guard?.identifier || null;
}

function guardEffort(guard) {
  return guard?.candidate?.effort ?? guard?.effort;
}

function guardAffected(guard) {
  const affected =
    guard?.preventionLeverage?.affectedIssues ||
    guard?.prevention?.affectedIssues ||
    [];
  return Array.isArray(affected) ? affected : [];
}

function placementReason(placement, affectedCount) {
  if (placement === 'guard-before-leaves') {
    return (
      `${affectedCount} queued issues share the protected defect class; ` +
      'ship the bounded shared guard before duplicate leaf repairs'
    );
  }
  if (placement === 'cone-before-guard') {
    return (
      'the guard is unbounded or the active cone is mission-critical; ' +
      'repair the cone first and schedule the guard immediately behind it'
    );
  }
  if (placement === 'proof-while-guard-ships') {
    return (
      'the shared guard is in progress; admit one proof leaf and hold ' +
      'the remaining duplicate leaf repairs'
    );
  }
  return (
    'the shared guard is in progress and a proof leaf is already in flight; ' +
    'hold the remaining duplicate leaf repairs'
  );
}

function buildLeveragePlan(guard, byId, inFlightIds, shipping) {
  const guardId = guardIdentity(guard);
  if (!guardId) return null;
  const affected = [
    ...new Set(guardAffected(guard).filter(id => id && id !== guardId)),
  ];
  const leaves = affected.map(id => byId.get(id)).filter(Boolean);
  const inFlightLeaves = affected.filter(id => inFlightIds.has(id));
  const known = new Set([
    ...leaves.map(leaf => leaf.candidate.identifier),
    ...inFlightLeaves,
  ]);
  if (known.size < PREVENTION_MIN_AFFECTED) return null;

  const bounded = BOUNDED_EFFORT.has(guardEffort(guard));
  const critical = leaves.filter(isMissionCritical);
  const ordinary = leaves
    .filter(leaf => !isMissionCritical(leaf))
    .slice()
    .sort(byAgeThenNumber);
  const proof = ordinary[0] || null;
  const held = ordinary.slice(1);
  let placement;
  if (shipping && inFlightLeaves.length > 0) {
    placement = 'hold-while-guard-ships';
  } else if (shipping) {
    placement = 'proof-while-guard-ships';
  } else if (bounded && critical.length === 0) {
    placement = 'guard-before-leaves';
  } else {
    placement = 'cone-before-guard';
  }
  const heldRecords = placement === 'hold-while-guard-ships' ? ordinary : held;
  const heldLeaves = heldRecords.map(leaf => leaf.candidate.identifier).sort();
  const proofLeaf =
    placement === 'hold-while-guard-ships'
      ? [...inFlightLeaves].sort()[0]
      : critical[0]?.candidate.identifier ||
        proof?.candidate.identifier ||
        null;
  return {
    guard: guard?.candidate ? guard : null,
    cone: critical[0] || null,
    proof,
    held: heldRecords,
    receipt: {
      guard: guardId,
      bounded,
      placement,
      affectedIssues: [...known].sort(),
      proofLeaf,
      heldLeaves,
      duplicationAvoided: heldLeaves.length,
      reason: placementReason(placement, known.size),
    },
  };
}

function reinsertCluster(order, extractedList, sequence) {
  const extracted = new Set(
    extractedList.filter(record => record && order.includes(record))
  );
  if (extracted.size === 0) return order;
  const remaining = order.filter(record => !extracted.has(record));
  const lastExtracted = Math.max(
    ...[...extracted].map(record => order.indexOf(record))
  );
  const wall = order
    .filter(
      (record, index) =>
        index < lastExtracted &&
        isMissionCritical(record) &&
        !extracted.has(record)
    )
    .slice(-1)[0];
  let insertAt = 0;
  if (wall) {
    insertAt = remaining.indexOf(wall) + 1;
  } else {
    const earliest = order.findIndex(record => extracted.has(record));
    const stayed = order
      .slice(0, earliest)
      .filter(record => !extracted.has(record));
    insertAt =
      stayed.length === 0
        ? 0
        : remaining.indexOf(stayed[stayed.length - 1]) + 1;
  }
  const insertion = sequence.filter(record => extracted.has(record));
  const next = remaining.slice();
  next.splice(insertAt, 0, ...insertion);
  return next;
}

function sinkRecords(order, records) {
  const sinking = new Set(records.filter(record => order.includes(record)));
  if (sinking.size === 0) return order;
  return [
    ...order.filter(record => !sinking.has(record)),
    ...order.filter(record => sinking.has(record)),
  ];
}

function placeLeveragePlan(order, plan) {
  if (plan.receipt.placement === 'hold-while-guard-ships') {
    return sinkRecords(order, plan.held);
  }
  const ordinary = [plan.proof, ...plan.held].filter(Boolean);
  const coneLead = plan.cone || plan.proof;
  const proofAfterCone =
    plan.cone && plan.proof && plan.proof !== plan.cone ? [plan.proof] : [];
  const sequence =
    plan.receipt.placement === 'guard-before-leaves'
      ? [plan.guard, ...ordinary]
      : plan.receipt.placement === 'proof-while-guard-ships'
        ? ordinary
        : [coneLead, plan.guard, ...proofAfterCone, ...plan.held].filter(
            Boolean
          );
  const extracted = sequence.filter(
    record => record && !isMissionCritical(record)
  );
  return sinkRecords(reinsertCluster(order, extracted, sequence), plan.held);
}

/**
 * JOV-7423 leverage-first dispatch order.
 *
 * Extends the JOV-7091 prevention assessment. It does not invent a second
 * score. Bounded shared guards move ahead of the leaf repairs they cover.
 * Urgent, revenue, and red-label work stay where they are. Unbounded guards
 * and in-progress guards release one proof leaf and hold the rest.
 */
export function orderLeverageFirst(records, options = {}) {
  const inFlightIds = new Set(options.inFlightIdentifiers || []);
  const byId = new Map(
    records.map(record => [record.candidate.identifier, record])
  );
  const plans = [];
  for (const guard of records) {
    const plan = buildLeveragePlan(guard, byId, inFlightIds, false);
    if (plan) plans.push(plan);
  }
  for (const guard of options.shippingGuards || []) {
    if (byId.has(guardIdentity(guard))) continue;
    const plan = buildLeveragePlan(guard, byId, inFlightIds, true);
    if (plan) plans.push(plan);
  }
  plans.sort(
    (left, right) =>
      right.receipt.affectedIssues.length -
        left.receipt.affectedIssues.length ||
      left.receipt.guard.localeCompare(right.receipt.guard)
  );
  let order = records.slice();
  for (const plan of plans) order = placeLeveragePlan(order, plan);
  const clusters = plans.map(plan => plan.receipt);
  return {
    order,
    receipt: {
      schema: LEVERAGE_FIRST_SCHEMA,
      issue: 'JOV-7423',
      clusters,
      duplicationAvoided: clusters.reduce(
        (sum, cluster) => sum + cluster.duplicationAvoided,
        0
      ),
    },
  };
}

/**
 * Deliberate-red check for the JOV-7423 failure class: a duplicate leaf repair
 * (or the cone's proof) ordered ahead of the shared guard that covers it.
 */
export function leverageFirstViolations(orderedIdentifiers, clusters) {
  const index = new Map(
    (orderedIdentifiers || []).map((identifier, position) => [
      identifier,
      position,
    ])
  );
  const violations = [];
  for (const cluster of clusters || []) {
    const guardAt = index.get(cluster.guard);
    if (cluster.placement === 'guard-before-leaves' && guardAt !== undefined) {
      const leaves = new Set([
        ...(cluster.heldLeaves || []),
        cluster.proofLeaf,
      ]);
      for (const leaf of leaves) {
        if (!leaf) continue;
        const leafAt = index.get(leaf);
        if (leafAt !== undefined && leafAt < guardAt) {
          violations.push({
            code: 'duplicate-leaf-before-shared-guard',
            guard: cluster.guard,
            leaf,
          });
        }
      }
    }
    if (cluster.placement === 'cone-before-guard' && guardAt !== undefined) {
      for (const leaf of cluster.heldLeaves || []) {
        const leafAt = index.get(leaf);
        if (leafAt !== undefined && leafAt < guardAt) {
          violations.push({
            code: 'duplicate-leaf-before-shared-guard',
            guard: cluster.guard,
            leaf,
          });
        }
      }
      const proofAt = index.get(cluster.proofLeaf);
      if (proofAt !== undefined && guardAt < proofAt) {
        violations.push({
          code: 'shared-guard-before-cone',
          guard: cluster.guard,
          leaf: cluster.proofLeaf,
        });
      }
    }
  }
  return violations;
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
  {
    selectedAt = new Date().toISOString(),
    shippingGuards = [],
    inFlightIdentifiers = [],
  } = {}
) {
  const records = candidates.map(queueEconomicRecord);
  const units = [...new Set(records.map(record => record.expectedValue.unit))];
  const economic =
    records.length > 0 &&
    records.every(record => record.comparable) &&
    units.length === 1;
  const legacy = records
    .slice()
    .sort(
      (left, right) =>
        right.candidate.score - left.candidate.score ||
        left.candidate.identifier.localeCompare(right.candidate.identifier)
    );
  const valueRanked = economic
    ? records
        .slice()
        .sort(
          (left, right) =>
            right.expectedNetValue - left.expectedNetValue ||
            left.candidate.identifier.localeCompare(right.candidate.identifier)
        )
    : legacy;
  const priorityRank = record => record.priority || 5;
  // Stable sorting retains the existing economic/score order inside a tier.
  const priorityRanked = valueRanked
    .slice()
    .sort((left, right) => priorityRank(left) - priorityRank(right));
  const leverageFirst = orderLeverageFirst(priorityRanked, {
    shippingGuards,
    inFlightIdentifiers,
  });
  const ranked = leverageFirst.order;
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
    ? records
        .slice()
        .sort(
          (left, right) =>
            right.expectedValue.amount -
              right.fullyLoadedCost.amount -
              (left.expectedValue.amount - left.fullyLoadedCost.amount) ||
            left.candidate.identifier.localeCompare(right.candidate.identifier)
        )
    : records
        .slice()
        .sort(
          (left, right) =>
            right.candidate.score -
              preventionScoreAdjustment(right.candidate.prevention) -
              (left.candidate.score -
                preventionScoreAdjustment(left.candidate.prevention)) ||
            left.candidate.identifier.localeCompare(right.candidate.identifier)
        );
  const withoutPrevention = withoutPreventionByValue
    .slice()
    .sort((left, right) => priorityRank(left) - priorityRank(right));
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
  if (
    priorityRanked.map(record => record.candidate.identifier).join('|') !==
    ranked.map(record => record.candidate.identifier).join('|')
  ) {
    orderingReasons.push('leverage-first');
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
    leverageFirst: leverageFirst.receipt,
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

export function rankAdmissionQueue(candidates, classifications, selectedAt) {
  const inFlight = (classifications || []).filter(classification => {
    const issue = classification?.issue || classification;
    return (issue?.state?.name || classification?.state) === 'In Progress';
  });
  for (const guard of inFlight) {
    guard.prevention = assessPreventionLeverage(guard, [
      ...candidates,
      ...inFlight.filter(item => item !== guard),
    ]);
  }
  const queueRanking = rankQueueCandidates(candidates, {
    selectedAt,
    shippingGuards: inFlight.filter(guard => guard.prevention),
    inFlightIdentifiers: inFlight.map(guard => guard.identifier),
  });
  const selected = queueRanking.ranked[0];
  const cluster = queueRanking.receipt.leverageFirst?.clusters?.[0];
  const leverageNote = cluster
    ? `; leverage-first ${cluster.placement} ${cluster.guard} avoids ${cluster.duplicationAvoided} duplicate leaf repair(s)`
    : '';
  return {
    ...queueRanking,
    reason: selected
      ? `selected: ${selected.identifier} (score ${selected.score}; ${queueRanking.receipt.mode}${leverageNote})`
      : 'no eligible candidates',
  };
}
