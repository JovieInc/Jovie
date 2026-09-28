import { digestCanonicalJson, requireIsoTimestamp } from './receipt-trust.mjs';

export const IMPACT_FORECAST_SCHEMA = 'jovie.impact-forecast/v1';
export const IMPACT_CALIBRATION_SCHEMA = 'jovie.impact-calibration/v1';
const Q = ['p50', 'p95', 'p99'];
const DIMENSIONS = ['demand', 'resourceLoad', 'cost', 'reliability', 'value'];
const TARGETS = new Set([
  'shipping-stall',
  'post-release-regression',
  'capacity-envelope-breach',
]);

function need(value, message) {
  if (!value) throw new Error(message);
}
function date(value, field) {
  return Date.parse(requireIsoTimestamp(value, field));
}
function round(value) {
  return Number(value.toFixed(6));
}
function distribution(mapper) {
  return Object.fromEntries(Q.map(q => [q, round(mapper(q))]));
}
function validate(input) {
  need(
    input?.object?.id &&
      input.object.revision &&
      input.object.environment &&
      input.object.workloadClass &&
      input.policy?.version &&
      input.exposure?.scenarios?.length &&
      input.dependencies?.length &&
      input.sources?.length &&
      input.targets?.every(row => TARGETS.has(row.kind)) &&
      input.lineage?.policyDisposition,
    'exact forecast identity required'
  );
  const predictedAt = date(input.predictedAt, 'predictedAt');
  need(
    input.decisionSnapshot?.features &&
      date(input.decisionSnapshot.capturedAt, 'snapshot.capturedAt') <=
        predictedAt,
    'decision snapshot must exist before prediction'
  );
  for (const source of input.sources) {
    need(
      source.key &&
        ['observed', 'assumption', 'missing'].includes(source.status),
      'invalid source evidence'
    );
    if (source.status !== 'missing')
      need(
        source.ref &&
          date(source.observedAt, 'source.observedAt') <= predictedAt &&
          date(source.expiresAt, 'source.expiresAt'),
        'future source evidence is not prospective'
      );
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
    timeToCapacityBreachSeconds:
      bottleneck.load.p50 >= resource.capacityPerSecond
        ? 0
        : bottleneck.load.p99 < resource.capacityPerSecond
          ? null
          : round(
              (envelope.durationSeconds *
                (resource.capacityPerSecond - bottleneck.load.p50)) /
                (bottleneck.load.p99 - bottleneck.load.p50)
            ),
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
  const chosen =
    certainty.level === 'high'
      ? (candidates.filter(row => row.status === 'safe').at(-1) ??
        candidates[0])
      : candidates[0];
  if (!chosen)
    return {
      action: 'shrink-envelope-or-add-capacity',
      scenarioId: null,
      learningObjective: 'remove-hard-envelope-breach',
      requiredTelemetry: [],
      stopConditions: ['no-exposure'],
    };
  return {
    action: certainty.level === 'high' ? 'expand' : 'instrumented-canary',
    scenarioId: chosen.id,
    learningObjective: certainty.materialGaps.length
      ? `resolve:${certainty.materialGaps.join(',')}`
      : 'validate-demand-and-resource-load',
    requiredTelemetry: [...DIMENSIONS],
    stopConditions: {
      resource: `${chosen.likelyBottleneck}:utilization>=1`,
      costUsd: chosen.envelope.costBudgetUsd,
      concurrency: chosen.envelope.maxConcurrency,
    },
  };
}

export function createImpactForecast(input, prior = []) {
  validate(input);
  const key = digestCanonicalJson({
    ...input,
    predictedAt: null,
    lineage: null,
  });
  const existing = prior.find(row => row.forecastKey === key);
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
  const receipt = {
    schema: IMPACT_FORECAST_SCHEMA,
    receiptId: `impact-${key.slice(0, 24)}`,
    forecastKey: key,
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
      eventsPerUser: round(
        input.demand.eventsPerUser.p99 / input.demand.eventsPerUser.p50
      ),
      adoption: round(input.demand.adoption.p99 / input.demand.adoption.p50),
      fanoutBurst: round(input.demand.fanout * input.demand.burstMultiplier),
    },
    scenarios,
    recommendation: recommend(input, certainty, scenarios),
    authority: 'evidence-only',
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

export function calibrateImpactForecast(receipt, observations) {
  need(
    receipt?.schema === IMPACT_FORECAST_SCHEMA,
    'impact forecast receipt required'
  );
  need(observations?.length, 'observations required');
  const scores = Object.fromEntries(DIMENSIONS.map(key => [key, []]));
  let falseAlarms = 0;
  const leadTimes = [];
  for (const observation of observations) {
    need(
      observation.forecastId === receipt.receiptId,
      'observation forecast mismatch'
    );
    const scenario = receipt.scenarios.find(
      row => row.id === observation.scenarioId
    );
    const actionAt = date(observation.actionAt, 'observation.actionAt');
    need(
      scenario &&
        actionAt >= Date.parse(receipt.predictedAt) &&
        date(observation.observedAt, 'observation.observedAt') >= actionAt,
      'retrospective or future-label-leaking observation'
    );
    need(
      ['mature', 'censored', 'in-flight', 'immature'].includes(
        observation.state
      ),
      'invalid observation state'
    );
    if (observation.state !== 'mature') continue;
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
    if (scenario.status === 'blocked' && !observation.actual.capacityBreached)
      falseAlarms += 1;
    if (observation.actual.capacityBreachedAt)
      leadTimes.push(
        (date(observation.actual.capacityBreachedAt, 'capacityBreachedAt') -
          Date.parse(receipt.predictedAt)) /
          1000
      );
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
  return {
    schema: IMPACT_CALIBRATION_SCHEMA,
    forecastId: receipt.receiptId,
    calibrationId: `calibration-${digestCanonicalJson(observations).slice(0, 24)}`,
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
    decisionUsefulness: observations.some(
      row => row.scenarioId === receipt.recommendation.scenarioId
    ),
    aggregateScore: null,
  };
}
