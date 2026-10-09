import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { test } from 'vitest';
import { sealWorkOrder } from '../../../packages/agent-transport-contracts/work-order.ts';
import { canonical } from '../../backlog-orchestrator/summer-triage-assessment-client.mjs';
import {
  createCurrentHostReader,
  validateCurrentPage,
  validateCurrentTaskRecords,
} from '../../lanes/mesh-current-wire.mjs';

// Ephemeral TEST fixtures only; no credential installation or production key.
const eve = generateKeyPairSync('ed25519'),
  host = generateKeyPairSync('ed25519');
const key = 'a'.repeat(64),
  now = Date.parse('2026-10-09T01:10:00Z');
const action = 'reconcile-native-queue-starvation';
const digest = v => createHash('sha256').update(canonical(v)).digest('hex');
const signed = (body, privateKey) => ({
  ...body,
  signature:
    'ed25519=' +
    sign(
      null,
      Buffer.from(body.schema + '\0' + canonical(body)),
      privateKey
    ).toString('base64url'),
});
function fixture() {
  const task = {
    schema: 'jovie-symphony-repair-task/v2',
    taskKey: key,
    decisionFingerprint: key,
    createdAt: '2026-10-09T01:00:00Z',
    owner: 'symphony',
    route: 'symphony',
    authority: 'linear-child-projection-only',
    action,
    linearProjection: {
      mutation: 'create-child-issue',
      team: 'JOV',
      parentIssue: 'JOV-5853',
      title: `[summer-task:${key}] native-queue-starvation`,
      description: `[summer-task:${key}]\n\nSelected: native-queue-starvation\nAction: ${action}\nSource: ${'b'.repeat(40)}`,
      initialState: 'Todo',
      labels: ['symphony'],
    },
    safety: 'exact-source-ci-native-queue-production-gates-remain-required',
    selected: {
      id: 'native-queue-starvation',
      sourceRevision: 'b'.repeat(40),
      sourceDigest: 'c'.repeat(64),
      owner: 'owner-lanes',
      handle: 'repair/queue',
    },
    source: { sourceVersion: 'b'.repeat(40), snapshotDigest: 'd'.repeat(64) },
  };
  const record = signed(
    {
      schema: 'jovie.eve.symphony-repair-outbox/v2',
      destination: 'symphony',
      idempotencyKey: key,
      status: 'ready',
      task,
      signatureKeyId: 'eve-test',
    },
    eve.privateKey
  );
  const order = sealWorkOrder({
    schema: 'jovie.work-order/v1',
    orderId: 'work-1',
    revision: 1,
    idempotencyKey: 'work_order_1',
    gate: { objectiveRef: 'JOV-5853', gateId: 'gate' },
    state: 'open',
    title: 'Repair selected queue starvation',
    outcome: 'Qualify useful repair',
    successPredicate: {
      id: 'queue-progress',
      statement: 'Useful native queue outcome',
      verifier: 'ci',
    },
    requiredCapabilities: ['code-change'],
    riskTier: 'low',
    authorityClass: 'automation',
    scope: { target: 'JovieInc/Jovie', entityRefs: ['JOV-5853'] },
    evidence: [],
    permittedActions: [action, 'bind-projected-child'],
    forbiddenActions: ['outbound', 'spend'],
    budget: {
      deadline: '2026-10-09T02:00:00Z',
      maxAttempts: 1,
      maxSpendUsd: 0,
      maxConcurrency: 1,
      founderMinutes: 0,
    },
    stopConditions: ['owner admission unavailable'],
    escalation: { owner: 'Summer', action: 'retain exact hold' },
    expectedArtifact: { kind: 'pull-request', description: 'Actual repair' },
    founderAsk: null,
    replyTo: { kind: 'linear-comment', ref: 'JOV-5853' },
    createdAt: '2026-10-09T01:00:00Z',
    createdBy: 'Summer',
  });
  const parent = {
    taskKey: key,
    order,
    parentRecordRef: `summer-bottleneck/prospective-work-orders/parent/${key}.json`,
    parentRecordDigest: 'e'.repeat(64),
    parentRecordedAt: '2026-10-09T01:00:00Z',
    callerIntentRef: `summer-bottleneck/symphony-caller/intent/${key}.json`,
    callerIntentDigest: 'f'.repeat(64),
    callerIntentRecordedAt: '2026-10-09T01:00:01Z',
    originalRequester: 'eve-test',
    authorityScope: 'identity-only-exact-task-admission-required',
    deadlineState: 'not-expired',
    recipientAcceptance: 'unknown',
    canonicalDispatch: null,
  };
  const page = {
    schema: 'summer.symphony-outbox-page/v1',
    records: [record],
    prospectiveParents: [parent],
    cursor: null,
    hasMore: false,
    scanned: 1,
  };
  const projection = signed(
    {
      schema: 'jovie.symphony-repair-outcome/v2',
      taskKey: key,
      status: 'succeeded',
      detail: 'Created Linear child JOV-6001',
      completedAt: '2026-10-09T01:01:00Z',
      source: { ...task.source, action },
      decisionFingerprint: key,
      linearProjection: task.linearProjection,
      result: { issueIdentifier: 'JOV-6001' },
      signatureKeyId: 'host-test',
    },
    host.privateKey
  );
  const { digest: _digest, ...body } = order;
  const child = sealWorkOrder({
    ...body,
    revision: 2,
    scope: { target: 'JovieInc/Jovie', entityRefs: ['JOV-6001'] },
    createdAt: '2026-10-09T01:02:00Z',
    evidence: [
      {
        ref: `parent-work-order:${order.digest}`,
        observedAt: parent.parentRecordedAt,
        freshness: 'unknown',
      },
      {
        ref: `symphony-dispatch:${'1'.repeat(64)}`,
        observedAt: '2026-10-09T01:01:30Z',
        freshness: 'unknown',
      },
      {
        ref: `symphony-projection:${digest(projection)}`,
        observedAt: projection.completedAt,
        freshness: 'unknown',
      },
    ],
  });
  const records = {
    schema: 'summer.symphony-task-records/v1',
    taskKey: key,
    issueIdentifier: 'JOV-6001',
    state: 'execution-missing',
    outbox: record,
    projection,
    execution: null,
    canonicalChild: {
      order: child,
      taskKey: key,
      originalHost: 'host-test',
      authorityScope: 'identity-only-exact-task-admission-required',
      deadlineState: 'not-expired',
      recipientAcceptance: 'unknown',
      canonicalDispatch: null,
    },
  };
  return {
    page,
    records,
    task,
    keys: new Map([['eve-test', eve.publicKey]]),
    original: { keyId: 'host-test', publicKey: host.publicKey },
  };
}
test('current new parent/child fields preserve identity-only unknown acceptance', () => {
  const f = fixture();
  assert.deepEqual(validateCurrentPage(f.page, f.keys, now), f.page);
  assert.deepEqual(
    validateCurrentTaskRecords(
      f.records,
      f.task,
      f.keys,
      f.original,
      now,
      f.page.prospectiveParents[0]
    ),
    f.records
  );
  assert.equal(f.page.prospectiveParents[0].recipientAcceptance, 'unknown');
});
test('unknown fields, orphan/duplicate parents and forged signed task are rejected', () => {
  const f = fixture();
  for (const change of [
    p => (p.extra = true),
    p => (p.prospectiveParents[0].extra = true),
    p => (p.prospectiveParents[0].taskKey = '0'.repeat(64)),
    p => p.prospectiveParents.push(p.prospectiveParents[0]),
    p => (p.records[0].task.action = 'outbound'),
    p => p.records.push(p.records[0]),
    p => (p.hasMore = true),
    p => (p.scanned = 26),
  ]) {
    const page = structuredClone(f.page);
    change(page);
    assert.throws(() => validateCurrentPage(page, f.keys, now));
  }
});
test('parent ordering, original requester, authority and spend do not relax', () => {
  const f = fixture();
  for (const change of [
    p => (p.originalRequester = 'other'),
    p => (p.recipientAcceptance = 'accepted'),
    p => (p.callerIntentRecordedAt = '2026-10-09T00:59:00Z'),
    p => (p.order.budget.maxSpendUsd = 1),
    p => (p.deadlineState = 'expired'),
    p => (p.canonicalDispatch = {}),
    p => (p.parentRecordRef = 'other'),
  ]) {
    const page = structuredClone(f.page);
    change(page.prospectiveParents[0]);
    assert.throws(() => validateCurrentPage(page, f.keys, now));
  }
});
test('current task/host/action/source/child tuples reject mismatched or expanded fields', () => {
  const f = fixture();
  for (const change of [
    v => (v.extra = true),
    v => (v.taskKey = '0'.repeat(64)),
    v => (v.canonicalChild.extra = true),
    v => (v.canonicalChild.originalHost = 'other'),
    v => (v.canonicalChild.recipientAcceptance = 'accepted'),
    v => (v.canonicalChild.order.scope.entityRefs = ['JOV-7001']),
    v => (v.projection.source.snapshotDigest = '0'.repeat(64)),
    v => (v.projection.signatureKeyId = 'other'),
    v => (v.execution = {}),
    v => (v.canonicalChild.deadlineState = 'expired'),
  ]) {
    const row = structuredClone(f.records);
    change(row);
    assert.throws(() =>
      validateCurrentTaskRecords(
        row,
        f.task,
        f.keys,
        f.original,
        now,
        f.page.prospectiveParents[0]
      )
    );
  }
});
const registry = () => ({
  keyId: 'host-test',
  publicFingerprint: createHash('sha256')
    .update(host.publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex'),
  provenanceRef: 'TEST registry fixture; no production authority',
});
const trust = () => ({
  'eve-test': createHash('sha256')
    .update(eve.publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex'),
});
const environment = () => ({
  SUMMER_BOTTLENECK_ORIGIN: 'https://summer.jov.ie',
  SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID: 'host-test',
  SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_PRIVATE_KEY:
    host.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  SUMMER_BOTTLENECK_EVE_OUTBOX_VERIFICATION_KEYS_JSON: JSON.stringify({
    'eve-test': eve.publicKey.export({ type: 'spki', format: 'pem' }),
  }),
});
test('signed original-host GET binds the full query, preserves new fields and read provenance', async () => {
  const f = fixture(),
    calls = [];
  const reader = createCurrentHostReader(registry(), {
    environment: environment(),
    outboxTrust: trust(),
    now: () => now,
    fetchImpl: async (url, options) => {
      const u = new URL(url instanceof Request ? url.url : url);
      calls.push(u.pathname);
      const h = options.headers,
        unsigned = {
          method: 'GET',
          target: u.pathname + u.search,
          timestamp: h['x-summer-timestamp'],
          nonce: h['x-summer-nonce'],
          signatureKeyId: h['x-summer-key-id'],
        };
      assert(
        verify(
          null,
          Buffer.from('summer.symphony-outbox-read/v1\0' + canonical(unsigned)),
          host.publicKey,
          Buffer.from(h['x-summer-signature'].slice(8), 'base64url')
        )
      );
      assert.equal(options.redirect, 'error');
      const response = Response.json(
        u.pathname.endsWith('outbox') ? f.page : f.records
      );
      Object.defineProperty(response, 'url', { value: url });
      return response;
    },
  });
  const page = await reader.readOutbox();
  assert.deepEqual(reader.proveRead(page), f.page);
  const records = await reader.readTaskRecords(page, key, 'JOV-6001');
  assert.deepEqual(reader.proveRead(records), f.records);
  await assert.rejects(
    reader.readTaskRecords(structuredClone(page), key, 'JOV-6001'),
    /authenticated-page/
  );
  page.prospectiveParents[0].recipientAcceptance = 'accepted';
  assert.throws(() => reader.proveRead(page), /authenticated-read/);
  assert.deepEqual(calls, [
    '/summer/v1/symphony/outbox',
    '/summer/v1/symphony/task-records',
  ]);
});
test('missing original binding fails before touching environment or sending a request', () => {
  const environment = new Proxy(
    {},
    {
      get() {
        throw Error('must not read private configuration');
      },
    }
  );
  assert.throws(
    () => createCurrentHostReader(null, { environment }),
    /original-host-binding-unavailable/
  );
});
test('configured alternate host, origin and signer/outbox overlap fail closed', () => {
  for (const env of [
    {
      ...environment(),
      SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID: 'other-host',
    },
    { ...environment(), SUMMER_BOTTLENECK_ORIGIN: 'https://other.example' },
    {
      ...environment(),
      SUMMER_BOTTLENECK_EVE_OUTBOX_VERIFICATION_KEYS_JSON: JSON.stringify({
        'host-test': host.publicKey.export({ type: 'spki', format: 'pem' }),
      }),
    },
  ])
    assert.throws(() =>
      createCurrentHostReader(registry(), {
        environment: env,
        outboxTrust: trust(),
      })
    );
});

function predecessor() {
  const receipt = {
    schema: 'summer.owned-work-predecessor/v1',
    taskKey: key,
    issueIdentifier: 'JOV-6001',
    commentId: 'comment-1',
    originalHost: 'host-test',
    ownerEnvelopeDigest: '5'.repeat(64),
    verifiedAt: '2026-10-09T01:06:00Z',
    verification: {
      schema: 'summer.owned-work-verification/v1',
      orderDigest: '6'.repeat(64),
      resultDigest: '7'.repeat(64),
      observedAt: '2026-10-09T01:05:00Z',
      outcome: {
        predicateId: 'queue-progress',
        receiptRef: 'independent:readback',
        status: 'verified',
      },
      deployment: {
        ref: 'dpl-test',
        sourceRevision: '8'.repeat(40),
        status: 'verified',
      },
    },
    release: {
      repository: 'JovieInc/Jovie',
      runId: 1,
      runAttempt: 1,
      jobId: 2,
      commitSha: '8'.repeat(40),
      buildId: 'dpl-test',
      deployedAt: '2026-10-09T01:04:00Z',
      observedAt: '2026-10-09T01:05:00Z',
    },
    receiptPath: `summer-bottleneck/work-verifications/${key}.json`,
    signatureKeyId: 'summer-private-test',
    signature: 'test-server-hmac-not-a-host-signature',
  };
  const verificationDigest = digest(receipt);
  const availability = {
    schema: 'summer.owned-work-verification-available/v1',
    taskKey: key,
    verificationDigest,
    availableAt: '2026-10-09T01:07:00Z',
    receiptPath: receipt.receiptPath + '.available.json',
    signatureKeyId: 'summer-private-test',
    signature: 'test-server-hmac-not-a-host-signature',
  };
  return {
    ...receipt,
    verificationDigest,
    availability,
    availabilityDigest: digest(availability),
  };
}
test('server-authenticated predecessor/availability preserve full immutable proof; malformed or cross-bound never passes', () => {
  const f = fixture();
  f.records.verifiedPredecessor = predecessor();
  assert.deepEqual(
    validateCurrentTaskRecords(
      f.records,
      f.task,
      f.keys,
      f.original,
      now,
      f.page.prospectiveParents[0]
    ),
    f.records
  );
  const without = structuredClone(f.records);
  without.verifiedPredecessor.availability = null;
  without.verifiedPredecessor.availabilityDigest = null;
  assert.deepEqual(
    validateCurrentTaskRecords(
      without,
      f.task,
      f.keys,
      f.original,
      now,
      f.page.prospectiveParents[0]
    ),
    without
  );
  for (const change of [
    p => (p.taskKey = '0'.repeat(64)),
    p => (p.originalHost = 'other'),
    p => (p.extra = true),
    p => (p.verification.outcome.status = 'unknown'),
    p => (p.release.commitSha = '0'.repeat(40)),
    p => (p.verificationDigest = '0'.repeat(64)),
    p => (p.availability.taskKey = '0'.repeat(64)),
    p => (p.availability.availableAt = '2026-10-09T01:00:00Z'),
    p => (p.availability.availableAt = '2026-10-09T02:00:00Z'),
    p => (p.availabilityDigest = null),
    p => (p.release.deployedAt = '2026-10-09T01:09:00Z'),
  ]) {
    const row = structuredClone(f.records);
    change(row.verifiedPredecessor);
    assert.throws(() =>
      validateCurrentTaskRecords(
        row,
        f.task,
        f.keys,
        f.original,
        now,
        f.page.prospectiveParents[0]
      )
    );
  }
});
test('signed legacy summary is retained without becoming native admission, including actual failed execution', () => {
  const f = fixture();
  for (const status of ['succeeded', 'failed']) {
    const execution = signed(
      {
        schema: 'jovie.symphony-native-queue-execution/v1',
        taskKey: key,
        issueIdentifier: 'JOV-6001',
        action,
        status,
        detail: 'original signed summary',
        completedAt: '2026-10-09T01:03:00Z',
        claim: { state: 'In Progress', assignee: null },
        execution: {
          mutationAttempted: false,
          authority:
            status === 'failed'
              ? 'native-queue-mutation-authority-unavailable'
              : 'exact-source-ci-native-queue-production-gates-remain-required',
          pr: status === 'failed' ? null : 100,
          head: null,
        },
        source: { ...f.task.source, action },
        signatureKeyId: 'host-test',
      },
      host.privateKey
    );
    const row = { ...f.records, execution, state: `execution-${status}` };
    assert.deepEqual(
      validateCurrentTaskRecords(
        row,
        f.task,
        f.keys,
        f.original,
        now,
        f.page.prospectiveParents[0]
      ),
      row
    );
    for (const change of [
      r => (r.execution.extra = true),
      r => (r.execution.signature = 'ed25519=' + 'A'.repeat(86)),
      r => (r.execution.taskKey = '0'.repeat(64)),
      r => (r.execution.completedAt = '2026-10-09T00:00:00Z'),
      r => (r.state = 'execution-missing'),
    ]) {
      const v = structuredClone(row);
      change(v);
      assert.throws(() =>
        validateCurrentTaskRecords(
          v,
          f.task,
          f.keys,
          f.original,
          now,
          f.page.prospectiveParents[0]
        )
      );
    }
  }
});
test('child resealing cannot change inherited budget/actions/predicate or invent parent lineage', () => {
  const f = fixture();
  assert.throws(
    () =>
      validateCurrentTaskRecords(f.records, f.task, f.keys, f.original, now),
    /child-parent-unavailable/
  );
  for (const change of [
    o => o.budget.maxAttempts++,
    o => (o.budget.maxSpendUsd = 1),
    o => (o.permittedActions = ['outbound', 'bind-projected-child']),
    o => (o.successPredicate.statement = 'replace proof'),
    o => (o.evidence[1].observedAt = '2026-10-09T00:00:00Z'),
    o => (o.evidence[2].ref = 'symphony-projection:' + '0'.repeat(64)),
  ]) {
    const row = structuredClone(f.records),
      { digest: _digest, ...body } = row.canonicalChild.order;
    change(body);
    row.canonicalChild.order = sealWorkOrder(body);
    assert.throws(() =>
      validateCurrentTaskRecords(
        row,
        f.task,
        f.keys,
        f.original,
        now,
        f.page.prospectiveParents[0]
      )
    );
  }
  const fast = structuredClone(f.records),
    { digest: _fastDigest, ...fastBody } = fast.canonicalChild.order;
  fast.canonicalChild.order = sealWorkOrder({
    ...fastBody,
    evidence: fast.canonicalChild.order.evidence.map((e, i) =>
      i === 1 ? { ...e, observedAt: '2026-10-09T01:01:10Z' } : e
    ),
  });
  assert.deepEqual(
    validateCurrentTaskRecords(
      fast,
      f.task,
      f.keys,
      f.original,
      now,
      f.page.prospectiveParents[0]
    ),
    fast
  );
});
test('only the approved original public outbox trust binds a production reader', () => {
  assert.throws(
    () => createCurrentHostReader(registry(), { environment: environment() }),
    /outbox-trust-unapproved/
  );
  assert.throws(
    () =>
      createCurrentHostReader(registry(), {
        environment: environment(),
        outboxTrust: { ...trust(), 'another-key': '0'.repeat(64) },
      }),
    /outbox-trust-incomplete/
  );
});

test('malformed original public key identity fails before any private loader read', () => {
  const environment = new Proxy(
    {},
    {
      get() {
        throw Error('must not read private configuration');
      },
    }
  );
  for (const keyId of [null, 'bad key', '', 4, ['host-test']]) {
    assert.throws(
      () => createCurrentHostReader({ ...registry(), keyId }, { environment }),
      /original-host-binding-unavailable/
    );
  }
});
test('approved public-only handoff needs no credential installation or alternate signer', () => {
  const env = environment();
  delete env.SUMMER_BOTTLENECK_EVE_OUTBOX_VERIFICATION_KEYS_JSON;
  const reader = createCurrentHostReader(registry(), {
    environment: env,
    fetchImpl: () => {
      throw Error('no live read authorized by a constructor');
    },
  });
  assert.equal(typeof reader.readOutbox, 'function');
  assert.throws(() => reader.proveRead({}), /authenticated-read-required/);
});
test('predecessor cannot select another child even with consistent reconstructed digests', () => {
  const f = fixture(),
    p = predecessor();
  p.issueIdentifier = 'JOV-7002';
  const {
    verificationDigest: _d,
    availability,
    availabilityDigest: _a,
    ...body
  } = p;
  p.verificationDigest = digest(body);
  p.availability = {
    ...availability,
    verificationDigest: p.verificationDigest,
  };
  p.availabilityDigest = digest(p.availability);
  f.records.verifiedPredecessor = p;
  assert.throws(
    () =>
      validateCurrentTaskRecords(
        f.records,
        f.task,
        f.keys,
        f.original,
        now,
        f.page.prospectiveParents[0]
      ),
    /predecessor-invalid/
  );
});
