import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateProductQualityReceipt,
  PRODUCT_QUALITY_CAPABILITY_ID,
  PRODUCT_QUALITY_GOVERNOR_SCHEMA,
  PRODUCT_QUALITY_TRUST_BLOCKER,
} from './product-quality-governor.mjs';
import { digestCanonicalJson } from './receipt-trust.mjs';

const sourceVersion = 'a'.repeat(40);
const sourceTreeDigest = 'b'.repeat(64);
const packetDigest = 'c'.repeat(64);
const defectClass = 'onboarding-composer-recovery';
const suiteVersion = 'public-onboarding-quality/v1';
const selectorRef = 'ci://affected-tests/product-quality-governor';
const now = Date.parse('2026-09-02T01:02:00.000Z');

/**
 * @template {Record<string, unknown>} T
 * @param {string} [status]
 * @param {T} [overrides]
 * @returns {{status: string, ref: string} & T}
 */
function evidence(status = 'passed', overrides = /** @type {T} */ ({})) {
  return { status, ref: 'artifact://quality/evidence', ...overrides };
}

function quality(name, values) {
  return evidence('passed', { ref: `artifact://quality/${name}`, ...values });
}

function invariantProof(status, ref, values = {}) {
  return {
    status,
    ref,
    suiteVersion,
    defectClass,
    selectorRef,
    sourceVersion,
    ...values,
  };
}

function certificationEvidence(kind) {
  return {
    id: `${kind}-proof`,
    kind,
    status: 'passed',
    deterministic: true,
    sourceSha: sourceVersion,
    subjectVersion: 'public-onboarding/v1',
    invariantSuiteVersion: suiteVersion,
    environmentVersion: 'deployment-public-onboarding-001',
    collectedAt: '2026-09-02T01:00:00.000Z',
    validUntil: '2026-09-03T01:00:00.000Z',
    artifacts: [{ ref: `artifact://certification/${kind}` }],
  };
}

function validReceipt() {
  return {
    schema: PRODUCT_QUALITY_GOVERNOR_SCHEMA,
    capabilityId: PRODUCT_QUALITY_CAPABILITY_ID,
    pilotId: 'public-onboarding',
    sourceVersion,
    sourceTreeDigest,
    verificationPacketDigest: packetDigest,
    environmentVersion: 'deployment-public-onboarding-001',
    startedAt: '2026-09-02T00:59:00.000Z',
    completedAt: '2026-09-02T01:01:00.000Z',
    trigger: {
      kind: 'release',
      eventRef: 'release://deployment-public-onboarding-001',
    },
    privacy: {
      syntheticOrDisposableFixture: true,
      productionWrites: false,
      personalConversationDataRetained: false,
      credentialRead: false,
      externalMessages: false,
      arbitraryUserContentCaptured: false,
    },
    scope: { paths: ['/start'], maxPaths: 1 },
    cost: { syntheticTurns: 1, runtimeMs: 60_000, llmVisualReviews: 0 },
    evidence: {
      pathCompletion: quality('path-completion', {
        completed: true,
        firstTurnResolvedMs: 12_000,
      }),
      contentProvenance: quality('content-provenance', {
        claimsSourceBound: true,
        unverifiedClaims: 0,
      }),
      responsiveness: quality('responsiveness', {
        performanceScore: 0.95,
        firstContentfulPaintMs: 900,
        largestContentfulPaintMs: 1800,
        totalBlockingTimeMs: 200,
        timeToInteractiveMs: 2800,
        cumulativeLayoutShift: 0.01,
        viewportResults: ['mobile-320', 'mobile-390', 'desktop-1440'].map(
          viewport => ({ viewport, path: '/start', status: 'passed' })
        ),
      }),
      accessibility: quality('accessibility', {
        score: 0.96,
        blockingViolations: 0,
        checks: [
          'lighthouse',
          'keyboard',
          'focus',
          'name-role',
          'responsive-a11y',
        ].map(check => ({ check, status: 'passed' })),
      }),
      localization: quality('localization', {
        locales: ['en-US'],
        overflowFailures: 0,
      }),
      visualQuality: quality('visual-quality', {
        snapshotComparison: 'passed',
        modelTasteUsed: false,
        baselineDigest: `sha256:${'d'.repeat(64)}`,
        path: '/start',
        locale: 'en-US',
        viewport: 'mobile-390',
      }),
      recovery: quality('recovery', {
        composerRecovered: true,
        consoleErrors: 0,
        criticalRequestFailures: 0,
      }),
      buildProvenance: quality('build-provenance', {
        sourceVersion,
        environmentVersion: 'deployment-public-onboarding-001',
      }),
    },
    verificationReceiptRef: 'record://verification/public-onboarding-001',
    certificationReceiptRef: 'record://certification/public-onboarding-001',
    classification: quality('classification', {
      freshReproduction: true,
      screenshotDisposition: 'reproduced_defect',
      defectClass,
      observedAt: '2026-09-02T00:59:10.000Z',
    }),
    candidate: quality('candidate', {
      riskClass: 'machine_eligible',
      path: '/start',
      defectClass,
      changeBoundary: 'composer recovery state only',
      measurementMetric: 'composer_recovery_failures',
      measurementDirection: 'decrease',
    }),
    dispatch: {
      requested: true,
      capability: 'product-quality-remediation',
      capabilityBounded: true,
      ref: 'symphony://dispatch/public-onboarding-001',
      candidateRef: 'artifact://quality/candidate',
    },
    founderReview: { required: false, projectionRef: null },
    outcome: quality('outcome', {
      metric: 'composer_recovery_failures',
      before: 1,
      after: 0,
      improved: true,
    }),
    invariant: quality('invariant', {
      suiteVersion,
      selectorRef,
      independentReview: invariantProof(
        'passed',
        'review://quality/invariant-001'
      ),
      deliberateRed: invariantProof(
        'failed_as_expected',
        'test://quality/deliberate-red',
        {
          rejected: true,
          expectedFailureCode: 'wrong-build',
        }
      ),
      corrected: invariantProof('passed', 'test://quality/corrected-green'),
      neighbor: invariantProof(
        'passed',
        'test://quality/narrow-viewport-green',
        { path: '/start', boundary: 'mobile-320' }
      ),
    }),
    verificationFixture: {
      schema: 'jovie-verification-execution/v1',
      featureId: 'public-onboarding',
      packetDigest,
      sourceSha: sourceVersion,
      sourceTreeDigest,
      startedAt: '2026-09-02T00:59:20.000Z',
      completedAt: '2026-09-02T00:59:50.000Z',
      outcome: 'passed',
      safetyClaim: 'Synthetic signed-out fixture; output-only writes.',
      blastRadius: { route: ['/start'], writes: ['output/verification only'] },
      phases: ['Launch', 'Doctor', 'Drive', 'Evidence', 'Cleanup'].map(
        name => ({
          name,
          status: 'passed',
        })
      ),
      artifacts: {
        screenshot: 'artifact://verification/screenshot',
        trace: 'artifact://verification/trace',
        journey: 'artifact://verification/journey',
      },
    },
    certificationFixture: {
      contract: 'jovie.certification/v1',
      digest: `sha256:${'e'.repeat(64)}`,
      state: 'certified',
      subject: {
        id: 'public-onboarding',
        kind: 'task',
        sourceSha: sourceVersion,
        version: 'public-onboarding/v1',
        paths: ['/start'],
      },
      invariantSuiteVersion: suiteVersion,
      environment: { version: 'deployment-public-onboarding-001' },
      assessedAt: '2026-09-02T01:00:00.000Z',
      validUntil: '2026-09-03T01:00:00.000Z',
      blockers: [],
      invalidations: [],
      artifacts: [],
      evidence: ['deterministic', 'visual', 'behavior', 'a11y', 'runtime'].map(
        certificationEvidence
      ),
    },
  };
}

function evaluate(input, { bindClaims = true, trusted = true } = {}) {
  const receipt = structuredClone(input);
  const verification = receipt.verificationFixture;
  const certification = receipt.certificationFixture;
  delete receipt.verificationFixture;
  delete receipt.certificationFixture;
  const verificationDigest = digestCanonicalJson(verification);
  const claims = [
    ...Object.values(receipt.evidence),
    receipt.classification,
    receipt.candidate,
    receipt.dispatch,
    receipt.outcome,
    receipt.invariant,
  ];
  if (bindClaims) {
    certification.artifacts = [
      ...claims.map(claim => ({
        ref: claim.ref,
        digest: `sha256:${digestCanonicalJson(claim)}`,
      })),
      {
        ref: receipt.verificationReceiptRef,
        digest: `sha256:${verificationDigest}`,
      },
    ];
  }
  const trustedReceipts = trusted
    ? {
        verification: {
          [receipt.verificationReceiptRef]: {
            authority: 'pstack-verifier',
            immutable: true,
            producerAttestation: 'verified',
            digest: verificationDigest,
            receipt: verification,
          },
        },
        certification: {
          [receipt.certificationReceiptRef]: {
            authority: 'governed-certification',
            immutable: true,
            producerAttestation: 'verified',
            digest: digestCanonicalJson(certification),
            canonicalEvaluation: {
              digest: certification.digest,
              state: certification.state,
            },
            receipt: certification,
          },
        },
      }
    : undefined;
  return evaluateProductQualityReceipt(receipt, { now, trustedReceipts });
}

test('keeps a complete machine candidate blocked on canonical integration', () => {
  assert.deepEqual(evaluate(validReceipt()), {
    outcome: 'blocked',
    owner: 'Summer',
    blockers: [PRODUCT_QUALITY_TRUST_BLOCKER],
  });
});

test('deliberate red rejects native verification bound to the wrong source', () => {
  const receipt = validReceipt();
  receipt.verificationFixture.sourceSha = 'f'.repeat(40);
  const result = evaluate(receipt);
  assert.equal(result.outcome, 'failed');
  assert.match(result.blockers.join('\n'), /exact source/u);
});

test('rejects privacy leakage, blind sweeps, and unbounded model review cost', () => {
  const cases = [
    receipt => {
      receipt.privacy.personalConversationDataRetained = true;
    },
    receipt => {
      receipt.scope.paths = ['/start', '/pricing'];
    },
    receipt => {
      receipt.cost.llmVisualReviews = 1;
    },
    receipt => {
      receipt.trigger = {
        kind: 'periodic_sample',
        eventRef: null,
        periodicSamplesToday: 2,
      };
    },
  ];
  for (const mutate of cases) {
    const receipt = validReceipt();
    mutate(receipt);
    assert.equal(evaluate(receipt).outcome, 'failed');
  }
});

test('routes taste-sensitive ambiguity to Ovie but keeps integration blocked', () => {
  const receipt = validReceipt();
  Object.assign(receipt.candidate, { riskClass: 'taste_sensitive' });
  Object.assign(receipt.dispatch, { requested: false });
  receipt.founderReview = {
    required: true,
    projectionRef: 'ovie://founder-review/public-onboarding-001',
  };
  assert.deepEqual(evaluate(receipt), {
    outcome: 'blocked',
    owner: 'Ovie',
    blockers: [PRODUCT_QUALITY_TRUST_BLOCKER],
  });
});

test('blocks hard safety boundaries before Symphony dispatch', () => {
  const receipt = validReceipt();
  Object.assign(receipt.candidate, {
    riskClass: 'hard_boundary',
    blockedReason: 'consent boundary requires human authority',
  });
  Object.assign(receipt.dispatch, { requested: false });
  assert.deepEqual(evaluate(receipt), {
    outcome: 'blocked',
    owner: 'Summer',
    blockers: ['consent boundary requires human authority'],
  });
});

test('requires independent review, deliberate red, and a legitimate neighbor green', () => {
  for (const field of [
    'independentReview',
    'deliberateRed',
    'corrected',
    'neighbor',
  ]) {
    const receipt = validReceipt();
    receipt.invariant[field] = null;
    const result = evaluate(receipt);
    assert.equal(result.outcome, 'failed');
    assert.match(result.blockers.join('\n'), new RegExp(field, 'u'));
  }
});

test('rejects fictional, stale, wrong-route, and cross-build native receipts', () => {
  const cases = [
    receipt => {
      receipt.verificationFixture = {
        schema: 'jovie-verification-execution/v1',
      };
    },
    receipt => {
      receipt.verificationFixture.featureId = 'signup-auth-shell';
    },
    receipt => {
      receipt.verificationFixture.blastRadius.route = ['/signup'];
    },
    receipt => {
      receipt.verificationFixture.blastRadius.route = ['/start', '/billing'];
    },
    receipt => {
      receipt.verificationFixture.phases.find(
        phase => phase.name === 'Cleanup'
      ).status = 'failed';
    },
    receipt => {
      receipt.certificationFixture.state = 'stale';
    },
    receipt => {
      receipt.certificationFixture.validUntil = '2026-09-02T01:01:00.000Z';
    },
    receipt => {
      receipt.certificationFixture.subject.sourceSha = 'f'.repeat(40);
    },
    receipt => {
      receipt.certificationFixture.subject.paths = ['/start', '/billing'];
    },
    receipt => {
      receipt.certificationFixture.evidence[0].invariantSuiteVersion =
        'foreign-suite/v1';
    },
  ];
  for (const mutate of cases) {
    const receipt = validReceipt();
    mutate(receipt);
    assert.equal(evaluate(receipt).outcome, 'failed');
  }
});

test('fails closed without trusted producers or claim-bound certification', () => {
  assert.match(
    evaluate(validReceipt(), { trusted: false }).blockers.join('\n'),
    /trusted producer store/u
  );
  assert.match(
    evaluate(validReceipt(), { bindClaims: false }).blockers.join('\n'),
    /digest-bound/u
  );
});

test('derives improvement and rejects reused invariant proof references', () => {
  const unchanged = validReceipt();
  unchanged.outcome.after = unchanged.outcome.before;
  assert.match(evaluate(unchanged).blockers.join('\n'), /measurably improve/u);

  const reused = validReceipt();
  reused.invariant.neighbor.ref = reused.invariant.corrected.ref;
  assert.match(
    evaluate(reused).blockers.join('\n'),
    /references must be distinct/u
  );
});
