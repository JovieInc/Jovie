import {
  IMPACT_FORECAST_AUTHORITY,
  IMPACT_FORECAST_SCHEMA,
  IMPACT_OBSERVATION_AUTHORITY,
  impactProducerAttestationPayload,
  resolveTrustedForecast,
  resolveTrustedObservation,
} from './impact-forecast-trust.mjs';
import {
  IMPACT_DIMENSIONS as DIMENSIONS,
  IMPACT_QUANTILES as Q,
  validateImpactForecastInput,
} from './impact-forecast-validation.mjs';
import {
  digestCanonicalJson,
  isRecord,
  requireIsoTimestamp,
} from './receipt-trust.mjs';

export const IMPACT_CALIBRATION_SCHEMA = 'jovie.impact-calibration/v1';
export {
  IMPACT_FORECAST_AUTHORITY,
  IMPACT_FORECAST_SCHEMA,
  IMPACT_OBSERVATION_AUTHORITY,
  impactProducerAttestationPayload,
};

function need(value, message) {
  if (!value) throw new Error(message);
}
function text(value, field) {
  need(typeof value === 'string' && value.trim(), `${field} is required`);
}
function date(value, field) {
  return Date.parse(requireIsoTimestamp(value, field));
}
function round(value) {
  return Number(value.toFixed(6));
}
function ratio(numerator, denominator) {
  return denominator === 0 ? null : round(numerator / denominator);
}
function distribution(mapper) {
  return Object.fromEntries(Q.map(q => [q, round(mapper(q))]));
}

function requireFiniteOutput(value, field = 'forecast') {
  if (typeof value === 'number') {
    need(
      Number.isFinite(value),
      `${field} contains a non-finite derived value`
    );
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      requireFiniteOutput(item, `${field}[${index}]`)
    );
    return;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value))
      requireFiniteOutput(item, `${field}.${key}`);
  }
}

function confidence(input) {
  const gaps = input.sources.filter(
    source =>
      source.material &&
      (source.status !== 'observed' ||
        Date.parse(source.expiresAt) <= Date.parse(input.predictedAt))
  );
  const error = Math.max(0, ...Object.values(input.calibrationErrors ?? {}));
  return {
    level: gaps.length === 0 && error <= 0.2 ? 'high' : 'low',
    materialGaps: gaps.map(source => source.key),
    intervalMultiplier: round(1 + gaps.length * 0.25 + error),
  };
}

function forecastScenario(input, envelope, certainty) {
  const demand = input.demand;
  const activeUsers = distribution(q =>
    Math.min(
      envelope.maxUsers,
      envelope.maxUsers *
        demand.adoption[q] *
        (q === 'p50' ? 1 : certainty.intervalMultiplier)
    )
  );
  const amplification =
    demand.fanout * (1 + demand.retryRate + demand.duplicateRate);
  const calls = distribution(
    q => activeUsers[q] * demand.eventsPerUser[q] * amplification
  );
  const arrivalRate = distribution(
    q =>
      (calls[q] / envelope.durationSeconds) *
      (q === 'p50' ? 1 : demand.burstMultiplier)
  );
  const resources = input.dependencies.map(resource => {
    const load = distribution(
      q =>
        resource.currentLoadPerSecond +
        arrivalRate[q] * resource.unitsPerRequest
    );
    const utilization = distribution(q => load[q] / resource.capacityPerSecond);
    return { id: resource.id, load, utilization };
  });
  const bottleneck = resources.reduce((a, b) =>
    b.utilization.p99 > a.utilization.p99 ? b : a
  );
  const resource = input.dependencies.find(row => row.id === bottleneck.id);
  const latencyMs = distribution(
    q =>
      resource.baseLatencyMs /
      Math.max(0.01, 1 - Math.min(0.99, bottleneck.utilization[q]))
  );
  const concurrency = distribution(q => (arrivalRate[q] * latencyMs[q]) / 1000);
  const queueDepth = distribution(
    q =>
      Math.max(0, bottleneck.load[q] - resource.capacityPerSecond) *
      envelope.durationSeconds
  );
  const errorRisk = distribution(q =>
    Math.min(1, Math.max(0, bottleneck.utilization[q] - 0.8))
  );
  const unitCost = input.dependencies.reduce(
    (sum, row) => sum + row.unitsPerRequest * row.unitCostUsd,
    0
  );
  const costUsd = distribution(q => calls[q] * unitCost);
  const valueUsd = distribution(
    q => activeUsers[q] * input.value.activationRate * input.value.unitValueUsd
  );
  const hardBreaches = input.dependencies
    .filter(
      row =>
        row.hardInvariant &&
        resources.find(r => r.id === row.id).utilization.p99 >= 1
    )
    .map(row => row.id);
  if (concurrency.p99 > envelope.maxConcurrency)
    hardBreaches.push('exposure.maxConcurrency');
  if (costUsd.p99 > envelope.costBudgetUsd)
    hardBreaches.push('exposure.costBudgetUsd');
  if (errorRisk.p99 > input.policy.maxErrorRate)
    hardBreaches.push('policy.maxErrorRate');
  const headroom = 1 - bottleneck.utilization.p99;
  const capacityBreachAtExposure =
    bottleneck.load.p50 >= resource.capacityPerSecond;
  return {
    id: envelope.id,
    envelope: structuredClone(envelope),
    distributions: {
      activeUsers,
      arrivalRate,
      concurrency,
      queueDepth,
      queueAgeSeconds: distribution(
        q => queueDepth[q] / resource.capacityPerSecond
      ),
      latencyMs,
      errorRisk,
      costUsd,
      valueUsd,
    },
    resources,
    likelyBottleneck: bottleneck.id,
    spendVelocityUsdPerHour: round(
      (costUsd.p99 / envelope.durationSeconds) * 3600
    ),
    capacityHeadroomFraction: round(headroom),
    timeToCapacityBreachSeconds: capacityBreachAtExposure ? 0 : null,
    timeToCapacityBreachBasis: capacityBreachAtExposure
      ? 'at-exposure'
      : 'insufficient-temporal-evidence',
    unitEconomics: {
      valueCostRatio: costUsd.p50 ? round(valueUsd.p50 / costUsd.p50) : null,
    },
    hardBreaches,
    status: hardBreaches.length
      ? 'blocked'
      : headroom >= input.policy.minHeadroomFraction &&
          certainty.level === 'high'
        ? 'safe'
        : 'observe',
    valueLagSeconds: input.value.lagSeconds,
  };
}

function recommend(input, certainty, scenarios) {
  const candidates = scenarios.filter(row => row.status !== 'blocked');
  const safe = candidates.filter(row => row.status === 'safe').at(-1);
  const chosen =
    certainty.level === 'high' ? (safe ?? candidates[0]) : candidates[0];
  const stopConditions = {
    noExposure: !chosen,
    capacityHeadroomFractionBelow: input.policy.minHeadroomFraction,
    errorRateAbove: input.policy.maxErrorRate,
    costUsdAbove: chosen?.envelope.costBudgetUsd ?? null,
    concurrencyAbove: chosen?.envelope.maxConcurrency ?? null,
  };
  if (!chosen)
    return {
      action: 'shrink-envelope-or-add-capacity',
      scenarioId: null,
      learningObjective: 'remove-hard-envelope-breach',
      requiredTelemetry: [],
      stopConditions,
    };
  return {
    action:
      certainty.level === 'high' && chosen.status === 'safe'
        ? 'expand'
        : 'instrumented-canary',
    scenarioId: chosen.id,
    learningObjective: certainty.materialGaps.length
      ? `resolve:${certainty.materialGaps.join(',')}`
      : 'validate-demand-and-resource-load',
    requiredTelemetry: [...DIMENSIONS],
    stopConditions,
  };
}

export function createImpactForecast(input, prior = [], context = {}) {
  validateImpactForecastInput(input);
  const key = digestCanonicalJson({
    ...input,
    predictedAt: null,
    lineage: null,
  });
  const existing = prior
    .map(entry => resolveTrustedForecast(entry, context.forecastPublicKey))
    .find(row => row.forecastKey === key);
  if (existing)
    return {
      disposition: existing.sourceFreshness.some(
        source =>
          source.material &&
          (source.status !== 'observed' ||
            Date.parse(source.expiresAt) <= Date.parse(input.predictedAt))
      )
        ? 'stale-existing'
        : 'reuse-existing',
      paidAnalysis: false,
      alert: false,
      receipt: existing,
    };
  const certainty = confidence(input);
  const scenarios = input.exposure.scenarios
    .toSorted((a, b) => a.maxUsers - b.maxUsers)
    .map(row => forecastScenario(input, row, certainty));
  const inputDigest = digestCanonicalJson(input);
  const receiptPayload = {
    schema: IMPACT_FORECAST_SCHEMA,
    receiptId: `impact-${inputDigest}`,
    forecastKey: key,
    inputDigest,
    predictedAt: input.predictedAt,
    object: structuredClone(input.object),
    decisionSnapshot: structuredClone(input.decisionSnapshot),
    decisionSnapshotDigest: digestCanonicalJson(input.decisionSnapshot),
    exposure: structuredClone(input.exposure),
    dependencyGraph: structuredClone(input.dependencies),
    policyVersion: input.policy.version,
    lineage: structuredClone(input.lineage),
    targets: structuredClone(input.targets),
    sourceFreshness: structuredClone(input.sources),
    confidence: certainty,
    sensitivity: {
      eventsPerUser: ratio(
        input.demand.eventsPerUser.p99,
        input.demand.eventsPerUser.p50
      ),
      adoption: ratio(input.demand.adoption.p99, input.demand.adoption.p50),
      fanoutBurst: round(input.demand.fanout * input.demand.burstMultiplier),
    },
    scenarios,
    recommendation: recommend(input, certainty, scenarios),
    authority: 'evidence-only',
  };
  requireFiniteOutput(receiptPayload);
  const receipt = {
    ...receiptPayload,
    receiptDigest: digestCanonicalJson(receiptPayload),
  };
  return {
    disposition: 'created',
    paidAnalysis: false,
    alert: scenarios.some(row => row.status === 'blocked'),
    receipt,
  };
}

function accuracy(predicted, actual) {
  return round(
    1 -
      Math.min(
        1,
        Math.abs(predicted - actual) /
          Math.max(Math.abs(actual), Math.abs(predicted), 1e-9)
      )
  );
}

export function calibrateImpactForecast(forecastId, observationIds, context) {
  text(forecastId, 'forecastId');
  need(isRecord(context?.trustedForecasts), 'trusted forecast store required');
  const receipt = resolveTrustedForecast(
    context.trustedForecasts[forecastId],
    context.forecastPublicKey
  );
  need(receipt.receiptId === forecastId, 'trusted forecast identity mismatch');
  const calibratedAt = date(context.calibratedAt, 'calibratedAt');
  need(
    calibratedAt >= Date.parse(receipt.predictedAt),
    'calibration cannot precede prediction'
  );
  need(
    Array.isArray(observationIds) && observationIds.length,
    'observation references required'
  );
  need(
    isRecord(context.trustedObservations),
    'trusted telemetry store required'
  );
  const observations = observationIds.map(observationId =>
    resolveTrustedObservation(
      observationId,
      context.trustedObservations,
      context.observationPublicKey
    )
  );
  const scores = Object.fromEntries(DIMENSIONS.map(key => [key, []]));
  let falseAlarms = 0;
  const leadTimes = [];
  const seenObservationIds = new Set();
  const exposureBindings = new Set();
  const matureObservations = [];
  for (const observation of observations) {
    text(observation?.observationId, 'observation.observationId');
    need(
      observation.forecastId === receipt.receiptId,
      'observation forecast mismatch'
    );
    const scenario = receipt.scenarios.find(
      row => row.id === observation.scenarioId
    );
    const actionAt = date(observation.actionAt, 'observation.actionAt');
    const observedAt = date(observation.observedAt, 'observation.observedAt');
    const target = receipt.targets.find(
      row => row.kind === observation.targetKind
    );
    need(
      scenario &&
        target &&
        actionAt >= Date.parse(receipt.predictedAt) &&
        observedAt >= actionAt &&
        observedAt <= calibratedAt,
      'retrospective or future-label-leaking observation'
    );
    need(
      ['mature', 'censored', 'in-flight', 'immature'].includes(
        observation.state
      ),
      'invalid observation state'
    );
    need(
      !seenObservationIds.has(observation.observationId),
      'duplicate observation id'
    );
    seenObservationIds.add(observation.observationId);
    const binding = digestCanonicalJson([
      observation.scenarioId,
      observation.actionAt,
    ]);
    need(!exposureBindings.has(binding), 'duplicate exposure observation');
    exposureBindings.add(binding);
    if (observation.state !== 'mature') continue;
    const requiredMaturitySeconds = Math.max(
      target.maturitySeconds,
      scenario.valueLagSeconds
    );
    need(
      observedAt - actionAt >= requiredMaturitySeconds * 1000,
      'observation is not mature for target'
    );
    need(isRecord(observation.actual), 'mature observation actuals required');
    const resource = scenario.resources.find(
      row => row.id === scenario.likelyBottleneck
    );
    const predicted = [
      scenario.distributions.arrivalRate.p50,
      resource.load.p50,
      scenario.distributions.costUsd.p50,
      scenario.distributions.errorRisk.p50,
      scenario.distributions.valueUsd.p50,
    ];
    DIMENSIONS.forEach((key, index) => {
      need(
        Number.isFinite(observation.actual[key]) &&
          observation.actual[key] >= 0,
        `invalid actual ${key}`
      );
      scores[key].push(accuracy(predicted[index], observation.actual[key]));
    });
    need(
      typeof observation.actual.capacityBreached === 'boolean',
      'actual capacityBreached must be boolean'
    );
    if (scenario.status === 'blocked' && !observation.actual.capacityBreached)
      falseAlarms += 1;
    if (observation.actual.capacityBreachedAt) {
      need(
        observation.actual.capacityBreached,
        'capacity breach timestamp requires capacityBreached=true'
      );
      const breachedAt = date(
        observation.actual.capacityBreachedAt,
        'capacityBreachedAt'
      );
      need(
        breachedAt >= actionAt && breachedAt <= observedAt,
        'capacity breach timestamp must fall inside the observation window'
      );
      leadTimes.push((breachedAt - Date.parse(receipt.predictedAt)) / 1000);
    }
    matureObservations.push(observation);
  }
  const mature = scores.demand.length;
  const summary = divisor =>
    Object.fromEntries(
      Object.entries(scores).map(([key, values]) => [
        key,
        values.length
          ? round(
              values.reduce((sum, value) => sum + value, 0) / divisor(values)
            )
          : null,
      ])
    );
  const calibrationPayload = {
    schema: IMPACT_CALIBRATION_SCHEMA,
    forecastId: receipt.receiptId,
    forecastDigest: receipt.receiptDigest,
    calibrationId: `calibration-${digestCanonicalJson({ calibratedAt: context.calibratedAt, forecastId, observations })}`,
    calibratedAt: context.calibratedAt,
    temporalValidation: 'prospective',
    workloadClass: receipt.object.workloadClass,
    targetKinds: receipt.targets.map(row => row.kind),
    observations: structuredClone(observations),
    matureSampleSize: mature,
    sufficientMatureEvidence: mature >= 3,
    coverage: summary(() => observations.length),
    accuracy: summary(values => values.length),
    leadTimeSeconds: leadTimes.length
      ? round(
          leadTimes.reduce((sum, value) => sum + value, 0) / leadTimes.length
        )
      : null,
    falseAlarmRate: mature ? round(falseAlarms / mature) : null,
    decisionUsefulness: matureObservations.some(
      row => row.scenarioId === receipt.recommendation.scenarioId
    ),
    aggregateScore: null,
  };
  requireFiniteOutput(calibrationPayload, 'calibration');
  return {
    ...calibrationPayload,
    calibrationDigest: digestCanonicalJson(calibrationPayload),
  };
}
