import { collisionDomainsForPaths } from './ownership-inventory.mjs';

export const LANE_CAPACITY_SCHEMA = 'jovie-lane-capacity/v1';
export const LANE_CAPACITY_MAX_AGE_MS = 10 * 60 * 1000;

function freshTimestamp(value, nowMs, maxAgeMs) {
  const observedMs = Date.parse(value || '');
  return (
    Number.isFinite(observedMs) &&
    observedMs <= nowMs + 60_000 &&
    nowMs - observedMs <= maxAgeMs
  );
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function buildLaneCapacityReceipt(
  pullRequests,
  { observedAt, globalBudget, defaultLaneBudget }
) {
  const laneCounts = new Map();
  const ready = (Array.isArray(pullRequests) ? pullRequests : []).filter(
    pr =>
      pr?.isDraft === false &&
      pr?.mergeStateStatus === 'CLEAN' &&
      !(pr?.labels || []).some(label =>
        ['hold', 'gated', 'queue-deferred', 'needs-human'].includes(label?.name)
      )
  );
  for (const pr of ready) {
    for (const domain of collisionDomainsForPaths(
      (pr.files || []).map(file => file?.path).filter(Boolean)
    )) {
      laneCounts.set(domain, (laneCounts.get(domain) || 0) + 1);
    }
  }
  return {
    schema: LANE_CAPACITY_SCHEMA,
    observedAt,
    global: { ready: ready.length, budget: globalBudget },
    defaultLaneBudget,
    lanes: Object.fromEntries(
      [...laneCounts.entries()].map(([domain, count]) => [
        domain,
        { ready: count, budget: defaultLaneBudget },
      ])
    ),
  };
}

export function evaluateLaneCapacity(
  receipt,
  collisionDomains,
  { now = new Date().toISOString(), maxAgeMs = LANE_CAPACITY_MAX_AGE_MS } = {}
) {
  const nowMs = Date.parse(now);
  if (
    receipt?.schema !== LANE_CAPACITY_SCHEMA ||
    !freshTimestamp(receipt?.observedAt, nowMs, maxAgeMs) ||
    !nonNegativeInteger(receipt?.global?.ready) ||
    !positiveInteger(receipt?.global?.budget) ||
    !positiveInteger(receipt?.defaultLaneBudget) ||
    !receipt?.lanes ||
    typeof receipt.lanes !== 'object' ||
    Array.isArray(receipt.lanes)
  ) {
    return {
      allowed: false,
      disposition: 'defer',
      code: 'lane-capacity-evidence-missing-malformed-or-stale',
    };
  }
  if (receipt.global.ready >= receipt.global.budget) {
    return {
      allowed: false,
      disposition: 'defer',
      code: 'global-capacity-exhausted',
      ready: receipt.global.ready,
      budget: receipt.global.budget,
    };
  }
  const domains = [...new Set(collisionDomains || [])].sort();
  if (domains.length === 0) {
    return {
      allowed: false,
      disposition: 'defer',
      code: 'collision-domain-missing',
    };
  }
  for (const domain of domains) {
    const lane = receipt.lanes[domain] || {
      ready: 0,
      budget: receipt.defaultLaneBudget,
    };
    if (!nonNegativeInteger(lane.ready) || !positiveInteger(lane.budget)) {
      return {
        allowed: false,
        disposition: 'defer',
        code: 'lane-capacity-evidence-missing-malformed-or-stale',
        domain,
      };
    }
    if (lane.ready >= lane.budget) {
      return {
        allowed: false,
        disposition: 'defer',
        code: 'lane-capacity-exhausted',
        domain,
        ready: lane.ready,
        budget: lane.budget,
      };
    }
  }
  return {
    allowed: true,
    disposition: 'candidate',
    code: 'lane-capacity-available',
    domains,
  };
}
