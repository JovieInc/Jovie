import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildQualitySaturationPlan,
  evaluateInvariantPromotion,
  projectQualityFrontier,
  recordQualitySaturationResult,
  selectMarginalWork,
} from './quality-ratchet.mjs';

const NOW = '2026-09-29T08:00:00.000Z';
const route = (id, overrides = {}) => ({
  id,
  provider: 'openai',
  model: 'codex-sol',
  harness: 'codex-cli',
  contextDigest: `context-${id}`,
  promptDigest: `prompt-${id}`,
  method: 'reproduce',
  reviewer: `reviewer-${id}`,
  ...overrides,
});
const pass = (
  id,
  stage,
  expectedMarginalValue,
  routeValue = route(id),
  overrides = {}
) => ({
  id,
  hypothesisId: id,
  hypothesis: `${id} can expose material uncertainty`,
  stage,
  dimension: 'correctness',
  route: routeValue,
  expectedMarginalValue,
  expectedInformationGain: 2,
  expectedDefectDiscoveryProbability: 0.25,
  cost: 1,
  latencyMinutes: 10,
  stopCondition: 'one bounded attempt or material finding',
  durableOutput: 'versioned evidence receipt',
  maxAttempts: 2,
  successMetric: 'defect discovery or calibrated uncertainty reduction',
  ...overrides,
});
const makeInput = (mode, maxParallelism, receipts = []) => ({
  object: { type: 'code-change', id: 'JOV-5956', revision: 'abc123' },
  baseCertification: {
    state: 'certified',
    predicate: 'base-suite-passes-at-abc123',
    evidenceRefs: ['ci://abc123'],
  },
  riskProfile: {
    consequence: 'high',
    risk: 'high',
    value: 90,
    materialUncertainty: 'long-tail route failure',
    fixedConstraints: 'safety privacy authority truthfulness',
  },
  capacity: {
    mode,
    forecastSurplus: 3,
    maxParallelism,
    minimumMarginalValue: 8,
    compatibleRoutes: ['verify', 'adversarial', 'disagree'],
    now: NOW,
    expiresAt: '2026-09-29T09:00:00.000Z',
  },
  passes: [
    pass('verify', 'verify-outcome', 20),
    pass('adversarial', 'search-counterexamples', 6),
    pass('disagree', 'seek-independent-disagreement', 3),
    pass(
      'disagree-copy',
      'seek-independent-disagreement',
      30,
      route('disagree'),
      { hypothesisId: 'disagree' }
    ),
  ],
  receipts,
});
describe('progressive quality saturation', () => {
  it('uses expiry pressure for deeper independent work without lowering the base predicate', () => {
    const normal = buildQualitySaturationPlan(makeInput('normal', 1));
    const fast = buildQualitySaturationPlan(makeInput('fast', 2));
    const emergency = buildQualitySaturationPlan(makeInput('emergency', 3));
    assert.equal(normal.recommendedPasses.length, 1);
    assert.equal(fast.recommendedPasses.length, 2);
    assert.equal(emergency.recommendedPasses.length, 3);
    assert.equal(emergency.qualityFrontier, 'seek-independent-disagreement');
    assert.equal(
      emergency.baseCertification.predicate,
      normal.baseCertification.predicate
    );
    assert.equal(
      emergency.rankedPasses.filter(row => row.hypothesisId === 'disagree')
        .length,
      1,
      'same prompt/model/context cannot count twice'
    );
  });
  it('routes a seeded defect through remediation and re-certification', () => {
    const plan = buildQualitySaturationPlan(makeInput('emergency', 3));
    const receipt = recordQualitySaturationResult(plan, 'adversarial', {
      completedAt: '2026-09-29T08:10:00.000Z',
      durableOutput: 'test://seeded-rollback-race',
      findings: ['rollback race loses the prior revision'],
      defectSeverity: 'high',
      correctedState: 'patch-ready',
      newEvidence: ['test://red-before-green-after'],
      actualInformationGain: 9,
      confidenceChange: -0.3,
      capacityConsumed: { routeUnits: 1, minutes: 10 },
      remediationCreated: 1,
      reusableArtifact: { id: 'rollback-race-check', kind: 'test' },
    });
    assert.equal(receipt.disposition, 'remediation-required');
    assert.equal(receipt.recertificationRequired, true);
    assert.equal(
      receipt.baseCertificationPredicate,
      'base-suite-passes-at-abc123'
    );
  });
  it('persists a negative result and discounts only that exact pass generator', () => {
    const plan = buildQualitySaturationPlan(makeInput('emergency', 3));
    const receipt = recordQualitySaturationResult(plan, 'adversarial', {
      completedAt: '2026-09-29T08:10:00.000Z',
      durableOutput: 'negative://adversarial-no-finding',
      actualInformationGain: 0,
      capacityConsumed: { routeUnits: 1, minutes: 10 },
    });
    const next = buildQualitySaturationPlan(
      makeInput('emergency', 3, [receipt])
    );
    const exact = next.rankedPasses.find(row => row.id === 'adversarial');
    const sibling = next.rankedPasses.find(row => row.id === 'disagree-copy');
    assert.equal(receipt.noInformation, true);
    assert.equal(exact.calibratedMarginalValue, 3.5);
    assert.equal(sibling.calibratedMarginalValue, 31);
  });
  it('chooses quality or breadth by compatible marginal value and explains why', () => {
    const plan = buildQualitySaturationPlan(makeInput('emergency', 3));
    const breadth = [
      {
        id: 'new-shallow-task',
        expectedMarginalValue: 10,
        compatibleRoutes: ['verify'],
      },
    ];
    assert.equal(selectMarginalWork(plan, breadth).kind, 'quality-saturation');
    breadth[0].expectedMarginalValue = 50;
    const selection = selectMarginalWork(plan, breadth);
    assert.equal(selection.kind, 'breadth');
    assert.match(selection.explanation, /50 beat 31/);
  });
  it('requires representative independent evidence before invariant promotion', () => {
    const plan = buildQualitySaturationPlan(makeInput('emergency', 3));
    const base = recordQualitySaturationResult(plan, 'adversarial', {
      completedAt: '2026-09-29T08:10:00.000Z',
      durableOutput: 'eval://rollback-race',
      findings: ['race found'],
      actualInformationGain: 5,
      capacityConsumed: { routeUnits: 1, minutes: 10 },
      reusableArtifact: { id: 'rollback-race-check', kind: 'eval' },
    });
    const proposal = {
      checkId: 'rollback-race-check',
      version: 2,
      scope: ['deployment-rollback'],
      authority: { owner: 'Summer', approvedBy: 'Founder' },
      rollback: 'supersede v2 with v1 and retain receipts',
    };
    assert.equal(evaluateInvariantPromotion(proposal, [base]).eligible, false);
    const receipts = [0, 1, 2].map(index => ({
      ...base,
      id: `${base.id}-${index}`,
      object: { ...base.object, id: `object-${index}` },
      independence: {
        ...base.independence,
        identity: `route-${index % 2}`,
      },
    }));
    const promoted = evaluateInvariantPromotion(proposal, receipts);
    assert.equal(promoted.eligible, true);
  });
  it('projects the frontier and rejects volume as a success metric', () => {
    const plan = buildQualitySaturationPlan(makeInput('emergency', 3));
    const projection = projectQualityFrontier(plan, [], 'approve scope change');
    assert.equal(projection.currentQualityFrontier, plan.qualityFrontier);
    assert.equal(projection.founderJudgmentRequired, 'approve scope change');
    const invalid = makeInput('normal', 1);
    invalid.passes[0].successMetric = 'token volume';
    assert.throws(() => buildQualitySaturationPlan(invalid), /success metric/);
  });
});
