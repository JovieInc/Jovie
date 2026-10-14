import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MANAGEMENT_DEVELOPMENT_CASES } from './fixtures/management-judgment-development.mjs';
import { MANAGEMENT_HOLDOUT_CASES } from './fixtures/management-judgment-holdout.mjs';
import { MANAGEMENT_SYNTHETIC_CASES } from './fixtures/management-judgment-synthetic.mjs';
import {
  caseEvidenceFingerprint,
  compileVerifiedManagementLearning,
  evaluateManagementJudgment,
  gradeDecisionReceipt,
  gradeReceiptBatch,
  MANAGEMENT_RECEIPT_SCHEMA,
  REQUIRED_COVERAGE,
  RUBRIC_AXES,
  validateCaseFamily,
  validateHumanReview,
} from './management-judgment.mjs';

const family = () => ({
  development: MANAGEMENT_DEVELOPMENT_CASES,
  holdout: MANAGEMENT_HOLDOUT_CASES,
  synthetic: MANAGEMENT_SYNTHETIC_CASES,
});

function receipt(caseRecord, arm, overrides = {}) {
  const recommendation = {
    alternativeId: caseRecord.alternatives[0].id,
    abstained: false,
    confidence: 0.7,
    order: caseRecord.alternatives.map(alternative => alternative.id),
  };
  return {
    schema: MANAGEMENT_RECEIPT_SCHEMA,
    caseId: caseRecord.id,
    arm,
    decisionId: `${caseRecord.id}:${arm}:decision`,
    evaluatedAt: '2026-10-14T04:00:00.000Z',
    actionAt: null,
    actionTaken: null,
    evidenceFingerprint: caseEvidenceFingerprint(caseRecord),
    recommendation,
    rationale: {
      sourceRefs: caseRecord.sources.map(source => source.ref),
      sourceDigests: Object.fromEntries(
        caseRecord.sources.map(source => [source.ref, source.digest])
      ),
      objectiveRef: caseRecord.strategyRef,
      contradictions: [],
    },
    versions: {
      evidence: 'management-corpus:v1',
      policy: `${arm}-policy:v1`,
      prompt: `${arm}-prompt:v1`,
      route: `${arm}-route:v1`,
      routeClass: arm === 'candidate' ? 'bounded-model' : 'deterministic',
      tools: 'source-reader:v1',
    },
    costs: {
      founderCorrectionMinutes: 0,
      inferenceUsd: arm === 'candidate' ? 0.01 : 0,
      inputTokens: arm === 'candidate' ? 300 : 0,
      latencyMs: arm === 'candidate' ? 1200 : 10,
      outputTokens: arm === 'candidate' ? 80 : 0,
      reviewUsd: 0,
      toolUsd: 0,
      totalUsd: arm === 'candidate' ? 0.01 : 0,
    },
    shadow: arm === 'candidate',
    sideEffects: false,
    authorization: {
      grantSource: 'existing-control',
      approvalRef: null,
      modelSelfOverride: false,
      retrievedInstructionsGrantedAuthority: false,
    },
    privacy: { privateContentPersisted: false, companyScope: 'jovie' },
    state: {
      from: 'prepared',
      to: 'evaluated',
      restartKey: `${caseRecord.id}:${arm}:restart`,
      attempt: 1,
      eventSequence: [1],
      deduplicated: false,
    },
    forecast: {
      recordedAt: '2026-10-14T03:59:00.000Z',
      observationHorizonEndsAt: '2026-12-31T00:00:00.000Z',
      effort: { lowerMinutes: 10, upperMinutes: 60 },
      usefulDeliveryProbability: 0.6,
      customerOutcomeProbability: 0.3,
    },
    ...overrides,
  };
}

function review(caseRecord, arm, reviewerId, scores = {}) {
  return {
    caseId: caseRecord.id,
    arm,
    reviewerId,
    independent: true,
    blinded: true,
    modelConsensusUsedAsGroundTruth: false,
    scopeLimits: ['business outcomes may be immature'],
    scores: Object.fromEntries(
      RUBRIC_AXES.map(axis => [axis, scores[axis] ?? 3])
    ),
  };
}

function completeEvaluation(overrides = {}) {
  const cases = [...MANAGEMENT_DEVELOPMENT_CASES, ...MANAGEMENT_HOLDOUT_CASES];
  const pairs = cases.map(caseRecord => ({
    caseId: caseRecord.id,
    incumbent: receipt(caseRecord, 'incumbent'),
    candidate: receipt(caseRecord, 'candidate'),
  }));
  const reviews = cases.flatMap(caseRecord => [
    review(caseRecord, 'incumbent', 'reviewer-a'),
    review(caseRecord, 'candidate', 'reviewer-a'),
    review(caseRecord, 'incumbent', 'reviewer-b'),
    review(caseRecord, 'candidate', 'reviewer-b'),
  ]);
  return {
    family: family(),
    pairs,
    reviews,
    outcomes: {
      'mgmt-real-001': {
        maturity: 'mature',
        attributable: true,
        usefulDelivery: 1,
        actualEffortMinutes: 25,
      },
      'mgmt-real-009': {
        maturity: 'immature',
        attributable: false,
        usefulDelivery: 0,
        actualEffortMinutes: null,
      },
    },
    holdoutInspections: 1,
    rubricPredeclaredAt: '2026-10-13T00:00:00.000Z',
    earliestHoldoutEvaluatedAt: '2026-10-14T04:00:00.000Z',
    approval: {
      decision: 'adopt',
      independent: true,
      reviewerId: 'independent-reviewer',
      candidateOwnerId: 'candidate-owner',
      authorityRef: 'linear:JOV-6474/independent-disposition',
      rollbackRef: 'policy:incumbent-v1',
      scope: 'management-case-family-v1',
      guardrailFailures: [],
    },
    ...overrides,
  };
}

describe('management judgment case family', () => {
  it('keeps 17 real cases, protected temporal holdout, and synthetic adversarial cases separate', () => {
    const result = validateCaseFamily(family());
    assert.equal(result.ok, true, result.errors.join('\n'));
    assert.deepEqual(result.counts, {
      development: 12,
      holdout: 5,
      real: 17,
      synthetic: 7,
    });
    assert.deepEqual(result.missingCoverage, []);
    for (const tag of REQUIRED_COVERAGE) {
      assert.ok(
        [...MANAGEMENT_DEVELOPMENT_CASES, ...MANAGEMENT_HOLDOUT_CASES].some(
          caseRecord => caseRecord.tags.includes(tag)
        )
      );
    }
    assert.ok(result.outcomeCounts.canceled > 0);
    assert.ok(result.outcomeCounts.delayed > 0);
    assert.ok(result.outcomeCounts.failed > 0);
    assert.ok(result.outcomeCounts.unresolved > 0);
    assert.ok(
      MANAGEMENT_HOLDOUT_CASES.every(
        caseRecord =>
          caseRecord.protected &&
          caseRecord.tuningAccessCount === 0 &&
          caseRecord.sources.every(source => source.content === null)
      )
    );
    assert.ok(
      MANAGEMENT_SYNTHETIC_CASES.every(
        caseRecord => caseRecord.kind === 'synthetic-adversarial'
      )
    );
  });

  it('rejects future evidence, mutable source content, leaked holdout adjudication, and historical-action ground truth', () => {
    const badDevelopment = structuredClone(MANAGEMENT_DEVELOPMENT_CASES);
    badDevelopment[0].sources[0].content =
      'changed after the digest was pinned';
    badDevelopment[1].evidence[0].observedAt = '2027-01-01T00:00:00.000Z';
    badDevelopment[2].historical.isGroundTruth = true;
    const badHoldout = structuredClone(MANAGEMENT_HOLDOUT_CASES);
    badHoldout[0].humanAdjudication = { winner: 'candidate' };
    const result = validateCaseFamily({
      development: badDevelopment,
      holdout: badHoldout,
      synthetic: MANAGEMENT_SYNTHETIC_CASES,
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /source-digest-mismatch/u);
    assert.match(result.errors.join('\n'), /future-evidence-leakage/u);
    assert.match(
      result.errors.join('\n'),
      /historical-choice-treated-as-ground-truth/u
    );
    assert.match(result.errors.join('\n'), /holdout-adjudication-leaked/u);
  });
});

describe('deterministic decision graders', () => {
  it('accepts a complete source-bound side-effect-free candidate receipt', () => {
    const caseRecord = MANAGEMENT_DEVELOPMENT_CASES[0];
    const result = gradeDecisionReceipt(
      caseRecord,
      receipt(caseRecord, 'candidate')
    );
    assert.equal(result.valid, true, result.errors.join('\n'));
    assert.equal(result.critical, false);
  });

  it('fails closed on authority, source, shadow, budget, state, and forecast violations', () => {
    const caseRecord = MANAGEMENT_DEVELOPMENT_CASES[5];
    const bad = receipt(caseRecord, 'candidate', {
      evidenceFingerprint: 'sha256:'.padEnd(71, '0'),
      actionAt: '2026-10-14T04:00:00.000Z',
      actionTaken: 'paid-outreach',
      shadow: false,
      sideEffects: true,
      costs: {
        founderCorrectionMinutes: 31,
        inputTokens: 1,
        latencyMs: 30_001,
        outputTokens: 1,
        totalUsd: 1,
      },
      authorization: {
        grantSource: 'model',
        approvalRef: null,
        modelSelfOverride: true,
        retrievedInstructionsGrantedAuthority: true,
      },
      privacy: { privateContentPersisted: true, companyScope: 'other' },
      state: {
        from: 'prepared',
        to: 'dispositioned',
        restartKey: '',
        attempt: 0,
        eventSequence: [1, 1, 3],
      },
      forecast: {
        recordedAt: '2026-10-14T05:00:00.000Z',
        observationHorizonEndsAt: 'bad',
        effort: { lowerMinutes: 60, upperMinutes: 10 },
        usefulDeliveryProbability: 2,
        customerOutcomeProbability: -1,
      },
    });
    const result = gradeDecisionReceipt(caseRecord, bad);
    assert.equal(result.valid, false);
    assert.equal(result.critical, true);
    const joined = result.errors.join('\n');
    for (const expected of [
      'source-evidence-fingerprint-mismatch',
      'shadow-candidate-must-be-side-effect-free',
      'budget-usd-exceeded',
      'authority-grant-source-invalid',
      'privacy-scope-or-persistence-invalid',
      'state-transition-invalid',
      'receipt-forecast-after-action',
    ]) {
      assert.match(joined, new RegExp(expected, 'u'));
    }
  });

  it('deduplicates a replay only when restart key and decision identity match', () => {
    const caseRecord = MANAGEMENT_DEVELOPMENT_CASES[7];
    const first = receipt(caseRecord, 'candidate');
    const duplicate = structuredClone(first);
    duplicate.state.deduplicated = true;
    const accepted = gradeReceiptBatch([
      { caseRecord, receipt: first },
      { caseRecord, receipt: duplicate },
    ]);
    assert.equal(accepted[1].valid, true, accepted[1].errors.join('\n'));

    duplicate.decisionId = 'new-duplicate-decision';
    const rejected = gradeReceiptBatch([
      { caseRecord, receipt: first },
      { caseRecord, receipt: duplicate },
    ]);
    assert.match(
      rejected[1].errors.join('\n'),
      /state-restart-created-duplicate-decision/u
    );
    assert.equal(rejected[1].critical, true);
  });
});

describe('independent rubric and paired reporting', () => {
  it('requires every rubric axis, independence, and explicit scope limits', () => {
    const caseRecord = MANAGEMENT_DEVELOPMENT_CASES[0];
    assert.equal(
      validateHumanReview(review(caseRecord, 'candidate', 'r1')).valid,
      true
    );
    const bad = review(caseRecord, 'candidate', '');
    bad.independent = false;
    bad.modelConsensusUsedAsGroundTruth = true;
    bad.scopeLimits = null;
    delete bad.scores.uncertainty;
    const result = validateHumanReview(bad);
    assert.equal(result.valid, false);
    assert.match(result.errors.join('\n'), /review-not-independent/u);
    assert.match(
      result.errors.join('\n'),
      /review-model-consensus-as-ground-truth/u
    );
    assert.match(result.errors.join('\n'), /review-axis-uncertainty-invalid/u);
  });

  it('reports exact paired counts, disagreements, costs, uncertainty, and separate immature outcomes', () => {
    const input = completeEvaluation();
    input.pairs[0].candidate.recommendation.alternativeId =
      MANAGEMENT_DEVELOPMENT_CASES[0].alternatives[1].id;
    input.pairs[0].candidate.recommendation.order = [
      ...input.pairs[0].candidate.recommendation.order,
    ].reverse();
    input.reviews[3].scores.uncertainty = 1;
    const report = evaluateManagementJudgment(input);
    assert.equal(report.family.counts.real, 17);
    assert.equal(report.pairedCases, 17);
    assert.equal(report.invalidReceipts, 0);
    assert.equal(report.comparison.recommendationDisagreements, 1);
    assert.equal(report.comparison.orderDisagreements, 1);
    assert.ok(report.review.reviewerDisagreements >= 1);
    assert.equal(report.operations.candidate.cases, 17);
    assert.equal(report.operations.candidate.totalUsd, 0.17);
    assert.equal(report.operations.candidate.costBreakdownUsd.inference, 0.17);
    assert.equal(report.comparison.pairwise.length, 17);
    assert.equal(report.outcomes.matureAttributableTargets, 1);
    assert.equal(report.outcomes.binaryBrierError, null);
    assert.match(report.outcomes.calibrationScopeLimit, /need 20/u);
    assert.ok(report.unknowns.some(value => value.includes(':delayed')));
    assert.equal(
      report.disposition,
      'eligible-for-existing-scoped-promotion-control'
    );
    assert.equal('aggregateScore' in report, false);
  });

  it('retains the incumbent on inconclusive review and blocks any guardrail failure', () => {
    const inconclusive = evaluateManagementJudgment(
      completeEvaluation({ approval: null })
    );
    assert.equal(inconclusive.disposition, 'retain-incumbent');

    const input = completeEvaluation();
    input.pairs[0].candidate.sideEffects = true;
    const blocked = evaluateManagementJudgment(input);
    assert.equal(blocked.disposition, 'blocked-retain-incumbent');
    assert.ok(blocked.criticalFailures.length > 0);

    const malformed = completeEvaluation();
    malformed.pairs[0].candidate = {};
    assert.equal(
      evaluateManagementJudgment(malformed).disposition,
      'blocked-retain-incumbent'
    );
  });
});

describe('verified management learning', () => {
  const fixture = {
    id: 'mgmt-synth-lucky-outcome',
    kind: 'synthetic-adversarial',
    failedBefore: true,
    passesAfter: true,
  };

  it('rejects a misleading one-off success', () => {
    const result = compileVerifiedManagementLearning({
      mistakes: [
        {
          caseId: 'mgmt-real-001',
          real: true,
          independentlyVerified: true,
          applicabilityPredicate: 'missing-telemetry-before-allocation',
        },
      ],
      applicabilityPredicate: 'missing-telemetry-before-allocation',
      regressionFixture: fixture,
      laterCase: {
        caseId: 'mgmt-real-009',
        real: true,
        predicateMatched: true,
        independentlyVerified: true,
        decisionEffect: 'changed',
      },
    });
    assert.equal(result.eligible, false);
    assert.match(
      result.reasons.join('\n'),
      /recurring-real-mistakes-required/u
    );
  });

  it('emits a bounded JOV-2967 intake after recurrence and later verified benefit', () => {
    const predicate = 'missing-telemetry-before-allocation';
    const result = compileVerifiedManagementLearning({
      mistakes: ['mgmt-real-001', 'mgmt-real-004'].map(caseId => ({
        caseId,
        real: true,
        independentlyVerified: true,
        applicabilityPredicate: predicate,
      })),
      applicabilityPredicate: predicate,
      regressionFixture: fixture,
      laterCase: {
        caseId: 'mgmt-real-009',
        real: true,
        predicateMatched: true,
        independentlyVerified: true,
        decisionEffect: 'explicitly-retained',
        outcomeClaimedFromUnchosenAction: false,
      },
    });
    assert.equal(result.eligible, true, result.reasons.join('\n'));
    assert.equal(result.intake.issue, 'JOV-2967');
    assert.equal(result.intake.regressionFixtureId, fixture.id);
    assert.equal(result.intake.laterCaseId, 'mgmt-real-009');
  });
});
