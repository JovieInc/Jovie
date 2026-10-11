import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calibrateImpactForecast,
  createImpactForecast,
} from './impact-forecast.mjs';

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
  const duplicate = createImpactForecast(fixture(), [baseline]);
  assert.equal(
    `${baseline.recommendation.scenarioId}:${duplicate.disposition}:${duplicate.alert}:${duplicate.paidAnalysis}`,
    'full:reuse-existing:false:false'
  );
  const leaked = fixture();
  leaked.decisionSnapshot.capturedAt = '2026-09-27T12:01:00Z';
  assert.throws(() => createImpactForecast(leaked), /before prediction/u);
});

function observed(receipt, id, minute, state = 'mature') {
  const scenario = receipt.scenarios.find(row => row.id === id);
  return {
    forecastId: receipt.receiptId,
    scenarioId: id,
    actionAt: `2026-09-27T12:0${minute}:00Z`,
    observedAt: `2026-09-27T12:1${minute}:00Z`,
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
  const calibration = calibrateImpactForecast(receipt, outcomes);
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
  assert.throws(
    () => calibrateImpactForecast(receipt, outcomes),
    /retrospective/u
  );
});
