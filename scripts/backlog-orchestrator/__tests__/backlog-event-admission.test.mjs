import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  admissionJournal,
  admitBacklogEvent,
  backlogEventInScope,
  OLD_HTTP_MAX_MS,
  observeSummerWriterHandoff,
} from '../backlog-event-admission.mjs';

const NOW = Date.parse('2026-10-16T22:00:00.000Z');
const ID = '68b3e8de-588e-46ba-8209-84329d154627';
const VERSION = '2026-10-16T21:32:20.383Z';
const CONTRACT = 'gem-linear-admission/2026-10-16.1';
const PRIVATE_MARKER = 'private-linear-prompt-6641-do-not-log';
const environment = { SUMMER_BOTTLENECK_ORIGIN: 'https://summer.jov.ie' };
const identity = {
  projectId: 'prj_LaVQva346cjp5XfrbAIIQUln7tPH',
  teamId: 'team_bpNDbti6srVLYPKdmQLu4UgT',
  deploymentId: 'dpl_Current001',
  latestDeploymentId: 'dpl_Current001',
  sourceRevision: 'a'.repeat(40),
  environment: 'production',
  providerOwnerReadback: 'separate-required',
};
const production = {
  ...identity,
  schema: 'jovie.service-identity/v1',
  id: 'company.summer',
  status: 'source-bound',
  productionOrigin: environment.SUMMER_BOTTLENECK_ORIGIN,
  blobAuth: 'oidc',
  target: 'production',
};
const delivery = {
  identifier: 'JOV-6641',
  issueId: ID,
  expectedState: 'Backlog',
  expectedLinearUpdatedAt: VERSION,
};
const connection = nodes => ({ nodes, pageInfo: { hasNextPage: false } });
function governorFenceSet(identifier = delivery.identifier, issueId = ID) {
  const families = [
    ['agent-ready', 'summer-backlog-governor:agent-ready:'],
    ['unscoped', 'summer-backlog-governor:'],
    ['devin', 'summer-backlog-governor:devin:'],
  ].map(([family, prefix]) => {
    const key = createHash('sha256')
      .update(prefix + identifier)
      .digest('hex');
    return {
      family,
      status: 'fenced',
      idempotencyKey: key,
      dispatchPath: `summer-company/linear-transitions/${key}/dispatch.json`,
      authorizesTransition: false,
    };
  });
  return {
    status: 'fenced',
    contract: CONTRACT,
    issueIdentifier: identifier,
    issueId,
    idempotencyKey: families[0].idempotencyKey,
    dispatchPath: families[0].dispatchPath,
    authorizesTransition: false,
    fenceSetContract: 'summer.legacy-governor-fence-set/2026-10-16.1',
    families,
  };
}
function issue() {
  return {
    id: ID,
    identifier: delivery.identifier,
    title: 'Cert v2 pure policy',
    description: PRIVATE_MARKER,
    createdAt: VERSION,
    updatedAt: VERSION,
    priority: 2,
    archivedAt: null,
    state: { name: 'Backlog', type: 'backlog' },
    assignee: null,
    delegate: null,
    parent: null,
    labels: connection([
      { id: '00000000-0000-4000-8000-000000000001', name: 'agent-ready' },
      { id: '00000000-0000-4000-8000-000000000002', name: 'dispatch-next' },
    ]),
    comments: connection([
      {
        id: '00000000-0000-4000-8000-000000000009',
        body: PRIVATE_MARKER,
        createdAt: VERSION,
        user: null,
      },
    ]),
    attachments: connection([]),
    children: connection([]),
    relations: connection([]),
    inverseRelations: connection([]),
  };
}
function receipt(at = NOW - 1000, binding = identity) {
  return {
    issueIdentifier: delivery.identifier,
    issueId: ID,
    authorizesDispatch: false,
    acceptedInvestigation: false,
    admissionDelegation: {
      contract: CONTRACT,
      writer: 'gem-fleet-gate',
      status: 'delegated',
      authorizesTransition: false,
    },
    legacyGovernorFence: governorFenceSet(),
    workflowDrainObservation: {
      schema: 'summer.workflow-drain-observation/v1',
      api: 'eve0.47.7:world.runs.list:canonical-storage',
      observedAt: new Date(at).toISOString(),
      identity: binding,
      status: 'observed',
      complete: true,
      authorizesTransition: false,
      authorizesDispatch: false,
      genericWriterDrain: 'unverified',
      counts: {
        pending: 0,
        running: 0,
        currentDeployment: 0,
        oldDeployment: 0,
        unknownLineage: 0,
      },
      runs: [],
      pagination: {
        pendingPages: 1,
        runningPages: 1,
        complete: true,
        maxPagesPerStatus: 4,
        pageSize: 100,
      },
      holds: [],
      retention: {
        status: 'not-reported',
        basis: 'pinned-canonical-current-nonterminal-storage-contract',
        scope: 'current-nonterminal-storage',
        historicalCoverage: 'not-claimed',
        windows: [],
      },
    },
  };
}
function memoryJournal(seed = true) {
  const rows = new Map();
  if (seed)
    rows.set('summer-source-epoch-0', {
      schema: 'jovie.summer-writer-handoff-observation/v1',
      contract: CONTRACT,
      epoch: 0,
      previousEpoch: -1,
      firstObservedAt: NOW - OLD_HTTP_MAX_MS,
      identity,
    });
  return {
    rows,
    read: key => rows.get(key) ?? null,
    create(key, value) {
      if (rows.has(key)) throw new Error('exclusive-conflict');
      rows.set(key, structuredClone(value));
      return value;
    },
  };
}
function world(options = {}) {
  const journal = memoryJournal(),
    current = issue(),
    events = [];
  let graphReads = 0;
  const abort = new AbortController();
  let time = NOW,
    expiresAt;
  const advance = ms => {
    time += ms;
    if (expiresAt !== undefined && time >= expiresAt)
      abort.abort(Error('native-backlog-guard-expired'));
  };
  const guard = {
    issueId: ID,
    priority: 2,
    signal: abort.signal,
    observation: {
      schema: 'jovie.backlog-admission-observation/v1',
      issue: delivery.identifier,
      allowed: true,
      authorizesTransition: false,
      authorizesDispatch: false,
      holds: [],
      evidence: {
        linearPreimages: { [ID]: structuredClone(current) },
        linearPreimagesObservedAt: NOW / 1000,
        observedAt: NOW / 1000,
        priority: 2,
        readOnly: true,
        cohortCount: 1,
        sourceHash: 'a'.repeat(64),
        policyHash: 'b'.repeat(64),
        cohortDigest: 'c'.repeat(64),
        releaseTree: 'd'.repeat(40),
        completedAt: NOW / 1000,
        revalidatedAt: NOW / 1000,
        localBoundAt: NOW / 1000,
        prObservedAt: NOW / 1000,
        historyObservedAt: NOW / 1000,
        cohortMetadataPreimages: {
          [ID]: Object.fromEntries(
            Object.entries(structuredClone(current))
              .filter(
                ([key]) =>
                  ![
                    'comments',
                    'attachments',
                    'children',
                    'relations',
                    'inverseRelations',
                  ].includes(key)
              )
              .map(([key, value]) => [
                key,
                key === 'labels' ? value.nodes : value,
              ])
          ),
        },
      },
    },
    async lock() {
      events.push('lock');
      if (options.lockFails) throw Error('lock');
      advance(options.lockPreparationMs ?? 0);
      expiresAt = time + 25_000;
    },
    async check() {
      events.push('check');
      abort.signal.throwIfAborted();
      if (options.checkFails) throw Error('check');
    },
    async finish(result) {
      events.push(result);
      if (options.finishFails) throw Error('release');
    },
    async close() {
      events.push('close');
    },
  };
  const client = {
    async graphql(_query, variables, transport) {
      if (Object.hasOwn(variables, 'filter')) {
        events.push('cohort');
        const row = Object.fromEntries(
          Object.entries(structuredClone(current)).filter(
            ([key]) =>
              ![
                'comments',
                'attachments',
                'children',
                'relations',
                'inverseRelations',
              ].includes(key)
          )
        );
        row.labels.pageInfo.endCursor = null;
        return {
          issues: {
            nodes: [row],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        };
      }
      graphReads++;
      events.push('read');
      assert.equal(transport.maxAttempts, 1);
      assert.equal(transport.timeoutMs, 4000);
      if (options.readFails) throw Error('read');
      const value = structuredClone(current);
      if (options.beforeRead) options.beforeRead(value, graphReads);
      await transport.fetchImpl('https://linear.example/graphql', {
        signal: AbortSignal.timeout(4000),
      });
      return Object.fromEntries(
        Object.keys(variables).map((key, index) => [`issue${index}`, value])
      );
    },
    async updateIssue(id, input, transport) {
      assert.equal(id, ID);
      assert.deepEqual(input, {
        stateId: 'c6c00506-dc9f-4910-8ff7-3874dd77174c',
      });
      assert.equal(transport.maxAttempts, 1);
      assert.equal(transport.rateLimitMaxTotalWaitMs, 0);
      assert.ok(journal.read(`intent-${ID}`));
      events.push('write');
      if (options.writeFails) throw Error('unknown write');
      current.state = { name: 'Todo', type: 'unstarted' };
      current.updatedAt = new Date(time).toISOString();
      return options.writeResult ?? { issueUpdate: { success: true } };
    },
  };
  const deps = {
    journal,
    environment,
    now: () => time,
    fetchImpl: async (_url, init) => {
      init?.signal?.throwIfAborted();
      return Response.json(production);
    },
    openGuard: async () => guard,
  };
  return {
    journal,
    current,
    events,
    guard,
    client,
    deps,
    advance,
    now: () => time,
    run: () =>
      admitBacklogEvent(
        delivery,
        issue(),
        receipt(),
        client,
        async (_delivery, transport) => {
          assert.equal(transport.signal, guard.signal);
          if (options.beforeSummer) options.beforeSummer(advance);
          transport.signal.throwIfAborted();
          return receipt(time);
        },
        deps
      ),
  };
}

test('scope consumes explicit urgency/P0 and maintained High designation without priority inflation', () => {
  assert.equal(backlogEventInScope(issue()), true);
  for (const priority of [0, 2, 3, 4, '1', true])
    assert.equal(
      backlogEventInScope({ ...issue(), priority, labels: connection([]) }),
      false
    );
  assert.equal(
    backlogEventInScope({ ...issue(), priority: 1, labels: connection([]) }),
    true
  );
  assert.equal(
    backlogEventInScope({
      ...issue(),
      priority: 3,
      title: 'P0 — bounded repair',
      labels: connection([]),
    }),
    true
  );
  assert.equal(
    backlogEventInScope({
      ...issue(),
      priority: 3,
      labels: connection([{ id: 'p0', name: 'P0' }]),
    }),
    true
  );
  assert.equal(
    backlogEventInScope({
      ...issue(),
      labels: connection([{ id: 'r', name: 'agent-ready' }]),
    }),
    false
  );
});

test('first source observation starts a real window; later pass consumes it without a supplied drain grant', async () => {
  const journal = memoryJournal(false);
  let time = NOW;
  const deps = {
    journal,
    environment,
    now: () => time,
    fetchImpl: async () => Response.json(production),
  };
  let result = await observeSummerWriterHandoff(receipt(time), deps);
  assert.equal(result.reason, 'summer-old-http-window-pending');
  assert.equal(journal.rows.size, 1);
  time += OLD_HTTP_MAX_MS;
  result = await observeSummerWriterHandoff(receipt(time), deps);
  assert.equal(result.status, 'observed');
  assert.equal(result.authorizesTransition, false);
  assert.equal(result.firstSourceObservedAt, NOW);
});

test('old single-key and foreign issue fence receipts hold before a source epoch or admission write', async () => {
  const other = {
    ...receipt(),
    issueIdentifier: 'JOV-6642',
    legacyGovernorFence: governorFenceSet('JOV-6642'),
  };
  const old = receipt();
  delete old.legacyGovernorFence.fenceSetContract;
  delete old.legacyGovernorFence.families;
  for (const candidate of [
    old,
    other,
    { ...receipt(), authorizesDispatch: true },
    { ...receipt(), acceptedInvestigation: true },
  ]) {
    const journal = memoryJournal(false);
    const result = await observeSummerWriterHandoff(candidate, {
      journal,
      environment,
      now: () => NOW,
      issueIdentifier: delivery.identifier,
      issueId: ID,
      fetchImpl: async () =>
        assert.fail('unverified fence cannot read runtime identity'),
    });
    assert.equal(result.reason, 'summer-legacy-governor-fence-set-unverified');
    assert.equal(journal.rows.size, 0);
  }
  for (const stage of ['first', 'second']) {
    const w = world();
    const result = await admitBacklogEvent(
      delivery,
      issue(),
      stage === 'first' ? other : receipt(),
      w.client,
      async () => other,
      w.deps
    );
    assert.equal(result.reason, 'summer-legacy-governor-fence-set-unverified');
    assert.equal(w.journal.read(`intent-${ID}`), null);
    assert.equal(w.events.filter(event => event === 'write').length, 0);
  }
});

test('A to B to A begins a new source epoch even when A was previously fully drained', async () => {
  const journal = memoryJournal();
  let binding = {
    ...identity,
    deploymentId: 'dpl_Other002',
    latestDeploymentId: 'dpl_Other002',
  };
  const deps = {
    journal,
    environment,
    now: () => NOW,
    fetchImpl: async () => Response.json({ ...production, ...binding }),
  };
  assert.equal(
    (await observeSummerWriterHandoff(receipt(NOW, binding), deps)).reason,
    'summer-old-http-window-pending'
  );
  binding = identity;
  const result = await observeSummerWriterHandoff(receipt(NOW, binding), deps);
  assert.equal(result.reason, 'summer-old-http-window-pending');
  assert.equal(journal.rows.size, 3);
  assert.equal(journal.read('summer-source-epoch-2').firstObservedAt, NOW);
});

test('source/World identity, latest mapping, delegation and malformed generations fail closed', async () => {
  const base = {
    journal: memoryJournal(),
    environment,
    now: () => NOW,
    fetchImpl: async () => Response.json(production),
  };
  /** @type {[import('../backlog-event-admission.mjs').HandoffReceipt, string][]} */
  const cases = [
    [
      { ...receipt(), admissionDelegation: {} },
      'summer-single-writer-delegation-unverified',
    ],
    [
      { ...receipt(), workflowDrainObservation: {} },
      'summer-world-observation-invalid',
    ],
    [
      receipt(NOW, { ...identity, sourceRevision: 'b'.repeat(40) }),
      'summer-production-world-binding-mismatch',
    ],
    [
      receipt(NOW, { ...identity, latestDeploymentId: 'dpl_Old' }),
      'summer-provider-latest-mapping-unverified',
    ],
    [
      {
        ...receipt(),
        workflowDrainObservation: {
          ...receipt().workflowDrainObservation,
          status: 'held',
          complete: false,
          holds: ['old-run'],
        },
      },
      'summer-old-world-writers-unverified',
    ],
  ];
  for (const [changed, reason] of cases)
    assert.equal(
      (await observeSummerWriterHandoff(changed, base)).reason,
      reason
    );
  assert.equal(
    (await observeSummerWriterHandoff(receipt(), { ...base, environment: {} }))
      .reason,
    'summer-production-origin-unverified'
  );
  for (const changed of [
    { epoch: 2 },
    { previousEpoch: 7 },
    { contract: 'old' },
    { firstObservedAt: NOW + 1 },
    { firstObservedAt: NaN },
    { firstObservedAt: -1 },
    { firstObservedAt: NOW / 1000 },
  ]) {
    const journal = memoryJournal();
    journal.rows.set('summer-source-epoch-0', {
      ...journal.read('summer-source-epoch-0'),
      ...changed,
    });
    assert.equal(
      (await observeSummerWriterHandoff(receipt(), { ...base, journal }))
        .reason,
      'summer-source-observation-conflict'
    );
  }
  for (const value of [
    { ...production, status: 'configured' },
    { ...production, target: 'preview' },
    { ...production, blobAuth: 'token' },
    { ...production, sourceRevision: 'unknown' },
    { ...production, projectId: 'other' },
  ])
    await assert.rejects(
      observeSummerWriterHandoff(receipt(), {
        ...base,
        fetchImpl: async () => Response.json(value),
      }),
      /identity-invalid/
    );
  await assert.rejects(
    observeSummerWriterHandoff(receipt(), {
      ...base,
      fetchImpl: async () => new Response('x', { status: 503 }),
    }),
    /identity-unavailable/
  );
});

test('one guarded state-only write preserves custody and journals verified readback after release', async () => {
  const w = world(),
    result = await w.run();
  assert.equal(result.disposition, 'Todo');
  assert.equal(result.mutations, 1);
  assert.equal(result.wakeSymphony, true);
  assert.deepEqual(w.events, [
    'lock',
    'read',
    'cohort',
    'check',
    'check',
    'write',
    'check',
    'read',
    'cohort',
    'check',
    'done',
    'close',
  ]);
  assert.equal(w.journal.read(`readback-${ID}`).nativeClaim, 'not-observed');
  assert.equal(
    w.journal.read(`intent-${ID}`).nativeEvidence.linearPreimages,
    undefined
  );
  assert.ok(JSON.stringify(w.journal.read(`intent-${ID}`)).length < 65536);
  const replay = await w.run();
  assert.equal(replay.reason, 'backlog-admission-already-recorded');
  assert.equal(w.events.filter(x => x === 'write').length, 1);
});

test('success and held native outputs retain evidence digests and named custody without private preimages', async () => {
  for (const held of [false, true]) {
    const w = world();
    if (held)
      Object.assign(w.guard.observation, {
        allowed: false,
        holds: [
          {
            code: 'terminal-attempt',
            owner: 'JOV-7089 reentry owner',
            nextAction: 'certified reentry',
            evidence: {
              issue: delivery.identifier,
              commentId: '00000000-0000-4000-8000-000000000009',
              pr: 19037,
              body: PRIVATE_MARKER,
            },
          },
        ],
      });
    const result = await w.run();
    assert.equal(result.disposition, held ? 'held' : 'Todo');
    assert.equal(
      w.guard.observation.evidence.linearPreimages[ID].description,
      PRIVATE_MARKER
    );
    assert.equal(
      w.guard.observation.evidence.linearPreimages[ID].comments.nodes[0].body,
      PRIVATE_MARKER
    );
    const summary = result.nativeObservation;
    assert.equal(
      summary.schema,
      'jovie.backlog-admission-observation-summary/v1'
    );
    assert.equal(
      summary.sourceSchema,
      'jovie.backlog-admission-observation/v1'
    );
    assert.equal(summary.issue, delivery.identifier);
    assert.equal(summary.allowed, !held);
    assert.equal(summary.authorizesTransition, false);
    assert.equal(summary.authorizesDispatch, false);
    assert.equal(summary.evidence.criticalPreimageCount, 1);
    assert.equal(summary.evidence.cohortPreimageCount, 1);
    assert.ok(typeof summary.evidence.criticalPreimageDigest === 'string');
    assert.match(summary.evidence.criticalPreimageDigest, /^[a-f0-9]{64}$/);
    assert.equal(summary.evidence.cohortDigest, 'c'.repeat(64));
    if (held) {
      assert.equal(result.owner, 'JOV-7089 reentry owner');
      assert.equal(summary.holds[0].owner, 'JOV-7089 reentry owner');
      assert.equal(summary.holds[0].code, 'terminal-attempt');
      assert.equal(summary.holds[0].nextAction, 'certified reentry');
      assert.deepEqual(summary.holds[0].evidence.references, [
        'issue:JOV-6641',
        'commentId:00000000-0000-4000-8000-000000000009',
        'pr:19037',
      ]);
      assert.match(summary.holds[0].evidence.sha256, /^[a-f0-9]{64}$/);
    }
    const logged = JSON.stringify({
      result,
      journal: [...w.journal.rows.values()],
    });
    assert.ok(!logged.includes(PRIVATE_MARKER));
    assert.ok(!logged.includes('"linearPreimages":'));
    assert.ok(!logged.includes('"cohortMetadataPreimages":'));
  }
});

test('unsupported native error observations never fall back to raw payloads', async () => {
  const w = world();
  w.deps.openGuard = async () => {
    throw Object.assign(Error(PRIVATE_MARKER), {
      observation: {
        ...w.guard.observation,
        schema: 'unknown',
        privatePayload: PRIVATE_MARKER,
      },
    });
  };
  const result = await w.run();
  assert.equal(result.disposition, 'held');
  assert.equal(result.nativeObservation, undefined);
  assert.ok(!JSON.stringify(result).includes(PRIVATE_MARKER));
  assert.equal(w.journal.read(`intent-${ID}`), null);
});

test('held World output uses the private-safe projection through the actual handoff', async () => {
  const candidate = receipt();
  Object.assign(candidate.workflowDrainObservation, {
    status: 'held',
    complete: false,
    holds: ['workflow-world-old-deployment-active'],
    runs: [{ body: PRIVATE_MARKER }],
    privatePayload: PRIVATE_MARKER,
  });
  const result = await observeSummerWriterHandoff(candidate, {
    journal: memoryJournal(),
    environment,
    now: () => NOW,
    fetchImpl: async () => Response.json(production),
  });
  assert.equal(result.reason, 'summer-old-world-writers-unverified');
  assert.equal(
    result.worldObservation.schema,
    'summer.workflow-drain-observation-summary/v1'
  );
  assert.deepEqual(result.worldObservation.holds, [
    'workflow-world-old-deployment-active',
  ]);
  assert.ok(!JSON.stringify(result).includes(PRIVATE_MARKER));
});

test('twenty seconds of remote lock preparation precedes the fresh final World observation', async () => {
  const w = world({ lockPreparationMs: 20_000 });
  const result = await w.run();
  assert.equal(result.disposition, 'Todo');
  assert.equal(w.now(), NOW + 20_000);
  assert.equal(
    w.journal.read(`intent-${ID}`).createdAt,
    new Date(w.now()).toISOString()
  );
  assert.equal(w.events.filter(event => event === 'write').length, 1);
});

test('expiry inside the fence during Summer or current Linear reads creates no intent or write', async () => {
  let w;
  for (const phase of ['summer', 'linear']) {
    w = world(
      phase === 'summer'
        ? { beforeSummer: advance => advance(26_000) }
        : { beforeRead: () => w.advance(26_000) }
    );
    const result = await w.run();
    assert.equal(result.disposition, 'held');
    assert.equal(result.mutations, 0);
    assert.equal(w.guard.signal.aborted, true);
    assert.equal(w.journal.read(`intent-${ID}`), null);
    assert.equal(w.events.filter(event => event === 'write').length, 0);
    assert.equal(w.events.at(-1), 'close');
  }
});

test('expiry after durable intent remains unknown on replay without retrying the write', async () => {
  const w = world();
  const create = w.journal.create;
  w.journal.create = (key, value) => {
    const persisted = create(key, value);
    if (key === `intent-${ID}`) w.advance(26_000);
    return persisted;
  };
  const result = await w.run();
  assert.equal(result.reason, 'backlog-admission-effect-unknown');
  assert.ok(w.journal.read(`intent-${ID}`));
  assert.equal(w.journal.read(`readback-${ID}`), null);
  assert.equal(w.events.filter(event => event === 'write').length, 0);
  const checks = w.events.filter(event => event === 'check').length;
  assert.equal((await w.run()).reason, 'backlog-admission-effect-unknown');
  assert.equal(w.events.filter(event => event === 'check').length, checks);
});

test('validated native hold retains its named owner/code without disclosing raw transport messages', async () => {
  const w = world();
  w.deps.openGuard = async () => {
    throw Object.assign(Error('private provider payload'), {
      code: 'native-backlog-guard-held',
      observation: {
        ...w.guard.observation,
        allowed: false,
        authorizesTransition: false,
        authorizesDispatch: false,
        holds: [
          {
            owner: 'JOV-7089 reentry owner',
            code: 'terminal-attempt',
            evidence: {
              issue: delivery.identifier,
              commentId: '00000000-0000-4000-8000-000000000009',
              body: PRIVATE_MARKER,
            },
            nextAction: 'certified reentry',
          },
        ],
      },
    });
  };
  const result = await w.run();
  assert.equal(result.owner, 'JOV-7089 reentry owner');
  assert.equal(result.gateCode, 'native-backlog-guard-held');
  assert.ok(!JSON.stringify(result).includes('private provider payload'));
  assert.ok(!JSON.stringify(result).includes(PRIVATE_MARKER));
  assert.equal(
    result.nativeObservation.holds[0].evidence.references[0],
    'issue:JOV-6641'
  );
  assert.ok(!w.events.includes('write'));
});

test('a numeric transport exception code is never reported as a named native gate', async () => {
  for (const error of [
    new DOMException('private transport', 'AbortError'),
    Object.assign(Error('private transport'), { code: 20 }),
  ]) {
    const w = world();
    w.deps.openGuard = async () => {
      throw error;
    };
    const result = await w.run();
    assert.equal(result.disposition, 'held');
    assert.equal(result.gateCode, undefined);
    assert.equal(w.journal.read(`intent-${ID}`), null);
    assert.equal(w.events.filter(event => event === 'write').length, 0);
    assert.ok(!JSON.stringify(result).includes('private transport'));
  }
});

test('comment-only or incoming dependency changes at unchanged updatedAt prevent any write', async () => {
  for (const mutate of [
    row =>
      row.comments.nodes.push({
        id: '00000000-0000-4000-8000-000000000003',
        body: 'accepted custody',
        createdAt: VERSION,
        user: null,
      }),
    row =>
      row.inverseRelations.nodes.push({
        id: '00000000-0000-4000-8000-000000000004',
        type: 'blocks',
        issue: {
          id: '00000000-0000-4000-8000-000000000005',
          identifier: 'JOV-6640',
        },
      }),
    row =>
      (row.delegate = {
        id: '00000000-0000-4000-8000-000000000006',
        name: 'Existing worker',
      }),
  ]) {
    const w = world({ beforeRead: mutate }),
      result = await w.run();
    assert.equal(result.reason, 'backlog-final-preimage-changed');
    assert.ok(!w.events.includes('write'));
    assert.equal(w.journal.read(`intent-${ID}`), null);
    assert.equal(w.events.at(-1), 'close');
  }
});

test('postwrite custody/dependency drift, failed write or release remains uncertain and never retries', async () => {
  for (const options of [
    { writeFails: true },
    { writeResult: { issueUpdate: { success: false } } },
    { finishFails: true },
    {
      beforeRead: (row, count) => {
        if (count === 2)
          row.comments.nodes.push({
            id: '00000000-0000-4000-8000-000000000007',
            body: 'custody',
            createdAt: VERSION,
            user: null,
          });
      },
    },
  ]) {
    const w = world(options),
      result = await w.run();
    assert.equal(result.reason, 'backlog-admission-effect-unknown');
    assert.ok(w.journal.read(`intent-${ID}`));
    assert.equal(w.journal.read(`readback-${ID}`), null);
    assert.equal((await w.run()).reason, 'backlog-admission-effect-unknown');
    assert.equal(w.events.filter(x => x === 'write').length, 1);
  }
});

test('native holds, mismatched preimages, old replay and transport errors never imply an admission', async () => {
  for (const options of [
    { lockFails: true },
    { checkFails: true },
    { readFails: true },
  ]) {
    const w = world(options),
      result = await w.run();
    assert.equal(result.mutations, 0);
    assert.ok(!w.events.includes('write'));
    assert.equal(w.events.at(-1), 'close');
  }
  let w = world();
  w.guard.observation.allowed = false;
  assert.equal((await w.run()).reason, 'native-backlog-admission-held');
  w = world();
  w.guard.observation.evidence.linearPreimages[ID].updatedAt = 'old';
  assert.equal(
    (await w.run()).reason,
    'native-linear-preimage-binding-invalid'
  );
  w = world();
  assert.equal(
    (
      await admitBacklogEvent(
        delivery,
        issue(),
        receipt(),
        w.client,
        async () => receipt(NOW - 1000),
        w.deps
      )
    ).reason,
    'summer-world-repeat-unverified'
  );
  w = world();
  assert.equal(
    (
      await admitBacklogEvent(
        delivery,
        { ...issue(), priority: 3 },
        receipt(),
        w.client,
        async () => receipt(NOW),
        w.deps
      )
    ).reason,
    'backlog-event-outside-authorized-tier'
  );
});

test('filesystem journal is append-only, private and rejects symlinks, malformed data and oversized receipts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'backlog-intent-'));
  try {
    const journal = admissionJournal(directory);
    assert.equal(journal.read('missing'), null);
    assert.deepEqual(journal.create('intent', { effect: 'unknown' }), {
      effect: 'unknown',
    });
    assert.deepEqual(journal.read('intent'), { effect: 'unknown' });
    assert.throws(() => journal.create('intent', {}));
    assert.equal(
      readFileSync(join(directory, 'intent.json'), 'utf8'),
      ' {"effect":"unknown"}'.trim()
    );
    assert.throws(() => journal.read('../outside'), /key-invalid/);
    writeFileSync(join(directory, 'large.json'), 'x'.repeat(65537));
    assert.throws(() => journal.read('large'), /journal-invalid/);
    writeFileSync(join(directory, 'invalid.json'), 'not-json');
    assert.throws(() => journal.read('invalid'));
    symlinkSync(join(directory, 'intent.json'), join(directory, 'link.json'));
    assert.throws(() => journal.read('link'), /journal-invalid/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
