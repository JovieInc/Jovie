import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  WRITING_QUALITY_CALIBRATION,
  WRITING_QUALITY_RUBRICS,
} from './jev-writing-quality.mjs';
import {
  evaluateWritingReadiness,
  writingEvidenceDigest as hash,
  WRITING_EVIDENCE_SCHEMA,
} from './jev-writing-readiness.mjs';
import { readWritingSurfacesRegistry } from './writing-surfaces.mjs';

test('missing evidence retains observation without claiming runtime proof', () => {
  const result = evaluateWritingReadiness({});
  assert.equal(result.disposition, 'denied');
  assert.equal(result.mode, 'observation');
  assert.equal(result.enforcementEnabled, false);
  assert.equal(result.trafficEnabled, false);
  assert.equal(result.sendAuthorized, false);
  assert.equal(result.proof.deployedBuild.status, 'absent');
  assert.equal(result.proof.observedRuntime.status, 'absent');
  assert.equal(result.handoff, null);
});

const NOW = 10_000;
const window = { issuedAt: 1_000, expiresAt: 20_000 };
const sha = value => hash(value);
const surface = readWritingSurfacesRegistry().surfaces.find(
  s => s.id === 'chat-persona'
);

// Explicitly synthetic owner projections. No live quality/authority evidence.
function fixture() {
  const target = {
    sourceSha: 'a'.repeat(40),
    surfaceId: surface.id,
    policyVersion: surface.policyVersion,
    implementationSha256: sha('writer + controller'),
    artifactSha256: sha('pilot artifact'),
    evidenceSha256: sha('evidence'),
    rubricSha256: hash(WRITING_QUALITY_RUBRICS),
    corpusSha256: sha('corpus'),
    labelsSha256: sha('labels'),
    resolvedModel: 'synthetic/jev-resolved-version',
    writerModel: 'synthetic/writer-resolved-version',
    audience: surface.audience,
    destination: 'fixture:buffered-onboarding',
    artifactKind: 'generated-message',
    templateChanges: [],
  };
  const envelope = (kind, issue, receiptId) => ({
    kind,
    issue,
    receiptId,
    ...window,
    ownerRef: 'fixture:trusted-owner',
    targetDigest: hash(target),
  });
  const calibration = {
    ...envelope('calibration', 'JOV-6476', 'calibration-1'),
    status: 'calibrated',
    version: 'fixture-calibration-v1',
    decision: 'eligible-for-bounded-canary',
    minConfidence: /** @type {Record<string, number>} */ ({
      ...WRITING_QUALITY_CALIBRATION.minConfidence,
    }),
    heldout: {
      humanLabelsApprovalRef: 'fixture:source-owner-labels',
      labelProvenance: 'human-adjudicated',
      tuningDocumentIds: ['doc-tuning'],
      holdoutDocumentIds: ['doc-holdout'],
      excludedFromWriterPrompts: true,
      digest: sha('holdout'),
      predeclaredLimitsDigest: sha('limits'),
      limitsDeclaredAt: 100,
      openedAt: 500,
    },
  };
  const pilotReceipts = [
    {
      ...envelope('pilot-receipt', 'JOV-3722', 'pilot-1'),
      status: 'reviewed',
      execution: 'gateway',
      calibrationDigest: hash(calibration),
      calibrationVersion: calibration.version,
    },
  ];
  const report = {
    ...envelope('quality-report', 'JOV-8414', 'report-1'),
    status: 'eligible-for-bounded-canary',
    execution: 'gateway',
    calibrationDigest: hash(calibration),
    pilotReceiptDigests: pilotReceipts.map(hash),
    heldoutDigest: calibration.heldout.digest,
    predeclaredLimitsDigest: calibration.heldout.predeclaredLimitsDigest,
    heldoutCount: 200,
    comparisonPassed: true,
    criticalFixturesPassed: true,
    protectedMetricsPassed: true,
  };
  const approval = {
    ...window,
    status: 'approved',
    targetDigest: hash(target),
    receiptRef: 'fixture:approval',
  };
  const admission = {
    ...envelope('canary-admission', 'JOV-6414', 'admission-1'),
    status: 'admitted',
    authorityRef: 'fixture:existing-admission-owner',
    reportDigest: hash(report),
    calibrationDigest: hash(calibration),
    pilotReceiptDigests: pilotReceipts.map(hash),
    fundingApproval: { ...approval },
    privacyApproval: { ...approval },
    allowance: {
      cohortIds: ['fixture-cohort'],
      maxCohortSize: 10,
      usedCohortSize: 0,
      maxCalls: 5,
      usedCalls: 0,
      maxSpendUsd: 1,
      spentUsd: 0,
      nextCallUpperBoundUsd: 0.01,
    },
    monitoring: { ...window, receiptRef: 'fixture:monitor', status: 'healthy' },
    rollback: {
      ...window,
      receiptRef: 'fixture:rollback',
      targetRef: 'fixture:certified-incumbent',
      certified: true,
      eligible: true,
    },
    killSwitch: {
      ...window,
      receiptRef: 'fixture:kill-switch',
      tested: true,
      active: false,
    },
    protectedMetricRegression: false,
    cancelled: false,
  };
  return {
    schema: WRITING_EVIDENCE_SCHEMA,
    target,
    calibration,
    pilotReceipts,
    report,
    admission,
    hostedCi: {
      ...window,
      status: 'passed',
      sourceSha: target.sourceSha,
      receiptRef: 'fixture:hosted-ci',
    },
  };
}
const evaluate = (input, options = {}) =>
  evaluateWritingReadiness(input, { now: NOW, ...options });
function denied(input, reason, options) {
  const result = evaluate(input, options);
  assert.equal(result.disposition, 'denied');
  assert.ok(result.reasons.includes(reason), JSON.stringify(result.reasons));
  assert.equal(result.mode, 'observation');
  assert.equal(result.handoff, null);
  assert.equal(
    result.enforcementEnabled || result.trafficEnabled || result.sendAuthorized,
    false
  );
  return result;
}
// Rebind downstream identities after changing source-owner evidence. This tests
// policy checks independently of accidental stale hash failures.
function rebind(input) {
  const targetDigest = hash(input.target);
  for (const record of [
    input.calibration,
    input.report,
    input.admission,
    ...input.pilotReceipts,
  ])
    record.targetDigest = targetDigest;
  input.admission.fundingApproval.targetDigest = targetDigest;
  input.admission.privacyApproval.targetDigest = targetDigest;
  const calibrationDigest = hash(input.calibration);
  input.pilotReceipts.forEach(receipt => {
    receipt.calibrationDigest = calibrationDigest;
  });
  input.report.calibrationDigest = calibrationDigest;
  input.report.pilotReceiptDigests = input.pilotReceipts.map(hash);
  input.admission.calibrationDigest = calibrationDigest;
  input.admission.pilotReceiptDigests = input.pilotReceipts.map(hash);
  input.admission.reportDigest = hash(input.report);
  return input;
}

test('exact calibrated evidence produces only an immutable bounded-owner handoff', () => {
  const input = fixture();
  const before = structuredClone(input);
  const result = evaluate(input);
  assert.equal(result.disposition, 'promotion-candidate');
  assert.deepEqual(result.reasons, []);
  assert.equal(result.handoff.promotionOwnerIssue, 'JOV-6414');
  assert.equal(result.handoff.deliveryBoundaryIssue, 'JOV-3723');
  assert.equal(result.handoff.requiresDispatchRevalidation, true);
  assert.equal(result.handoff.reportDigest, hash(input.report));
  assert.deepEqual(
    result.handoff.pilotReceiptDigests,
    input.pilotReceipts.map(hash)
  );
  assert.equal(result.evidence.calibration.receiptId, 'calibration-1');
  assert.equal(result.handoff.expiresAt, 20_000);
  assert.equal(result.mode, 'observation');
  assert.equal(
    result.enforcementEnabled || result.trafficEnabled || result.sendAuthorized,
    false
  );
  assert.equal(result.proof.localPreparation.status, 'prepared');
  assert.equal(result.proof.hostedCi.status, 'passed');
  assert.equal(result.proof.deployedBuild.status, 'absent');
  assert.equal(result.proof.observedRuntime.status, 'absent');
  assert.deepEqual(input, before);
  assert.throws(() => {
    result.handoff.targetDigest = 'changed';
  }, TypeError);
  assert.deepEqual(evaluate(input), result); // Repeated evaluation consumes no allowance.
});

for (const [key, reason] of [
  ['calibration', 'calibration-missing-stale-or-uncalibrated'],
  ['report', 'quality-report-missing-stale-or-inconclusive'],
  ['pilotReceipts', 'pilot-receipts-missing-stale-or-mismatched'],
  ['admission', 'existing-canary-admission-missing-stale-or-mismatched'],
  ['hostedCi', 'exact-head-hosted-ci-absent'],
])
  test(`missing ${key} cannot propose promotion`, () => {
    const input = fixture();
    delete input[key];
    denied(input, reason);
  });

for (const key of ['calibration', 'report', 'admission', 'hostedCi']) {
  for (const timing of ['expired', 'future', 'malformed'])
    test(`${timing} ${key} stays denied`, () => {
      const input = fixture();
      if (timing === 'expired') input[key].expiresAt = NOW;
      if (timing === 'future') input[key].issuedAt = NOW + 1;
      if (timing === 'malformed') input[key].issuedAt = 'yesterday';
      assert.equal(evaluate(input).disposition, 'denied');
    });
}
for (const field of [
  'surfaceId',
  'resolvedModel',
  'writerModel',
  'rubricSha256',
  'policyVersion',
  'sourceSha',
  'implementationSha256',
  'corpusSha256',
  'labelsSha256',
  'artifactSha256',
  'evidenceSha256',
  'audience',
  'destination',
]) {
  test(`a changed ${field} invalidates exact evidence`, () => {
    const input = fixture();
    input.target[field] = field.endsWith('Sha256')
      ? sha('changed')
      : `${input.target[field]}-changed`;
    assert.equal(evaluate(input).disposition, 'denied');
  });
}

test('wrong-surface calibration fails even when its own artifact is otherwise valid', () => {
  const input = fixture();
  input.calibration.targetDigest = sha('other surface');
  denied(input, 'calibration-missing-stale-or-uncalibrated');
});
test('the provisional JOV-3721 floors never qualify as calibration', () => {
  const input = fixture();
  Object.assign(input.calibration, WRITING_QUALITY_CALIBRATION);
  rebind(input);
  denied(input, 'calibration-missing-stale-or-uncalibrated');
});
/** @type {Array<[string, (value: ReturnType<typeof fixture>['calibration']) => void]>} */
const calibrationDenials = [
  [
    'missing axis',
    c => {
      delete c.minConfidence['claim-support'];
    },
  ],
  [
    'nonfinite confidence',
    c => {
      c.minConfidence['voice-fit'] = Number.NaN;
    },
  ],
  [
    'nonhuman labels',
    c => {
      c.heldout.labelProvenance = 'model-generated';
    },
  ],
  [
    'missing owner approval',
    c => {
      delete c.heldout.humanLabelsApprovalRef;
    },
  ],
  [
    'document leakage',
    c => {
      c.heldout.holdoutDocumentIds = ['doc-tuning'];
    },
  ],
  [
    'prompt leakage',
    c => {
      c.heldout.excludedFromWriterPrompts = false;
    },
  ],
  [
    'posthoc limits',
    c => {
      c.heldout.limitsDeclaredAt = c.heldout.openedAt;
    },
  ],
  [
    'inconclusive surface',
    c => {
      c.decision = 'inconclusive';
    },
  ],
];
for (const [name, mutate] of calibrationDenials)
  test(`${name} cannot be hidden by fresh hashes`, () => {
    const input = fixture();
    mutate(input.calibration);
    rebind(input);
    denied(input, 'calibration-missing-stale-or-uncalibrated');
  });
/** @type {Array<[string, (value: ReturnType<typeof fixture>['report']) => void]>} */
const reportDenials = [
  [
    'empty sample',
    r => {
      r.heldoutCount = 0;
    },
  ],
  [
    'fixture-only execution',
    r => {
      r.execution = 'fixture';
    },
  ],
  [
    'no comparison gain',
    r => {
      r.comparisonPassed = false;
    },
  ],
  [
    'false claim fixture failed',
    r => {
      r.criticalFixturesPassed = false;
    },
  ],
  [
    'protected regression',
    r => {
      r.protectedMetricsPassed = false;
    },
  ],
  [
    'wrong holdout',
    r => {
      r.heldoutDigest = sha('different');
    },
  ],
  [
    'wrong limits',
    r => {
      r.predeclaredLimitsDigest = sha('different');
    },
  ],
  [
    'inconclusive report',
    r => {
      r.status = 'inconclusive';
    },
  ],
];
for (const [name, mutate] of reportDenials)
  test(`${name} retains observation despite an admission projection`, () => {
    const input = fixture();
    mutate(input.report);
    rebind(input);
    denied(input, 'quality-report-missing-stale-or-inconclusive');
  });

test('exact pilot receipt content, IDs and report identities must match', () => {
  for (const change of [
    i => {
      i.pilotReceipts[0].receiptId = 'other';
    },
    i => {
      i.pilotReceipts[0].expiresAt = NOW;
    },
    i => {
      i.pilotReceipts[0].calibrationVersion = 'provisional-2026-09-26';
    },
    i => {
      i.pilotReceipts.push(i.pilotReceipts[0]);
    },
    i => {
      i.pilotReceipts[0].status = 'issue-created';
    },
    i => {
      i.report.receiptId = 'different-report';
    },
    i => {
      i.admission.pilotReceiptDigests = [sha('other')];
    },
  ]) {
    const input = fixture();
    change(input);
    assert.equal(evaluate(input).disposition, 'denied');
  }
});

/** @type {Array<[string, (value: ReturnType<typeof fixture>['admission']) => void, string]>} */
const admissionDenials = [
  [
    'funding missing',
    a => {
      delete a.fundingApproval;
    },
    'funding-or-privacy-approval-missing',
  ],
  [
    'privacy expired',
    a => {
      a.privacyApproval.expiresAt = NOW;
    },
    'funding-or-privacy-approval-missing',
  ],
  [
    'privacy rejected',
    a => {
      a.privacyApproval.status = 'rejected';
    },
    'funding-or-privacy-approval-missing',
  ],
  [
    'funding scope changed',
    a => {
      a.fundingApproval.targetDigest = sha('other');
    },
    'funding-or-privacy-approval-missing',
  ],
  [
    'cohort full',
    a => {
      a.allowance.usedCohortSize = a.allowance.maxCohortSize;
    },
    'allowance-missing-invalid-or-exhausted',
  ],
  [
    'calls exhausted',
    a => {
      a.allowance.usedCalls = a.allowance.maxCalls;
    },
    'allowance-missing-invalid-or-exhausted',
  ],
  [
    'spend exhausted',
    a => {
      a.allowance.spentUsd = a.allowance.maxSpendUsd;
    },
    'allowance-missing-invalid-or-exhausted',
  ],
  [
    'unknown cost',
    a => {
      delete a.allowance.nextCallUpperBoundUsd;
    },
    'allowance-missing-invalid-or-exhausted',
  ],
  [
    'duplicate cohort',
    a => {
      a.allowance.cohortIds.push('fixture-cohort');
    },
    'allowance-missing-invalid-or-exhausted',
  ],
  [
    'negative usage',
    a => {
      a.allowance.usedCalls = -1;
    },
    'allowance-missing-invalid-or-exhausted',
  ],
  [
    'over budget next call',
    a => {
      a.allowance.nextCallUpperBoundUsd = 2;
    },
    'allowance-missing-invalid-or-exhausted',
  ],
  [
    'monitor missing',
    a => {
      delete a.monitoring;
    },
    'monitoring-rollback-or-kill-switch-denied',
  ],
  [
    'monitor stale',
    a => {
      a.monitoring.expiresAt = NOW;
    },
    'monitoring-rollback-or-kill-switch-denied',
  ],
  [
    'rollback ineligible',
    a => {
      a.rollback.eligible = false;
    },
    'monitoring-rollback-or-kill-switch-denied',
  ],
  [
    'rollback uncertified',
    a => {
      a.rollback.certified = false;
    },
    'monitoring-rollback-or-kill-switch-denied',
  ],
  [
    'kill switch active',
    a => {
      a.killSwitch.active = true;
    },
    'monitoring-rollback-or-kill-switch-denied',
  ],
  [
    'kill switch untested',
    a => {
      a.killSwitch.tested = false;
    },
    'monitoring-rollback-or-kill-switch-denied',
  ],
  [
    'protected regression',
    a => {
      a.protectedMetricRegression = true;
    },
    'monitoring-rollback-or-kill-switch-denied',
  ],
  [
    'cancelled',
    a => {
      a.cancelled = true;
    },
    'monitoring-rollback-or-kill-switch-denied',
  ],
];
for (const [name, mutate, reason] of admissionDenials)
  test(`${name} denies the candidate`, () => {
    const input = fixture();
    mutate(input.admission);
    denied(input, reason);
  });

test('an approved zero-cost allowance remains bounded by calls', () => {
  const input = fixture();
  Object.assign(input.admission.allowance, {
    maxSpendUsd: 0,
    nextCallUpperBoundUsd: 0,
  });
  assert.equal(evaluate(input).disposition, 'promotion-candidate');
  input.admission.allowance.usedCalls = 5;
  denied(input, 'allowance-missing-invalid-or-exhausted');
});
test('shorter operational evidence expiry bounds the handoff', () => {
  const input = fixture();
  input.admission.rollback.expiresAt = NOW + 1;
  assert.equal(evaluate(input).handoff.expiresAt, NOW + 1);
  denied(input, 'monitoring-rollback-or-kill-switch-denied', { now: NOW + 1 });
});

test('local preparation and supplied runtime claims cannot substitute for hosted CI or runtime proof', () => {
  const input = fixture();
  input.hostedCi.sourceSha = 'b'.repeat(40);
  input.deployedBuild = { status: 'verified' };
  input.observedRuntime = { status: 'passed' };
  const result = denied(input, 'exact-head-hosted-ci-absent');
  assert.equal(result.proof.hostedCi.status, 'absent');
  assert.equal(result.proof.deployedBuild.status, 'absent');
  assert.equal(result.proof.observedRuntime.status, 'absent');
});

function templateFixture() {
  const input = fixture();
  input.target.artifactKind = 'onboarding-template';
  input.target.templateChanges = [
    {
      stepId: 'welcome',
      lineKey: 'greeting',
      promotionReceiptId: 'protected-1',
      textSha256: createHash('sha256').update('Welcome.').digest('hex'),
    },
  ];
  rebind(input);
  const receipt = {
    schema: 'jovie-onboarding-script-promotion/v1',
    receiptId: 'protected-1',
    issuedAt: new Date(1_000).toISOString(),
    evidence: {
      evalCheck: {
        checkName: 'ci-promptfoo-evals',
        conclusion: 'success',
        runId: 'protected-run',
        headSha: input.target.sourceSha,
      },
      cohort: {
        metric: 'trialing_mrr_retained',
        impressions: 100,
        conversions: 3,
        holdoutRegressed: false,
      },
    },
    changes: [
      {
        lineKey: 'greeting',
        stepId: 'welcome',
        action: 'promote',
        status: 'active',
        weight: 1,
        previous: { status: 'candidate', weight: 0 },
        text: 'Welcome.',
      },
    ],
  };
  return { input, receipt };
}
test('template candidates require the existing protected replay and cohort gate', () => {
  const { input, receipt } = templateFixture();
  assert.equal(
    evaluate(input, { onboardingReceipts: () => [receipt] }).disposition,
    'promotion-candidate'
  );
  for (const mutate of [
    r => {
      r.evidence.evalCheck.checkName = 'generated-approval';
    },
    r => {
      r.evidence.evalCheck.conclusion = 'failure';
    },
    r => {
      r.evidence.evalCheck.headSha = 'b'.repeat(40);
    },
    r => {
      delete r.evidence.evalCheck.runId;
    },
    r => {
      r.evidence.cohort.holdoutRegressed = true;
    },
    r => {
      r.changes[0].text = 'Changed after approval';
    },
    r => {
      r.receiptId = 'other-receipt';
    },
  ]) {
    const changed = structuredClone(receipt);
    mutate(changed);
    denied(input, 'protected-template-promotion-denied', {
      onboardingReceipts: () => [changed],
    });
  }
  denied(input, 'protected-template-promotion-denied'); // Real protected source has no receipts.
  denied(input, 'protected-template-promotion-denied', {
    onboardingReceipts: () => {
      throw new Error('unreadable');
    },
  });
  denied(input, 'protected-template-promotion-denied', {
    onboardingReceipts: () => null,
  });
});
test('a protected rollback invalidates an earlier passing template promotion', () => {
  const { input, receipt } = templateFixture();
  const rollback = {
    schema: 'jovie-onboarding-script-rollback/v1',
    receiptId: 'rollback',
    rollsBack: receipt.receiptId,
    changes: [
      { ...receipt.changes[0], action: 'restore', status: 'candidate' },
    ],
  };
  denied(input, 'protected-template-promotion-denied', {
    onboardingReceipts: () => [receipt, rollback],
  });
});
test('onboarding templates cannot omit their protected changes', () => {
  const { input } = templateFixture();
  input.target.templateChanges = [];
  rebind(input);
  denied(input, 'invalid-target');
});
test('malformed and non-object evidence stays typed denied', () => {
  for (const value of [
    null,
    [],
    'approved',
    { target: null },
    { schema: WRITING_EVIDENCE_SCHEMA },
  ])
    assert.equal(evaluate(value).disposition, 'denied');
  const input = fixture();
  input.calibration.minConfidence = null;
  denied(input, 'calibration-missing-stale-or-uncalibrated');
});
test('CLI without a manifest reports denied rather than inventing readiness', () => {
  const cli = fileURLToPath(
    new URL('./jev-writing-readiness.mjs', import.meta.url)
  );
  const result = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).disposition, 'denied');
});
