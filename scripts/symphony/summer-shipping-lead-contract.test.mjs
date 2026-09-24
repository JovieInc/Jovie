import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createRuntimeBoundShippingAdmitter,
  createShippingLeadAdmitter,
} from './summer-shipping-lead-admitter.mjs';
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
  createFileJournal,
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

function admissionFixture(context, value = fixture()) {
  const root = mkdtempSync(join(tmpdir(), 'shipping-admission-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const open = () => createFileJournal(root, keys, host.publicKey);
  const journal = open();
  journal.write({
    schema: STATE_SCHEMA,
    active: {
      phase: 'discovered',
      taskKey: value.taskKey,
      record: outbox(value),
    },
  });
  return {
    journal,
    open,
    task: value,
    intent: {
      taskKey: value.taskKey,
      issueId: value.issue.id,
      method: 'transitionIssue',
    },
  };
}

function runtimeFor(task) {
  const observedAt = new Date().toISOString();
  return {
    schema: 'symphony-shipping-runtime-observation/v1',
    sourceRevision: task.runtime.sourceRevision,
    generation: task.runtime.generation,
    invocationId: task.runtime.invocationId,
    observedAt,
    generatedAt: observedAt,
    stateDigest: '1'.repeat(64),
    running: [],
    retrying: [],
    blocked: [],
  };
}

test('production adapter loads once and revalidates runtime before durable mutation intent', async context => {
  const f = admissionFixture(context);
  const events = [];
  const adapter = createRuntimeBoundShippingAdmitter({
    journal: f.journal,
    loadSource: async () => {
      events.push('load');
      return {
        sourceRevision: f.task.source.sourceVersion,
        observeRuntime: async () => {
          events.push('runtime');
          return runtimeFor(f.task);
        },
        admit: async (task, { beforeMutation }) => {
          await beforeMutation(f.intent);
          assert.equal(
            f.open().read().active.admissionProgress.mutationCount,
            1
          );
          events.push('provider');
          return { status: 'admitted' };
        },
        cleanup: () => events.push('cleanup'),
      };
    },
  });
  assert.equal(
    (await adapter.execute(f.task)).reason,
    'shipping-lead-awaiting-owner-terminal-proof'
  );
  assert.deepEqual(events, ['load', 'runtime', 'runtime', 'provider']);
  await adapter.execute(f.task);
  adapter.close();
  assert.deepEqual(events, [
    'load',
    'runtime',
    'runtime',
    'provider',
    'cleanup',
  ]);
});

test('production adapter holds changed control or live runtime identities before writes', async context => {
  const f = admissionFixture(context);
  const now = Date.now();
  for (const changed of [
    { schema: 'foreign' },
    { sourceRevision: 'b'.repeat(40) },
    { generation: 'b'.repeat(64) },
    { invocationId: 'b'.repeat(32) },
    { stateDigest: 'bad' },
    { running: null },
    { generatedAt: 'bad' },
    { observedAt: 'bad' },
    { observedAt: new Date(now - 601_000).toISOString() },
    { observedAt: new Date(now + 61_000).toISOString() },
    { generatedAt: new Date(now - 601_000).toISOString() },
    { generatedAt: new Date(now + 1000).toISOString() },
  ]) {
    let calls = 0;
    const adapter = createRuntimeBoundShippingAdmitter({
      journal: f.journal,
      now: () => now,
      loadSource: async () => ({
        sourceRevision: f.task.source.sourceVersion,
        observeRuntime: async () => ({ ...runtimeFor(f.task), ...changed }),
        admit: async () => {
          calls++;
        },
        cleanup: () => {},
      }),
    });
    await assert.rejects(adapter.execute(f.task), /runtime-binding/);
    assert.equal(calls, 0);
    adapter.close();
  }
  const changedSource = createRuntimeBoundShippingAdmitter({
    journal: f.journal,
    loadSource: async () => ({ sourceRevision: 'b'.repeat(40) }),
  });
  await assert.rejects(changedSource.execute(f.task), /control-source-changed/);
  assert.equal(f.open().read().active.admissionProgress, undefined);
});

test('runtime generation change during canonical gates prevents the provider mutation', async context => {
  const f = admissionFixture(context);
  let reads = 0,
    writes = 0;
  const adapter = createRuntimeBoundShippingAdmitter({
    journal: f.journal,
    loadSource: async () => ({
      sourceRevision: f.task.source.sourceVersion,
      observeRuntime: async () => ({
        ...runtimeFor(f.task),
        generation: ++reads === 1 ? f.task.runtime.generation : 'b'.repeat(64),
      }),
      admit: async (_task, { beforeMutation }) => {
        await beforeMutation(f.intent);
        writes++;
      },
      cleanup: () => {},
    }),
  });
  await assert.rejects(adapter.execute(f.task), /runtime-binding/);
  assert.equal(writes, 0);
  assert.equal(f.open().read().active.admissionProgress, undefined);
  adapter.close();
});

test('an expired untouched request does not load canonical code or probe runtime', async context => {
  const f = admissionFixture(context);
  const adapter = createRuntimeBoundShippingAdmitter({
    journal: f.journal,
    now: () => Date.parse(f.task.expiresAt) + 1,
    loadSource: async () => {
      throw new Error('must not load');
    },
  });
  assert.equal(
    (await adapter.rejectExpired(f.task)).resolution,
    'rejected-before-execution'
  );
  adapter.close();
});

test('durable mutation intent survives lost response and never admits twice', async context => {
  const f = admissionFixture(context);
  let attempts = 0;
  const admit = async (_task, { beforeMutation }) => {
    attempts++;
    await beforeMutation(f.intent);
    assert.equal(f.open().read().active.admissionProgress.mutationCount, 1);
    throw new Error('provider response lost');
  };
  await assert.rejects(
    createShippingLeadAdmitter({ journal: f.journal, admit }).execute(f.task),
    /response lost/
  );
  const resumed = createShippingLeadAdmitter({ journal: f.open(), admit });
  assert.equal(
    (await resumed.execute(f.task)).reason,
    'shipping-lead-mutation-outcome-unknown'
  );
  const expired = createShippingLeadAdmitter({
    journal: f.open(),
    admit,
    now: () => Date.parse(f.task.expiresAt) + 1,
  });
  assert.equal(
    (await expired.rejectExpired(f.task)).reason,
    'shipping-lead-mutation-outcome-unknown'
  );
  assert.equal(attempts, 1);
});

test('canonical admission persists separately from terminal owner proof', async context => {
  const f = admissionFixture(context);
  let attempts = 0;
  const admit = async (_task, { beforeMutation }) => {
    attempts++;
    await beforeMutation({ ...f.intent, method: 'addComment' });
    await beforeMutation(f.intent);
    return {
      status: 'admitted',
      issue: f.task.issue.identifier,
      mutations: 'verified',
    };
  };
  const result = await createShippingLeadAdmitter({
    journal: f.journal,
    admit,
  }).execute(f.task);
  assert.equal(result.reason, 'shipping-lead-awaiting-owner-terminal-proof');
  const progress = f.open().read().active.admissionProgress;
  assert.equal(progress.mutationCount, 2);
  assert.match(progress.admissionDigest, /^[a-f0-9]{64}$/u);
  const resumed = createShippingLeadAdmitter({
    journal: f.open(),
    admit,
    observe: async (task, retained) => {
      assert.equal(task.taskKey, f.task.taskKey);
      assert.deepEqual(retained, progress);
      return { status: 'held', reason: 'worker-still-running' };
    },
  });
  assert.equal((await resumed.execute(f.task)).reason, 'worker-still-running');
  assert.equal(attempts, 1);
});

test('expires only untouched requests and retains canonical gate holds', async context => {
  const f = admissionFixture(context);
  const untouched = createShippingLeadAdmitter({ journal: f.journal });
  assert.equal(
    (await untouched.execute(f.task)).reason,
    'canonical-shipping-lead-admitter-unavailable'
  );
  assert.equal(
    (await untouched.rejectExpired(f.task)).reason,
    'shipping-lead-request-not-expired'
  );
  for (const result of [{ status: 'blocked', reason: 'fleet-held' }, null]) {
    const a = createShippingLeadAdmitter({
      journal: f.open(),
      admit: async () => result,
    });
    assert.equal((await a.execute(f.task)).status, 'held');
    assert.equal(f.open().read().active.admissionProgress, undefined);
  }
  const completedAt = Date.parse(f.task.expiresAt) + 1;
  const expired = createShippingLeadAdmitter({
    journal: f.open(),
    now: () => completedAt,
  });
  const result = await expired.execute(f.task);
  assert.equal(result.resolution, 'rejected-before-execution');
  assert.equal(result.ownerAcceptanceDigest, null);
  assert.equal(result.executionTerminated, true);
  signShippingOutcome(
    f.task,
    result,
    host.privateKey,
    'host-outcomes',
    completedAt
  );
});

test('journal failures and crossed mutation targets stop before provider mutation', async context => {
  const f = admissionFixture(context);
  let providerWrites = 0;
  const admit = async (_task, { beforeMutation }) => {
    await beforeMutation(f.intent);
    providerWrites++;
    return { status: 'admitted' };
  };
  const broken = {
    read: () => f.journal.read(),
    write: () => {
      throw new Error('disk full');
    },
  };
  await assert.rejects(
    createShippingLeadAdmitter({ journal: broken, admit }).execute(f.task),
    /disk full/
  );
  assert.equal(providerWrites, 0);
  for (const intent of [
    { ...f.intent, method: 'deleteIssue' },
    { ...f.intent, issueId: 'foreign' },
    { ...f.intent, taskKey: '0'.repeat(64) },
    { ...f.intent, extra: true },
  ]) {
    await assert.rejects(
      createShippingLeadAdmitter({
        journal: f.journal,
        admit: async (_task, { beforeMutation }) => beforeMutation(intent),
      }).execute(f.task),
      /intent-cross-bound/
    );
  }
  await assert.rejects(
    createShippingLeadAdmitter({
      journal: f.journal,
      admit: async () => ({ status: 'admitted' }),
    }).execute(f.task),
    /without-journal/
  );
  await assert.rejects(
    createShippingLeadAdmitter({ journal: f.journal }).execute({
      ...f.task,
      taskKey: 'b'.repeat(64),
    }),
    /journal-cross-bound/
  );
});

test('partial canonical writes remain held and malformed retained progress is rejected', async context => {
  const f = admissionFixture(context);
  const admit = async (_task, { beforeMutation }) => {
    await beforeMutation(f.intent);
    return { status: 'blocked', reason: 'gate-changed' };
  };
  assert.equal(
    (
      await createShippingLeadAdmitter({ journal: f.journal, admit }).execute(
        f.task
      )
    ).reason,
    'shipping-lead-mutation-outcome-unknown'
  );
  const state = f.open().read();
  const p = state.active.admissionProgress;
  for (const change of [
    { schema: 'foreign' },
    { taskDigest: 'f'.repeat(64) },
    { mutationCount: -1 },
    { mutationCount: 101 },
    { mutationCount: 0 },
    { mutationCount: 0.5 },
    { lastMutation: null },
    { admissionDigest: 'bad' },
    { lastMutation: { ...p.lastMutation, recordedAt: 'bad' } },
    { lastMutation: { ...p.lastMutation, recordedAt: '2000-01-01T00:00:00Z' } },
    { lastMutation: { ...p.lastMutation, method: 'deleteIssue' } },
    { lastMutation: { ...p.lastMutation, issueId: 'foreign' } },
    { extra: true },
  ]) {
    assert.throws(
      () =>
        f.journal.write({
          ...state,
          active: {
            ...state.active,
            admissionProgress: { ...p, ...change },
          },
        }),
      /progress-invalid/
    );
  }
});
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
