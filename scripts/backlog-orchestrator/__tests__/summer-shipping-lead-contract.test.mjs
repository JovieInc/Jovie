import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import {
  SHIPPING_OUTCOME,
  SHIPPING_TASK,
  shippingCanonical,
  shippingDigest,
  signShippingOutcome,
  validateShippingOutcome,
  validateShippingTask,
} from '../summer-shipping-lead-contract.mjs';

const summer = generateKeyPairSync('ed25519'),
  host = generateKeyPairSync('ed25519');
function fixture() {
  const createdAt = new Date(Date.now() - 1000).toISOString();
  return {
    schema: SHIPPING_TASK,
    taskKey: 'a'.repeat(64),
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + 600_000).toISOString(),
    owner: 'symphony',
    route: 'symphony',
    action: 'request-canonical-jov-triage-admission',
    authority: 'canonical-admission-request-owner-acceptance-required',
    safety: 'exact-source-ci-native-queue-production-gates-remain-required',
    maximumConcurrent: 3,
    handoffReceiptId: 'b'.repeat(64),
    issue: {
      identifier: 'JOV-6586',
      id: '00000000-0000-4000-8000-000000006586',
      revision: createdAt,
      state: 'Triage',
      repository: 'JovieInc/Jovie',
    },
    selected: {
      id: 'shipping-lead-jov-triage',
      sourceRevision: 'c'.repeat(40),
      sourceDigest: 'd'.repeat(64),
      owner: 'symphony',
      handle: 'JOV-6586',
    },
    source: { sourceVersion: 'c'.repeat(40), snapshotDigest: 'e'.repeat(64) },
    runtime: {
      sourceRevision: 'f'.repeat(40),
      generation: '1'.repeat(64),
      invocationId: '2'.repeat(32),
    },
  };
}
function lybFixture() {
  const task = fixture();
  task.action = 'materialize-canonical-lyb-reviewed-plan-admission';
  task.authority = 'authenticated-gem-reviewed-plan-admission-only';
  task.safety = 'approval-labels-only-upstream-symphony-owns-pickup-dispatch';
  task.maximumConcurrent = 1;
  task.issue.identifier = 'LYB-46';
  task.issue.state = 'Todo';
  task.issue.repository = 'JovieInc/LogYourBody';
  task.selected.id = 'shipping-lead-lyb-reviewed-plan';
  task.selected.owner = 'Gem';
  task.selected.handle = 'LYB-46';
  task.source.snapshotDigest = task.selected.sourceDigest;
  return task;
}
function signRecord(domain, body, privateKey, keyId) {
  const unsigned = { ...body, signatureKeyId: keyId };
  return {
    ...unsigned,
    signature: `ed25519=${sign(null, Buffer.from(`${domain}\0${shippingCanonical(unsigned)}`), privateKey).toString('base64url')}`,
  };
}
function terminal() {
  return {
    status: 'failed',
    detail: 'Canonical plan unavailable; no execution began',
    completedAt: new Date().toISOString(),
    resolution: 'rejected-before-execution',
    ownerAcceptanceDigest: null,
    terminalReceiptDigest: '3'.repeat(64),
    executionTerminated: true,
  };
}
for (const [name, mutate] of [
  [
    'LYB',
    task => {
      task.issue.identifier = 'LYB-1';
    },
  ],
  [
    'non-Triage',
    task => {
      task.issue.state = 'Todo';
    },
  ],
  [
    'different repository',
    task => {
      task.issue.repository = 'JovieInc/LogYourBody';
    },
  ],
  [
    'fourth slot',
    task => {
      task.maximumConcurrent = 4;
    },
  ],
  [
    'unbounded lifetime',
    task => {
      task.expiresAt = new Date(
        Date.parse(task.createdAt) + 600_001
      ).toISOString();
    },
  ],
  [
    'negative lifetime',
    task => {
      task.expiresAt = task.createdAt;
    },
  ],
  [
    'invalid timestamp',
    task => {
      task.createdAt = 'yesterday';
    },
  ],
  [
    'source mismatch',
    task => {
      task.selected.sourceRevision = '9'.repeat(40);
    },
  ],
  [
    'target mismatch',
    task => {
      task.selected.handle = 'JOV-1';
    },
  ],
  [
    'missing runtime',
    task => {
      delete task.runtime;
    },
  ],
  [
    'extra authority',
    task => {
      task.force = true;
    },
  ],
]) {
  test(`rejects ${name} before owner dispatch`, () => {
    const task = fixture();
    assert.ok(typeof mutate === 'function');
    mutate(task);
    assert.throws(
      () => validateShippingTask(task),
      /shipping-lead-task-invalid/
    );
  });
}
test('completion requires owner acceptance, even with a valid signer', () => {
  assert.throws(
    () =>
      signShippingOutcome(
        fixture(),
        { ...terminal(), status: 'succeeded', resolution: 'completed' },
        host.privateKey,
        'host-outcomes'
      ),
    /outcome-invalid/
  );
});
test('deliberate red: accepts the bounded LYB reviewed-plan approval event', () => {
  assert.doesNotThrow(() => validateShippingTask(lybFixture()));
});
for (const [name, mutate] of [
  [
    'mismatched identifier',
    task => {
      task.issue.identifier = 'JOV-46';
      task.selected.handle = 'JOV-46';
    },
  ],
  [
    'mismatched state',
    task => {
      task.issue.state = 'Backlog';
    },
  ],
  [
    'mismatched repository',
    task => {
      task.issue.repository = 'JovieInc/Jovie';
    },
  ],
  [
    'forged review digest',
    task => {
      task.source.snapshotDigest = '9'.repeat(64);
    },
  ],
]) {
  test(`rejects an LYB reviewed-plan event with ${name}`, () => {
    const task = lybFixture();
    assert.ok(typeof mutate === 'function');
    mutate(task);
    assert.throws(
      () => validateShippingTask(task),
      /shipping-lead-task-invalid/
    );
  });
}
test('signs accepted, completed work bound to its task digest', () => {
  const task = fixture();
  const result = signShippingOutcome(
    task,
    {
      ...terminal(),
      status: 'succeeded',
      resolution: 'completed',
      ownerAcceptanceDigest: '4'.repeat(64),
    },
    host.privateKey,
    'host-outcomes'
  );
  assert.equal(result.taskDigest, shippingDigest(task));
  assert.equal(
    validateShippingOutcome(result, task, host.publicKey).status,
    'succeeded'
  );
});
for (const [name, mutate] of [
  [
    'wrong issue',
    body => {
      body.issueId = '00000000-0000-4000-8000-000000000099';
    },
  ],
  [
    'wrong task',
    body => {
      body.taskDigest = '0'.repeat(64);
    },
  ],
  [
    'future result',
    body => {
      body.completedAt = new Date(Date.now() + 120_000).toISOString();
    },
  ],
  [
    'running execution',
    body => {
      body.executionTerminated = false;
    },
  ],
  [
    'empty terminal proof',
    body => {
      body.terminalReceiptDigest = null;
    },
  ],
]) {
  test(`rejects ${name} in a signed outcome`, () => {
    const task = fixture(),
      outcome = signShippingOutcome(
        task,
        terminal(),
        host.privateKey,
        'host-outcomes'
      );
    const { signature, signatureKeyId, ...body } = outcome;
    assert.ok(typeof mutate === 'function');
    mutate(body);
    const changed = signRecord(
      SHIPPING_OUTCOME,
      body,
      host.privateKey,
      'host-outcomes'
    );
    assert.throws(
      () => validateShippingOutcome(changed, task, host.publicKey),
      /outcome-invalid/
    );
  });
}
test('rejects an outcome signed by Summer rather than the host', () => {
  const task = fixture(),
    outcome = signShippingOutcome(
      task,
      terminal(),
      host.privateKey,
      'host-outcomes'
    );
  const { signature, signatureKeyId, ...body } = outcome;
  assert.throws(
    () =>
      validateShippingOutcome(
        signRecord(SHIPPING_OUTCOME, body, summer.privateKey, 'host-outcomes'),
        task,
        host.publicKey
      ),
    /signature-invalid/
  );
});
test('refuses unsigned extra result fields', () => {
  assert.throws(
    () =>
      signShippingOutcome(
        fixture(),
        { ...terminal(), extra: true },
        host.privateKey,
        'host-outcomes'
      ),
    /result-invalid/
  );
});
