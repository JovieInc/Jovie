import {
  collisionDomainsForPaths,
  JOVIE_EXECUTION_REPO,
} from './ownership-inventory.mjs';

export const LANE_CAPACITY_SCHEMA = 'jovie-lane-capacity/v2';
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

function repositoryName(value) {
  const normalized = String(value || '').trim();
  return /^[^/\s]+\/[^/\s]+$/.test(normalized) ? normalized : null;
}

export function repositoryForCollisionDomain(domain) {
  const match = /^(?:artifact|risk|lane|resource):([^:]+\/[^:]+):/.exec(
    String(domain || '')
  );
  return repositoryName(match?.[1]);
}

function capacityRecord(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    nonNegativeInteger(value.ready) &&
    positiveInteger(value.budget)
  );
}

function normalizeSharedResources(value) {
  const entries = Array.isArray(value)
    ? value.map(item => [item?.resource, item])
    : Object.entries(value || {});
  return Object.fromEntries(
    entries
      .map(([key, raw]) => {
        const resource = String(raw?.resource || key || '').trim();
        const consumerSource = Array.isArray(raw?.consumers)
          ? raw.consumers
          : [];
        const consumers = [...new Set(consumerSource)]
          .map(item => String(item || '').trim())
          .filter(Boolean)
          .sort();
        if (!resource || consumers.length === 0) return null;
        return [
          resource,
          {
            resource,
            ready: raw.ready,
            budget: raw.budget,
            consumers,
          },
        ];
      })
      .filter(Boolean)
  );
}

function validSharedResources(resources) {
  return Object.entries(resources || {}).every(
    ([key, resource]) =>
      resource &&
      typeof resource === 'object' &&
      !Array.isArray(resource) &&
      resource.resource === key &&
      capacityRecord(resource) &&
      Array.isArray(resource.consumers) &&
      resource.consumers.length > 0 &&
      resource.consumers.every(
        consumer => typeof consumer === 'string' && consumer.length > 0
      )
  );
}

export function buildLaneCapacityReceipt(
  pullRequests,
  {
    observedAt,
    repository = JOVIE_EXECUTION_REPO,
    repositoryBudget,
    repositoryBudgets = {},
    defaultLaneBudget,
    sharedResources = {},
  }
) {
  const laneCounts = new Map();
  const repositoryCounts = new Map();
  const ready = (Array.isArray(pullRequests) ? pullRequests : []).filter(
    pr =>
      pr?.isDraft === false &&
      pr?.mergeStateStatus === 'CLEAN' &&
      !(pr?.labels || []).some(label =>
        // JOV-INV-028: legacy human labels never consume protected capacity.
        ['hold', 'gated', 'queue-deferred'].includes(label?.name)
      )
  );
  for (const pr of ready) {
    const repo = repositoryName(pr?.repository) || repositoryName(repository);
    if (!repo) continue;
    repositoryCounts.set(repo, (repositoryCounts.get(repo) || 0) + 1);
    for (const domain of collisionDomainsForPaths(
      (pr.files || []).map(file => file?.path).filter(Boolean),
      { repo }
    )) {
      laneCounts.set(domain, (laneCounts.get(domain) || 0) + 1);
    }
  }
  const defaultRepository = repositoryName(repository);
  if (defaultRepository && !repositoryCounts.has(defaultRepository)) {
    repositoryCounts.set(defaultRepository, 0);
  }
  const defaultRepositoryBudget = positiveInteger(repositoryBudget)
    ? repositoryBudget
    : null;
  return {
    schema: LANE_CAPACITY_SCHEMA,
    observedAt,
    repositories: Object.fromEntries(
      [...repositoryCounts.entries()].map(([repo, count]) => [
        repo,
        {
          ready: count,
          budget:
            repositoryBudgets?.[repo] ||
            defaultRepositoryBudget ||
            Math.max(1, count),
        },
      ])
    ),
    defaultLaneBudget,
    lanes: Object.fromEntries(
      [...laneCounts.entries()].map(([domain, count]) => [
        domain,
        { ready: count, budget: defaultLaneBudget },
      ])
    ),
    sharedResources: normalizeSharedResources(sharedResources),
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
    receipt?.global !== undefined ||
    !receipt?.repositories ||
    typeof receipt.repositories !== 'object' ||
    Array.isArray(receipt.repositories) ||
    !Object.values(receipt.repositories).every(capacityRecord) ||
    !positiveInteger(receipt?.defaultLaneBudget) ||
    !receipt?.lanes ||
    typeof receipt.lanes !== 'object' ||
    Array.isArray(receipt.lanes) ||
    !Object.values(receipt.lanes).every(capacityRecord) ||
    !receipt?.sharedResources ||
    typeof receipt.sharedResources !== 'object' ||
    Array.isArray(receipt.sharedResources) ||
    !validSharedResources(receipt.sharedResources)
  ) {
    return {
      allowed: false,
      disposition: 'defer',
      code: 'lane-capacity-evidence-missing-malformed-or-stale',
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
  const repositories = [
    ...new Set(domains.map(repositoryForCollisionDomain).filter(Boolean)),
  ].sort();
  if (repositories.length === 0) {
    return {
      allowed: false,
      disposition: 'defer',
      code: 'collision-domain-repository-missing',
    };
  }
  for (const repository of repositories) {
    const capacity = receipt.repositories[repository];
    if (capacity && capacity.ready >= capacity.budget) {
      return {
        allowed: false,
        disposition: 'defer',
        code: 'repository-capacity-exhausted',
        repository,
        ready: capacity.ready,
        budget: capacity.budget,
      };
    }
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
  for (const resource of Object.values(receipt.sharedResources)) {
    if (!resource.consumers.some(consumer => domains.includes(consumer))) {
      continue;
    }
    if (resource.ready >= resource.budget) {
      return {
        allowed: false,
        disposition: 'defer',
        code: 'shared-resource-capacity-exhausted',
        resource: resource.resource,
        ready: resource.ready,
        budget: resource.budget,
      };
    }
  }
  return {
    allowed: true,
    disposition: 'candidate',
    code: 'lane-capacity-available',
    domains,
    repositories,
  };
}
