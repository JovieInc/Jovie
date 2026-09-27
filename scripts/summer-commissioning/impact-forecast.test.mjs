import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as signPayload } from 'node:crypto';
import test from 'node:test';
import {
  calibrateImpactForecast,
  createImpactForecast,
  IMPACT_FORECAST_AUTHORITY,
  IMPACT_OBSERVATION_AUTHORITY,
  impactProducerAttestationPayload,
} from './impact-forecast.mjs';
import { digestCanonicalJson } from './receipt-trust.mjs';

const BASE = JSON.parse(`{
  "predictedAt":"2026-09-27T12:00:00Z","object":{"id":"feature.agent-actions","revision":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","environment":"production","workloadClass":"agent-workflow"},
  "decisionSnapshot":{"capturedAt":"2026-09-27T11:59:00Z","features":{"agentActions":true,"model":"fixture-v1"}},
  "exposure":{"cohort":"dogfood-to-full","riskClass":"bounded","rollbackSeconds":120,"scenarios":[{"id":"dogfood","maxUsers":10,"durationSeconds":3600,"maxConcurrency":50,"costBudgetUsd":25},{"id":"100-users","maxUsers":100,"durationSeconds":3600,"maxConcurrency":500,"costBudgetUsd":250},{"id":"1000-users","maxUsers":1000,"durationSeconds":3600,"maxConcurrency":5000,"costBudgetUsd":2500},{"id":"full","maxUsers":10000,"durationSeconds":3600,"maxConcurrency":50000,"costBudgetUsd":25000}]},
  "demand":{"eligibleUsers":10000,"adoption":{"p50":0.1,"p95":0.25,"p99":0.5},"eventsPerUser":{"p50":2,"p95":8,"p99":30},"fanout":1,"retryRate":0.05,"duplicateRate":0.01,"burstMultiplier":2},
  "dependencies":[{"id":"provider-quota","kind":"provider-quota","dependsOn":[],"unitsPerRequest":1,"currentLoadPerSecond":1,"capacityPerSecond":200,"baseLatencyMs":40,"unitCostUsd":0.001,"hardInvariant":true}],
  "value":{"activationRate":0.2,"unitValueUsd":5,"lagSeconds":86400},"policy":{"version":"impact-policy/v1","minHeadroomFraction":0.2,"maxErrorRate":0.01},
  "targets":[{"kind":"shipping-stall","maturitySeconds":3600},{"kind":"post-release-regression","maturitySeconds":86400},{"kind":"capacity-envelope-breach","maturitySeconds":0}],
  "sources":[{"key":"population","status":"observed","material":true,"ref":"record://fixture/population","observedAt":"2026-09-27T11:00:00Z","expiresAt":"2026-09-28T11:00:00Z"},{"key":"capacity","status":"observed","material":true,"ref":"record://fixture/capacity","observedAt":"2026-09-27T11:00:00Z","expiresAt":"2026-09-27T13:00:00Z"}],
  "lineage":{"priorForecastId":null,"calibrationRef":null,"policyDisposition":"initial"},"calibrationErrors":{"demand":0.1,"resourceLoad":0.1,"cost":0.1,"reliability":0.1,"value":0.1}
}`);
const fixture = () => structuredClone(BASE);
const FORECAST_KEYS = generateKeyPairSync('ed25519');
const OBSERVATION_KEYS = generateKeyPairSync('ed25519');
const attestation = (authority, digest, privateKey, immutable = true) => ({
  algorithm: 'ed25519',
  signature: signPayload(
    null,
    Buffer.from(impactProducerAttestationPayload(authority, digest, immutable)),
    privateKey
  ).toString('base64'),
});
const trustedForecast = receipt => ({
  authority: IMPACT_FORECAST_AUTHORITY,
  immutable: true,
  digest: digestCanonicalJson(receipt),
  receipt: structuredClone(receipt),
  attestation: attestation(
    IMPACT_FORECAST_AUTHORITY,
    digestCanonicalJson(receipt),
    FORECAST_KEYS.privateKey
  ),
});
const trustedObservation = observation => ({
  authority: IMPACT_OBSERVATION_AUTHORITY,
  immutable: true,
  digest: digestCanonicalJson(observation),
  observation: structuredClone(observation),
  attestation: attestation(
    IMPACT_OBSERVATION_AUTHORITY,
    digestCanonicalJson(observation),
    OBSERVATION_KEYS.privateKey
  ),
});
const calibrationContext = (
  receipt,
  observations,
  calibratedAt = '2026-09-29T12:00:00Z'
) => ({
  calibratedAt,
  forecastPublicKey: FORECAST_KEYS.publicKey,
  observationPublicKey: OBSERVATION_KEYS.publicKey,
  trustedForecasts: { [receipt.receiptId]: trustedForecast(receipt) },
  trustedObservations: Object.fromEntries(
    observations.map(observation => [
      observation.observationId,
      trustedObservation(observation),
    ])
  ),
});
const calibrate = (receipt, observations) =>
  calibrateImpactForecast(
    receipt.receiptId,
    observations.map(observation => observation.observationId),
    calibrationContext(receipt, observations)
  );

test('forecasts bounded exposure, bottlenecks, uncertainty and deduplication', () => {
  const baseline = createImpactForecast(fixture()).receipt;
  const bottlenecks = JSON.parse(
    '[ ["provider-quota",12], ["gbrain-throughput",10], ["database-connections",8], ["cache-miss-storm",6], ["host-io",4], ["token-cost-fanout",2] ]'
  );
  for (const [kind, capacity] of bottlenecks) {
    const input = fixture();
    Object.assign(input.dependencies[0], { id: kind, kind });
    input.dependencies[0].capacityPerSecond = capacity;
    if (kind === 'token-cost-fanout') input.demand.fanout = 8;
    if (kind === 'cache-miss-storm') {
      input.demand.eventsPerUser = { p50: 1, p95: 40, p99: 200 };
      input.demand.burstMultiplier = 5;
      input.demand.retryRate = 0.8;
      input.demand.fanout = 4;
    }
    const receipt = createImpactForecast(input).receipt;
    assert.equal(
      `${receipt.scenarios.at(-1).likelyBottleneck}:${receipt.recommendation.scenarioId === 'full'}`,
      `${kind}:false`
    );
    if (kind === 'cache-miss-storm')
      assert.ok(receipt.scenarios[1].distributions.queueDepth.p99 > 0);
  }
  const multipleResources = fixture();
  multipleResources.dependencies.push({
    ...structuredClone(multipleResources.dependencies[0]),
    id: 'database-connections',
    kind: 'database-connections',
    dependsOn: ['provider-quota'],
    capacityPerSecond: 5,
  });
  assert.equal(
    createImpactForecast(multipleResources).receipt.scenarios.at(-1)
      .likelyBottleneck,
    'database-connections'
  );
  const missing = fixture();
  missing.sources[1].status = 'missing';
  const canary = createImpactForecast(missing).receipt;
  assert.equal(
    `${canary.confidence.level}:${canary.recommendation.action}:${canary.recommendation.scenarioId}`,
    'low:instrumented-canary:dogfood'
  );
  const blocked = fixture();
  blocked.dependencies[0].capacityPerSecond = 0.01;
  assert.equal(
    createImpactForecast(blocked).receipt.recommendation.scenarioId,
    null
  );
  const duplicate = createImpactForecast(
    fixture(),
    [trustedForecast(baseline)],
    { forecastPublicKey: FORECAST_KEYS.publicKey }
  );
  assert.equal(
    `${baseline.recommendation.scenarioId}:${duplicate.disposition}:${duplicate.alert}:${duplicate.paidAnalysis}`,
    'full:reuse-existing:false:false'
  );
  const leaked = fixture();
  leaked.decisionSnapshot.capturedAt = '2026-09-27T12:01:00Z';
  assert.throws(() => createImpactForecast(leaked), /before prediction/u);
});

test('fails closed on incomplete or non-finite quantitative evidence', () => {
  const noTargets = fixture();
  noTargets.targets = [];
  assert.throws(() => createImpactForecast(noTargets), /identity required/u);

  const nullDemand = fixture();
  nullDemand.demand.adoption.p50 = null;
  assert.throws(() => createImpactForecast(nullDemand), /finite number/u);

  const zeroDuration = fixture();
  zeroDuration.exposure.scenarios[0].durationSeconds = 0;
  assert.throws(() => createImpactForecast(zeroDuration), /finite number/u);

  const unordered = fixture();
  unordered.demand.eventsPerUser.p95 = 1;
  assert.throws(() => createImpactForecast(unordered), /must be ordered/u);

  const zeroMedian = fixture();
  zeroMedian.demand.adoption.p50 = 0;
  zeroMedian.demand.eventsPerUser.p50 = 0;
  assert.deepEqual(createImpactForecast(zeroMedian).receipt.sensitivity, {
    eventsPerUser: null,
    adoption: null,
    fanoutBurst: 2,
  });

  const unknownDependency = fixture();
  unknownDependency.dependencies[0].dependsOn = ['not-declared'];
  assert.throws(
    () => createImpactForecast(unknownDependency),
    /another declared dependency/u
  );

  const overflow = fixture();
  overflow.value.unitValueUsd = Number.MAX_VALUE;
  assert.throws(
    () => createImpactForecast(overflow),
    /non-finite derived value/u
  );
});

test('binds exact receipt identity and rejects untrusted or tampered history', () => {
  const first = createImpactForecast(fixture()).receipt;
  const later = fixture();
  later.predictedAt = '2026-09-27T12:01:00Z';
  later.lineage.policyDisposition = 'retained';
  const second = createImpactForecast(later).receipt;
  assert.equal(first.forecastKey, second.forecastKey);
  assert.notEqual(first.receiptId, second.receiptId);
  assert.notEqual(first.receiptDigest, second.receiptDigest);

  assert.throws(
    () => createImpactForecast(fixture(), [first]),
    /trusted producer store/u
  );
  assert.throws(
    () =>
      createImpactForecast(fixture(), [trustedForecast(first)], {
        forecastPublicKey: {},
      }),
    /trusted producer store/u
  );
  const provisional = trustedForecast(first);
  provisional.attestation = attestation(
    IMPACT_FORECAST_AUTHORITY,
    provisional.digest,
    FORECAST_KEYS.privateKey,
    false
  );
  assert.throws(
    () =>
      createImpactForecast(fixture(), [provisional], {
        forecastPublicKey: FORECAST_KEYS.publicKey,
      }),
    /trusted producer store/u
  );
  const tampered = structuredClone(first);
  tampered.scenarios[0].distributions.arrivalRate.p50 = 0;
  assert.throws(
    () =>
      createImpactForecast(fixture(), [trustedForecast(tampered)], {
        forecastPublicKey: FORECAST_KEYS.publicKey,
      }),
    /trusted producer store/u
  );
});

test('never expands an observe scenario and emits policy stop thresholds', () => {
  const constrained = fixture();
  constrained.policy.minHeadroomFraction = 0.999;
  const receipt = createImpactForecast(constrained).receipt;
  assert.equal(receipt.confidence.level, 'high');
  assert.equal(
    receipt.scenarios.every(row => row.status === 'observe'),
    true
  );
  assert.equal(receipt.recommendation.action, 'instrumented-canary');
  assert.equal(receipt.recommendation.scenarioId, 'dogfood');
  assert.deepEqual(receipt.recommendation.stopConditions, {
    noExposure: false,
    capacityHeadroomFractionBelow: 0.999,
    errorRateAbove: 0.01,
    costUsdAbove: 25,
    concurrencyAbove: 50,
  });

  const noTemporalBasis = fixture();
  noTemporalBasis.dependencies[0].capacityPerSecond = 10;
  const full = createImpactForecast(noTemporalBasis).receipt.scenarios.at(-1);
  assert.equal(full.timeToCapacityBreachSeconds, null);
  assert.equal(
    full.timeToCapacityBreachBasis,
    'insufficient-temporal-evidence'
  );

  const immediate = fixture();
  immediate.dependencies[0].capacityPerSecond = 0.5;
  const blocked = createImpactForecast(immediate).receipt;
  assert.equal(blocked.scenarios[0].timeToCapacityBreachSeconds, 0);
  assert.equal(blocked.scenarios[0].timeToCapacityBreachBasis, 'at-exposure');
  assert.deepEqual(blocked.recommendation.stopConditions, {
    noExposure: true,
    capacityHeadroomFractionBelow: 0.2,
    errorRateAbove: 0.01,
    costUsdAbove: null,
    concurrencyAbove: null,
  });
});

function observed(receipt, id, minute, state = 'mature') {
  const scenario = receipt.scenarios.find(row => row.id === id);
  return {
    observationId: `observation-${id}-${minute}`,
    forecastId: receipt.receiptId,
    scenarioId: id,
    targetKind: 'post-release-regression',
    actionAt: `2026-09-27T12:0${minute}:00Z`,
    observedAt: `2026-09-28T12:1${minute}:00Z`,
    state,
    actual: {
      demand: scenario.distributions.arrivalRate.p50,
      resourceLoad: scenario.resources[0].load.p50,
      cost: scenario.distributions.costUsd.p50,
      reliability: scenario.distributions.errorRisk.p50,
      value: scenario.distributions.valueUsd.p50,
      capacityBreached: false,
    },
  };
}

test('binds prospective staged outcomes and calibrates dimensions independently', () => {
  const receipt = createImpactForecast(fixture()).receipt;
  const outcomes = [
    observed(receipt, 'dogfood', 1),
    observed(receipt, '100-users', 2),
    observed(receipt, '1000-users', 3),
    observed(receipt, 'full', 4, 'censored'),
  ];
  outcomes[0].actual.capacityBreached = true;
  outcomes[0].actual.capacityBreachedAt = '2026-09-27T12:05:00Z';
  const calibration = calibrate(receipt, outcomes);
  assert.equal(
    `${calibration.matureSampleSize}:${calibration.sufficientMatureEvidence}:${calibration.observations.at(-1).state}:${Object.keys(calibration.accuracy).join(',')}:${calibration.aggregateScore}`,
    '3:true:censored:demand,resourceLoad,cost,reliability,value:null'
  );
  const later = fixture();
  later.lineage.priorForecastId = receipt.receiptId;
  later.lineage.calibrationRef = calibration.calibrationId;
  later.lineage.policyDisposition = 'retained';
  assert.equal(
    createImpactForecast(later).receipt.lineage.calibrationRef,
    calibration.calibrationId
  );
  outcomes[0].actionAt = '2026-09-27T11:00:00Z';
  assert.throws(() => calibrate(receipt, outcomes), /retrospective/u);
});

test('rejects tampered, replayed, future and prematurely mature calibration', () => {
  const receipt = createImpactForecast(fixture()).receipt;
  const valid = observed(receipt, 'dogfood', 1);

  const untrustedTelemetry = calibrationContext(receipt, [valid]);
  untrustedTelemetry.trustedObservations[valid.observationId].digest =
    'invalid';
  assert.throws(
    () =>
      calibrateImpactForecast(
        receipt.receiptId,
        [valid.observationId],
        untrustedTelemetry
      ),
    /trusted telemetry store/u
  );

  const tampered = structuredClone(receipt);
  tampered.scenarios[0].distributions.arrivalRate.p50 = 0;
  assert.throws(
    () =>
      calibrateImpactForecast(
        receipt.receiptId,
        [valid.observationId],
        calibrationContext(tampered, [valid])
      ),
    /trusted producer store/u
  );

  const replay = structuredClone(valid);
  assert.throws(
    () =>
      calibrateImpactForecast(
        receipt.receiptId,
        [valid.observationId, replay.observationId],
        calibrationContext(receipt, [valid, replay])
      ),
    /duplicate observation id/u
  );

  const rebound = structuredClone(valid);
  rebound.observationId = 'observation-rebound';
  assert.throws(
    () =>
      calibrateImpactForecast(
        receipt.receiptId,
        [valid.observationId, rebound.observationId],
        calibrationContext(receipt, [valid, rebound])
      ),
    /duplicate exposure observation/u
  );

  const future = structuredClone(valid);
  future.observedAt = '2099-09-28T12:11:00Z';
  assert.throws(
    () =>
      calibrateImpactForecast(
        receipt.receiptId,
        [future.observationId],
        calibrationContext(receipt, [future])
      ),
    /future-label-leaking/u
  );

  const premature = structuredClone(valid);
  premature.observedAt = '2026-09-27T12:11:00Z';
  assert.throws(
    () =>
      calibrateImpactForecast(
        receipt.receiptId,
        [premature.observationId],
        calibrationContext(receipt, [premature])
      ),
    /not mature for target/u
  );

  const contradictory = structuredClone(valid);
  contradictory.actual.capacityBreachedAt = '2026-09-27T12:05:00Z';
  assert.throws(
    () =>
      calibrateImpactForecast(
        receipt.receiptId,
        [contradictory.observationId],
        calibrationContext(receipt, [contradictory])
      ),
    /requires capacityBreached=true/u
  );
});
