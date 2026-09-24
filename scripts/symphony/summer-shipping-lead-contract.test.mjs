import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import {
  SHIPPING_OUTBOX,
  SHIPPING_OUTCOME,
  SHIPPING_TASK,
  shippingCanonical,
  shippingDigest,
  signShippingOutcome,
  validateShippingOutcome,
  validateShippingTask,
} from './summer-shipping-lead-contract.mjs';
import {
  runCycle,
  STATE_SCHEMA,
  validateState,
  verifyOutboxRecord,
} from './summer-symphony-outbox-consumer.mjs';

const summer = generateKeyPairSync('ed25519'),
  host = generateKeyPairSync('ed25519');
const keys = new Map([['summer-outbox', summer.publicKey]]);
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
function signRecord(domain, body, privateKey, keyId) {
  const unsigned = { ...body, signatureKeyId: keyId };
  return {
    ...unsigned,
    signature: `ed25519=${sign(null, Buffer.from(`${domain}\0${shippingCanonical(unsigned)}`), privateKey).toString('base64url')}`,
  };
}
function outbox(task = fixture()) {
  return signRecord(
    SHIPPING_OUTBOX,
    {
      schema: SHIPPING_OUTBOX,
      destination: 'symphony',
      status: 'ready',
      idempotencyKey: task.taskKey,
      task,
    },
    summer.privateKey,
    'summer-outbox'
  );
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
function cycle(record = outbox()) {
  let state = {
    schema: STATE_SCHEMA,
    active: { phase: 'discovered', taskKey: record.task.taskKey, record },
  };
  let executions = 0,
    deliveries = 0;
  const deps = {
    keys,
    outcomePrivateKey: host.privateKey,
    outcomePublicKey: host.publicKey,
    outcomeKeyId: 'host-outcomes',
    journal: {
      read: () => structuredClone(state),
      write: value => {
        state = structuredClone(value);
      },
    },
    transport: {
      async writeOutcome(value) {
        deliveries++;
        validateShippingOutcome(value, record.task, host.publicKey);
        return { status: 'recorded' };
      },
    },
    shippingLeadAdmitter: {
      /** @returns {Promise<ReturnType<typeof terminal> | {status: string, reason: string}>} */
      async execute() {
        executions++;
        return terminal();
      },
    },
  };
  return {
    deps,
    state: () => state,
    counts: () => ({ executions, deliveries }),
  };
}

test('verifies the new signed contract without inheriting repair authority', () => {
  const record = outbox();
  assert.deepEqual(verifyOutboxRecord(record, keys), record.task);
  const wrong = signRecord(
    'jovie.eve.symphony-repair-outbox/v3',
    { ...record, schema: 'jovie.eve.symphony-repair-outbox/v3' },
    summer.privateKey,
    'summer-outbox'
  );
  assert.throws(
    () => verifyOutboxRecord(wrong, keys),
    /wire-version-cross-bound/
  );
});
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
test('retains the journal and requests no execution without a canonical admitter', async () => {
  const c = cycle();
  c.deps.shippingLeadAdmitter = null;
  assert.equal(
    (await runCycle(c.deps)).reason,
    'canonical-shipping-lead-admitter-unavailable'
  );
  assert.equal(c.state().active.phase, 'discovered');
  assert.equal(c.counts().deliveries, 0);
});
test('holds owner/budget waits without turning them into terminal outcomes', async () => {
  const c = cycle();
  c.deps.shippingLeadAdmitter.execute = async () => ({
    status: 'held',
    reason: 'owner-acceptance-unavailable',
  });
  assert.equal((await runCycle(c.deps)).status, 'execution-held');
  assert.equal(c.counts().deliveries, 0);
  assert.equal(c.state().active.phase, 'discovered');
});
test('never admits an expired task or releases its slot without terminal proof', async () => {
  const task = fixture();
  task.createdAt = new Date(Date.now() - 700_000).toISOString();
  task.expiresAt = new Date(Date.now() - 100_000).toISOString();
  const c = cycle(outbox(task));
  assert.equal(
    (await runCycle(c.deps)).reason,
    'expired-shipping-lead-terminal-proof-unavailable'
  );
  assert.deepEqual(c.counts(), { executions: 0, deliveries: 0 });
  assert.equal(c.state().active.phase, 'discovered');
});
test('clears expired work only after canonical terminal evidence is delivered', async () => {
  const task = fixture();
  task.createdAt = new Date(Date.now() - 700_000).toISOString();
  task.expiresAt = new Date(Date.now() - 100_000).toISOString();
  const c = cycle(outbox(task));
  c.deps.shippingLeadAdmitter.rejectExpired = async observed => {
    assert.equal(observed.taskKey, task.taskKey);
    return terminal();
  };
  assert.equal((await runCycle(c.deps)).status, 'execution-recorded');
  assert.deepEqual(c.counts(), { executions: 0, deliveries: 1 });
  assert.equal(c.state().active, null);
});
test('delivers only signed terminal evidence and clears the exact journal', async () => {
  const c = cycle();
  assert.equal((await runCycle(c.deps)).status, 'execution-recorded');
  assert.deepEqual(c.counts(), { executions: 1, deliveries: 1 });
  assert.equal(c.state().active, null);
});
test('retries a lost outcome acknowledgement without executing again', async () => {
  const c = cycle(),
    deliver = c.deps.transport.writeOutcome;
  c.deps.transport.writeOutcome = async () => {
    throw new Error('lost-ack');
  };
  await assert.rejects(runCycle(c.deps), /lost-ack/);
  assert.equal(c.state().active.phase, 'outcome-pending');
  validateState(c.state(), keys, host.publicKey);
  c.deps.transport.writeOutcome = deliver;
  await runCycle(c.deps);
  assert.deepEqual(c.counts(), { executions: 1, deliveries: 1 });
});
test('never signs acceptance as successful terminal execution', async () => {
  const c = cycle();
  c.deps.shippingLeadAdmitter.execute = async () => ({
    ...terminal(),
    status: 'succeeded',
    resolution: 'accepted',
  });
  await assert.rejects(runCycle(c.deps), /outcome-invalid/);
  assert.equal(c.counts().deliveries, 0);
});
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
test('refuses unsigned extra result fields and missing host signing configuration', async () => {
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
  const c = cycle();
  c.deps.outcomePrivateKey = null;
  await assert.rejects(runCycle(c.deps), /signing-configuration-missing/);
});
