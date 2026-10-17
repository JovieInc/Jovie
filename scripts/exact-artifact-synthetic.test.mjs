import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { persistPrivateReceipt } from './exact-artifact-synthetic.mjs';
import {
  buildExactArtifactReceipt,
  classifyPrivateStorageFailure,
  evaluateExactArtifactSoak,
  JOURNEY_SCHEMA,
  REQUIRED_TRANSITIONS,
  redactExactArtifactReceipt,
} from './lib/exact-artifact-synthetic.mjs';

const BUILD_SHA = 'a'.repeat(40);
const MERGED_SHA = 'b'.repeat(40);
const BUILD_INFO = {
  commitSha: BUILD_SHA,
  deploymentId: 'dpl_ExactProduction123',
};

function successfulResult(overrides = {}) {
  return {
    schema: JOURNEY_SCHEMA,
    authMethod: 'otp',
    startedAt: '2026-10-14T07:47:00.000Z',
    completedAt: '2026-10-14T07:49:00.000Z',
    transitions: REQUIRED_TRANSITIONS.map((name, index) => ({
      name,
      status: 'passed',
      at: `2026-10-14T07:${47 + index}:00.000Z`,
      durationMs: 100 + index,
    })),
    finalCleanupState: 'clean',
    controlledCheckoutId: 'cs_live_controlled_secret',
    controlledSubscriptionId: 'sub_live_controlled_secret',
    completionEvidence: {
      mergedShas: [MERGED_SHA],
      migrationVersion: '0137',
      ciReceipt: 'https://github.com/JovieInc/Jovie/actions/runs/123',
      deployedBuildSha: BUILD_SHA,
      returningSessionProof: 'private-receipt:returning-session-123',
      rollbackPaths: ['revert:deadbeef', 'migration:0137-down'],
      acceptedRisks: [],
    },
    email: 'should-never-persist@example.com',
    otp: '123456',
    token: 'secret-token',
    ...overrides,
  };
}

function buildReceipt(result = successfulResult(), overrides = {}) {
  return buildExactArtifactReceipt({
    result,
    buildInfo: BUILD_INFO,
    attemptId: '12345-1',
    event: 'schedule',
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/12345',
    now: new Date('2026-10-14T07:50:00.000Z'),
    ...overrides,
  });
}

test('keeps complete build-bound evidence private and emits a redacted public projection', () => {
  const receipt = buildReceipt();

  assert.equal(receipt.outcome, 'success');
  assert.equal(receipt.controlledRun, true);
  assert.equal(receipt.buildSha, BUILD_SHA);
  assert.equal(receipt.deploymentId, BUILD_INFO.deploymentId);
  assert.equal(receipt.attemptId, '12345-1');
  assert.equal(receipt.authMethod, 'otp');
  assert.deepEqual(
    receipt.transitions.map(transition => transition.name),
    REQUIRED_TRANSITIONS
  );
  assert.equal(receipt.finalCleanupState, 'clean');
  assert.equal(
    receipt.controlledIdentifiers.checkoutId,
    'cs_live_controlled_secret'
  );

  const publicReceipt = redactExactArtifactReceipt(receipt, {
    pathname: 'exact-artifact-synthetic/v1/2026-10-14/receipt.json',
    sha256: 'c'.repeat(64),
  });
  const serialized = JSON.stringify(publicReceipt);
  assert.equal(publicReceipt.controlledIdentifiers.checkoutId, '[redacted]');
  assert.equal(
    publicReceipt.controlledIdentifiers.subscriptionId,
    '[redacted]'
  );
  assert.doesNotMatch(serialized, /cs_live|sub_live|example\.com|123456/u);
  assert.doesNotMatch(serialized, /secret-token/u);

  const nestedSecret = buildReceipt(
    successfulResult({
      completionEvidence: {
        ...successfulResult().completionEvidence,
        returningSessionProof: 'token=secret-token',
        rollbackPaths: ['cs_live_controlled_secret'],
      },
    })
  );
  assert.equal(nestedSecret.completionEvidence.returningSessionProof, null);
  assert.deepEqual(nestedSecret.completionEvidence.rollbackPaths, []);
  assert.doesNotMatch(
    JSON.stringify(redactExactArtifactReceipt(nestedSecret)),
    /secret-token|cs_live_controlled_secret/u
  );
});

test('classifies missing journey infrastructure without claiming product health', () => {
  const receipt = buildExactArtifactReceipt({
    result: null,
    buildInfo: BUILD_INFO,
    attemptId: '12345-1',
    event: 'schedule',
    runUrl: null,
    producerStatus: 78,
    now: new Date('2026-10-14T07:50:00.000Z'),
  });

  assert.equal(receipt.outcome, 'failure');
  assert.equal(receipt.classification, 'infrastructure');
  assert.equal(receipt.pathStatus, 'unknown');
  assert.equal(receipt.controlledRun, false);
  assert.equal(
    receipt.rootCauseFingerprint,
    'exact-artifact-infrastructure-preflight-journey-producer-unavailable'
  );
});

test('deduplicates product alerts by stable root cause rather than attempt or identifiers', () => {
  const failure = successfulResult({
    failureClassification: 'product',
    pathStatus: 'blocked',
    transitions: [
      ...successfulResult().transitions.slice(0, 2),
      {
        name: 'checkout',
        status: 'failed',
        at: '2026-10-14T07:49:00.000Z',
        code: 'checkout-timeout',
      },
    ],
    finalCleanupState: 'retained',
  });
  const first = buildReceipt(failure);
  const second = buildReceipt(
    {
      ...failure,
      controlledCheckoutId: 'cs_different',
      controlledSubscriptionId: 'sub_different',
    },
    { attemptId: '99999-4' }
  );

  assert.equal(first.classification, 'product');
  assert.equal(first.pathStatus, 'blocked');
  assert.equal(
    first.rootCauseFingerprint,
    'exact-artifact-product-checkout-checkout-timeout'
  );
  assert.equal(second.rootCauseFingerprint, first.rootCauseFingerprint);
});

test('marks cleanup-only product failure as degraded and private-store failure as unknown', () => {
  const transitions = successfulResult().transitions.map(transition =>
    transition.name === 'cleanup'
      ? { ...transition, status: 'failed', code: 'cleanup-timeout' }
      : transition
  );
  const degraded = buildReceipt(
    successfulResult({
      transitions,
      failureClassification: 'product',
      finalCleanupState: 'failed',
    })
  );
  assert.equal(degraded.pathStatus, 'degraded');

  const storageFailure = classifyPrivateStorageFailure(degraded);
  assert.equal(storageFailure.classification, 'infrastructure');
  assert.equal(storageFailure.pathStatus, 'unknown');
  assert.equal(storageFailure.controlledRun, false);
  assert.match(
    storageFailure.rootCauseFingerprint,
    /private-receipt-write-failed/u
  );
});

test('persists one immutable private blob without exposing its URL', async () => {
  const calls = [];
  const receipt = buildReceipt();
  const stored = await persistPrivateReceipt(receipt, {
    put: async (pathname, body, options) => {
      calls.push({ pathname, body, options });
      return { url: 'https://private.example/never-return-this' };
    },
    get: async () => null,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.access, 'private');
  assert.equal(calls[0].options.addRandomSuffix, false);
  assert.equal(calls[0].options.allowOverwrite, false);
  assert.match(calls[0].body, /cs_live_controlled_secret/u);
  assert.match(stored.pathname, /^exact-artifact-synthetic\/v1\//u);
  assert.equal(stored.url, undefined);
});

function scheduledReceipt(day, overrides = {}) {
  const receipt = buildReceipt();
  return {
    ...receipt,
    receiptId: `receipt-${day}`,
    startedAt: `${day}T07:47:00.000Z`,
    completedAt: `${day}T07:49:00.000Z`,
    ...overrides,
  };
}

test('completes only a 100% daily controlled soak with all commissioning evidence', () => {
  const evidence = evaluateExactArtifactSoak({
    receipts: [
      scheduledReceipt('2026-10-12'),
      scheduledReceipt('2026-10-13'),
      scheduledReceipt('2026-10-14'),
    ],
    windowDays: 3,
    now: new Date('2026-10-14T12:00:00.000Z'),
  });

  assert.equal(evidence.status, 'complete');
  assert.equal(evidence.successRate, 1);
  assert.equal(evidence.attempts, 3);
  assert.deepEqual(evidence.missingDays, []);
  assert.deepEqual(evidence.completionEvidence.mergedShas, [MERGED_SHA]);
  assert.equal(evidence.completionEvidence.migrationVersion, '0137');
  assert.equal(evidence.completionEvidence.deployedBuildSha, BUILD_SHA);
  assert.deepEqual(evidence.completionEvidence.acceptedRisks, []);
});

test('refuses soak completion for a failed run, missing day, or incomplete evidence', () => {
  const failed = scheduledReceipt('2026-10-13', {
    outcome: 'failure',
    controlledRun: false,
    pathStatus: 'unknown',
  });
  const badRate = evaluateExactArtifactSoak({
    receipts: [
      scheduledReceipt('2026-10-12'),
      failed,
      scheduledReceipt('2026-10-14'),
    ],
    windowDays: 3,
    now: new Date('2026-10-14T12:00:00.000Z'),
  });
  assert.equal(badRate.status, 'incomplete');
  assert.equal(badRate.successRate, 2 / 3);

  const missingDay = evaluateExactArtifactSoak({
    receipts: [scheduledReceipt('2026-10-12'), scheduledReceipt('2026-10-14')],
    windowDays: 3,
    now: new Date('2026-10-14T12:00:00.000Z'),
  });
  assert.deepEqual(missingDay.missingDays, ['2026-10-13']);
  assert.equal(missingDay.status, 'incomplete');

  const incompleteEvidence = scheduledReceipt('2026-10-14', {
    completionEvidence: {
      ...buildReceipt().completionEvidence,
      rollbackPaths: [],
    },
  });
  const missingProof = evaluateExactArtifactSoak({
    receipts: [incompleteEvidence],
    windowDays: 1,
    now: new Date('2026-10-14T12:00:00.000Z'),
  });
  assert.equal(missingProof.completionEvidenceComplete, false);
  assert.equal(missingProof.status, 'incomplete');
});

test('daily workflow keeps raw journey output private and publishes only redacted evidence', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/synthetic-monitoring.yml', import.meta.url),
    'utf8'
  );

  assert.match(workflow, /exact-artifact-revenue-spine:/u);
  assert.match(workflow, /github\.event\.schedule == '47 7 \* \* \*'/u);
  assert.match(workflow, /BLOB_READ_WRITE_TOKEN/u);
  assert.match(workflow, /exact-artifact-public-/u);
  assert.match(workflow, /exact-artifact\/public-receipt\.json/u);
  assert.doesNotMatch(
    workflow,
    /exact-artifact\/journey\.json\s*\n\s*retention-days/u
  );
});
