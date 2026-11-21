/**
 * Queue ranking for Summer admission. JOV-7423 applies leverage-first order
 * after the existing priority and value sort.
 */

import { orderLeverageFirst } from './leverage-first-ordering.mjs';
import {
  assessPreventionLeverage,
  preventionScoreAdjustment,
  QUEUE_RANKING_RECEIPT_SCHEMA,
} from './scorer.mjs';

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
