import { isRecord, requireIsoTimestamp } from './receipt-trust.mjs';

export const IMPACT_QUANTILES = Object.freeze(['p50', 'p95', 'p99']);
export const IMPACT_DIMENSIONS = Object.freeze([
  'demand',
  'resourceLoad',
  'cost',
  'reliability',
  'value',
]);
const TARGETS = new Set([
  'shipping-stall',
  'post-release-regression',
  'capacity-envelope-breach',
]);

function need(value, message) {
  if (!value) throw new Error(message);
}

function text(value, field) {
  need(typeof value === 'string' && value.trim(), `${field} is required`);
}

function date(value, field) {
  return Date.parse(requireIsoTimestamp(value, field));
}

function finite(
  value,
  field,
  { min = 0, max = Number.POSITIVE_INFINITY } = {}
) {
  need(
    Number.isFinite(value) && value >= min && value <= max,
    `${field} must be a finite number between ${min} and ${max}`
  );
}

function quantiles(value, field, bounds) {
  need(isRecord(value), `${field} quantiles are required`);
  IMPACT_QUANTILES.forEach(q => finite(value[q], `${field}.${q}`, bounds));
  need(
    value.p50 <= value.p95 && value.p95 <= value.p99,
    `${field} quantiles must be ordered`
  );
}

function uniqueRows(rows, field) {
  need(rows.every(isRecord), `${field} entries must be objects`);
  need(
    new Set(rows.map(row => row.id ?? row.key ?? row.kind)).size ===
      rows.length,
    `${field} entries must be unique`
  );
}

export function validateImpactForecastInput(input) {
  need(isRecord(input), 'forecast input must be an object');
  need(
    isRecord(input.object) &&
      isRecord(input.policy) &&
      isRecord(input.exposure) &&
      Array.isArray(input.exposure.scenarios) &&
      input.exposure.scenarios.length > 0 &&
      Array.isArray(input.dependencies) &&
      input.dependencies.length > 0 &&
      Array.isArray(input.sources) &&
      input.sources.length > 0 &&
      Array.isArray(input.targets) &&
      input.targets.length > 0 &&
      input.targets.every(row => isRecord(row) && TARGETS.has(row.kind)) &&
      isRecord(input.lineage),
    'exact forecast identity required'
  );
  const predictedAt = date(input.predictedAt, 'predictedAt');
  for (const [field, value] of Object.entries({
    'object.id': input.object.id,
    'object.revision': input.object.revision,
    'object.environment': input.object.environment,
    'object.workloadClass': input.object.workloadClass,
    'policy.version': input.policy.version,
    'exposure.cohort': input.exposure.cohort,
    'exposure.riskClass': input.exposure.riskClass,
    'lineage.policyDisposition': input.lineage.policyDisposition,
  }))
    text(value, field);
  need(
    isRecord(input.decisionSnapshot?.features) &&
      date(input.decisionSnapshot.capturedAt, 'snapshot.capturedAt') <=
        predictedAt,
    'decision snapshot must exist before prediction'
  );

  finite(input.demand?.eligibleUsers, 'demand.eligibleUsers', { min: 1 });
  quantiles(input.demand?.adoption, 'demand.adoption', { max: 1 });
  quantiles(input.demand?.eventsPerUser, 'demand.eventsPerUser');
  finite(input.demand?.fanout, 'demand.fanout');
  finite(input.demand?.retryRate, 'demand.retryRate', { max: 1 });
  finite(input.demand?.duplicateRate, 'demand.duplicateRate', { max: 1 });
  finite(input.demand?.burstMultiplier, 'demand.burstMultiplier', { min: 1 });
  finite(input.value?.activationRate, 'value.activationRate', { max: 1 });
  finite(input.value?.unitValueUsd, 'value.unitValueUsd');
  finite(input.value?.lagSeconds, 'value.lagSeconds');
  finite(input.policy.minHeadroomFraction, 'policy.minHeadroomFraction', {
    max: 1,
  });
  finite(input.policy.maxErrorRate, 'policy.maxErrorRate', { max: 1 });
  finite(input.exposure.rollbackSeconds, 'exposure.rollbackSeconds');

  uniqueRows(input.exposure.scenarios, 'exposure.scenarios');
  for (const scenario of input.exposure.scenarios) {
    need(isRecord(scenario), 'scenario must be an object');
    text(scenario.id, 'scenario.id');
    finite(scenario.maxUsers, 'scenario.maxUsers', { min: 1 });
    need(
      Number.isInteger(scenario.maxUsers) &&
        scenario.maxUsers <= input.demand.eligibleUsers,
      'scenario.maxUsers must be an integer within the eligible population'
    );
    finite(scenario.durationSeconds, 'scenario.durationSeconds', { min: 1 });
    finite(scenario.maxConcurrency, 'scenario.maxConcurrency', { min: 1 });
    finite(scenario.costBudgetUsd, 'scenario.costBudgetUsd');
  }

  uniqueRows(input.dependencies, 'dependencies');
  for (const resource of input.dependencies) {
    need(isRecord(resource), 'dependency must be an object');
    text(resource.id, 'dependency.id');
    text(resource.kind, 'dependency.kind');
    need(Array.isArray(resource.dependsOn), 'dependency.dependsOn is required');
    resource.dependsOn.forEach(value => text(value, 'dependency.dependsOn[]'));
    finite(resource.unitsPerRequest, 'dependency.unitsPerRequest');
    finite(resource.currentLoadPerSecond, 'dependency.currentLoadPerSecond');
    finite(resource.capacityPerSecond, 'dependency.capacityPerSecond', {
      min: Number.EPSILON,
    });
    finite(resource.baseLatencyMs, 'dependency.baseLatencyMs');
    finite(resource.unitCostUsd, 'dependency.unitCostUsd');
    need(
      typeof resource.hardInvariant === 'boolean',
      'dependency.hardInvariant must be boolean'
    );
  }
  const dependencyIds = new Set(input.dependencies.map(row => row.id));
  for (const resource of input.dependencies) {
    need(
      resource.dependsOn.every(
        dependencyId =>
          dependencyId !== resource.id && dependencyIds.has(dependencyId)
      ),
      'dependency.dependsOn must reference another declared dependency'
    );
  }

  uniqueRows(input.targets, 'targets');
  input.targets.forEach(target =>
    finite(target.maturitySeconds, 'target.maturitySeconds')
  );
  uniqueRows(input.sources, 'sources');
  for (const source of input.sources) {
    need(
      isRecord(source) &&
        source.key &&
        ['observed', 'assumption', 'missing'].includes(source.status),
      'invalid source evidence'
    );
    text(source.key, 'source.key');
    need(
      typeof source.material === 'boolean',
      'source.material must be boolean'
    );
    if (source.status !== 'missing') {
      text(source.ref, 'source.ref');
      const observedAt = date(source.observedAt, 'source.observedAt');
      const expiresAt = date(source.expiresAt, 'source.expiresAt');
      need(
        source.ref && observedAt <= predictedAt && expiresAt > observedAt,
        'future source evidence is not prospective'
      );
    }
  }

  if (input.calibrationErrors !== undefined) {
    need(
      isRecord(input.calibrationErrors),
      'calibrationErrors must be an object'
    );
    for (const [key, value] of Object.entries(input.calibrationErrors)) {
      need(
        IMPACT_DIMENSIONS.includes(key),
        `unknown calibration dimension ${key}`
      );
      finite(value, `calibrationErrors.${key}`, { max: 1 });
    }
  }
}
