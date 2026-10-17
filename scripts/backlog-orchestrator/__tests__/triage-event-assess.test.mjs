import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { LinearTransportError } from '../linear-client.mjs';
import { requestSummerAssessment } from '../summer-triage-assessment-client.mjs';

import {
  assessTriageEvent as assessWithRealClient,
  assessBacklogSweep as backlogSweepWithRealClient,
  escalationBlockOf,
  parseTriageEvent,
  runCli,
  assessTriageSweep as sweepWithRealClient,
  triageSweepThrottle,
} from '../triage-event-assess.mjs';

/** Partial clients are deliberate test doubles; production uses the full Linear module.
 * @param {any} event
 * @param {any} client
 * @param {any} summer
 * @param {any} [options]
 * @returns {Promise<any>}
 */
function assessTriageEvent(event, client, summer, options) {
  return assessWithRealClient(event, client, summer, options);
}

/** @param {any} client @param {any} [summer] @param {any} [options] @returns {Promise<any>} */
function assessTriageSweep(client, summer, options) {
  return sweepWithRealClient(client, summer, options);
}

/** @param {any} client @param {any} [summer] @param {any} [options] @returns {Promise<any>} */
function assessBacklogSweep(client, summer, options) {
  return backlogSweepWithRealClient(client, summer, options);
}

const ISSUE_ID = '68b3e8de-588e-46ba-8209-84329d154627';
const TRIAGE_ID = '9844cfe6-6cf4-4347-842c-893a68f349b8';
const BACKLOG_ID = '1551ed21-7743-4573-82d8-8949410d3b8d';
const BACKLOG_VERSION = '2026-10-16T20:00:00.000Z';
const summer = decision => async () => ({
  decision,
  schema: 'summer.linear-triage-assessment/v1',
  linearUpdatedAt: '2026-09-24T00:00:00.000Z',
  authorizesDispatch: false,
  acceptedInvestigation: false,
});

test('Backlog catch-up consumes current urgency on restart, rotates held candidates, and respects its bounded operation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'backlog-catch-up-'));
  const cacheFile = join(directory, 'cache.json');
  const base = {
    ...backlogIssue(),
    archivedAt: null,
    createdAt: BACKLOG_VERSION,
    labels: [{ id: 'ready', name: 'agent-ready' }],
  };
  let rows = [
    { ...base, id: ISSUE_ID, identifier: 'JOV-6500', priority: 2 },
    {
      ...base,
      id: '078178ed-5ea0-43ae-9f4b-2eb60dc10859',
      identifier: 'JOV-6641',
      priority: 1,
    },
  ];
  const attempts = [];
  const deps = {
    cacheFile,
    maxIssues: 1,
    now: () => Date.parse(BACKLOG_VERSION),
    discover: async () => structuredClone(rows),
    assess: async event => {
      attempts.push(event.client_payload.issue_identifier);
      return {
        issue: event.client_payload.issue_identifier,
        disposition: 'held',
        mutations: 0,
        wakeSymphony: false,
        reason: 'dependency-held',
      };
    },
  };
  try {
    assert.equal((await assessBacklogSweep({}, undefined, deps)).assessed, 1);
    assert.deepEqual(attempts, ['JOV-6641']);
    await assessBacklogSweep({}, undefined, deps);
    assert.deepEqual(attempts, ['JOV-6641', 'JOV-6500']);
    rows = [
      { ...rows[0], priority: 1, updatedAt: '2026-10-16T21:00:00Z' },
      { ...rows[1], priority: 2 },
    ];
    await assessBacklogSweep({}, undefined, deps);
    assert.equal(attempts.at(-1), 'JOV-6500');
    assert.equal(
      (await assessBacklogSweep({}, undefined, { ...deps, maxIssues: 0 }))
        .assessed,
      0
    );
    assert.equal(
      (await assessBacklogSweep({}, undefined, { ...deps, timeBudgetMs: 1 }))
        .assessed,
      0
    );
    const globalHold = await assessBacklogSweep({}, undefined, {
      ...deps,
      maxIssues: 3,
      assess: async () => ({ reason: 'summer-old-world-writers-unverified' }),
    });
    assert.equal(globalHold.assessed, 1);
    const failed = await assessBacklogSweep({}, undefined, {
      ...deps,
      assess: async () => {
        throw Error('private transport');
      },
    });
    assert.equal(failed.failed, 1);
    assert.ok(!JSON.stringify(failed).includes('private transport'));
    const unknown = await assessBacklogSweep({}, undefined, {
      ...deps,
      discover: async () => {
        throw Error('private');
      },
    });
    assert.equal(unknown.inventoryUnknown, true);
    assert.equal(unknown.failed, 1);
    const empty = await assessBacklogSweep({}, undefined, {
      ...deps,
      discover: async () => [],
    });
    assert.equal(empty.assessed, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('readiness-only changes reset the durable Backlog cursor across fresh consumer instances', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'backlog-readiness-restart-'));
  const cacheFile = join(directory, 'cache.json');
  const base = {
    ...backlogIssue(),
    archivedAt: null,
    createdAt: BACKLOG_VERSION,
    priority: 1,
    labels: [{ id: 'ready', name: 'agent-ready' }],
  };
  let rows = [
    {
      ...base,
      id: '11111111-1111-4111-8111-111111111111',
      identifier: 'JOV-6500',
    },
    {
      ...base,
      id: '22222222-2222-4222-8222-222222222222',
      identifier: 'JOV-6501',
    },
    {
      ...base,
      id: '33333333-3333-4333-8333-333333333333',
      identifier: 'JOV-6502',
    },
  ];
  const attempts = [];
  const deps = {
    cacheFile,
    maxIssues: 1,
    now: () => Date.parse(BACKLOG_VERSION),
    discover: async () => structuredClone(rows),
    assess: async delivery => {
      attempts.push(delivery.client_payload.issue_identifier);
      return {
        disposition: 'held',
        reason: 'dependency-held',
        mutations: 0,
        wakeSymphony: false,
      };
    },
  };
  try {
    await assessBacklogSweep({}, undefined, deps);
    rows = rows.map((row, index) =>
      index === 2 ? { ...row, labels: [] } : row
    );
    // Priority, version and all other ranking metadata are unchanged.
    // Real process restarts use the canonical URL and inherit V8 coverage.
    // Query-string imports create duplicate same-path coverage records in Node.
    const restart = () => {
      const child = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
        import { assessBacklogSweep } from ${JSON.stringify(new URL('../triage-event-assess.mjs', import.meta.url).href)};
        const attempts = [];
        await assessBacklogSweep({}, undefined, {
          cacheFile: ${JSON.stringify(cacheFile)}, maxIssues: 1,
          now: () => ${Date.parse(BACKLOG_VERSION)},
          discover: async () => ${JSON.stringify(rows)},
          assess: async event => { attempts.push(event.client_payload.issue_identifier);
            return { disposition: 'held', reason: 'dependency-held', mutations: 0, wakeSymphony: false }; }
        });
        process.stdout.write(JSON.stringify(attempts));
      `,
        ],
        { encoding: 'utf8', timeout: 10_000 }
      );
      assert.equal(child.status, 0, child.stderr);
      assert.equal(child.stderr, '');
      attempts.push(...JSON.parse(child.stdout));
    };
    restart();
    assert.deepEqual(attempts, ['JOV-6500', 'JOV-6500']);
    restart();
    assert.deepEqual(attempts, ['JOV-6500', 'JOV-6500', 'JOV-6501']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function event(overrides = {}) {
  return {
    action: 'linear_triage_assess',
    client_payload: {
      delivery_id: 'delivery-1234567890',
      issue_id: ISSUE_ID,
      issue_identifier: 'JOV-6500',
      team_key: 'JOV',
      state_name: 'Triage',
      action: 'create',
      ...overrides,
    },
  };
}

function issue(overrides = {}) {
  return {
    id: ISSUE_ID,
    identifier: 'JOV-6500',
    title: 'Fix bounded issue',
    description: '## Scope\nFix the issue.\n## Acceptance\nVerified behavior.',
    updatedAt: '2026-09-24T00:00:00.000Z',
    priority: 2,
    assignee: null,
    state: { id: TRIAGE_ID, name: 'Triage', type: 'triage' },
    labels: { nodes: [] },
    comments: { nodes: [] },
    relations: { nodes: [] },
    children: { nodes: [] },
    ...overrides,
  };
}

function backlogEvent(overrides = {}) {
  return event({
    state_name: 'Backlog',
    action: 'update',
    issue_updated_at: BACKLOG_VERSION,
    ...overrides,
  });
}

function backlogIssue(overrides = {}) {
  return issue({
    state: { id: BACKLOG_ID, name: 'Backlog', type: 'backlog' },
    updatedAt: BACKLOG_VERSION,
    priority: 1,
    ...overrides,
  });
}

function backlogReceipt(delivery, priority = 1, overrides = {}) {
  const families = [
    ['agent-ready', 'summer-backlog-governor:agent-ready:'],
    ['unscoped', 'summer-backlog-governor:'],
    ['devin', 'summer-backlog-governor:devin:'],
  ].map(([family, prefix]) => {
    const idempotencyKey = createHash('sha256')
      .update(prefix + delivery.identifier)
      .digest('hex');
    return {
      family,
      status: 'fenced',
      idempotencyKey,
      dispatchPath: `summer-company/linear-transitions/${idempotencyKey}/dispatch.json`,
      authorizesTransition: false,
    };
  });
  const key = families[0].idempotencyKey;
  return {
    schema: 'summer.linear-triage-assessment/v1',
    issueIdentifier: delivery.identifier,
    issueId: delivery.issueId,
    deliveryId: delivery.deliveryId,
    linearUpdatedAt: delivery.expectedLinearUpdatedAt,
    state: 'Backlog',
    priority,
    decision:
      priority === 1
        ? 'urgent-investigation-required'
        : 'existing-intake-reconcile',
    acceptedInvestigation: false,
    authorizesDispatch: false,
    backlogIntake: {
      schema: 'summer.guarded-backlog-intake/v1',
      status: 'observed',
      policy: 'existing-guarded-admission',
      authorizesTransition: false,
    },
    admissionDelegation: {
      contract: 'gem-linear-admission/2026-10-16.1',
      writer: 'gem-fleet-gate',
      status: 'delegated',
      authorizesTransition: false,
    },
    legacyGovernorFence: {
      status: 'fenced',
      contract: 'gem-linear-admission/2026-10-16.1',
      issueIdentifier: delivery.identifier,
      issueId: delivery.issueId,
      idempotencyKey: key,
      dispatchPath: `summer-company/linear-transitions/${key}/dispatch.json`,
      authorizesTransition: false,
      fenceSetContract: 'summer.legacy-governor-fence-set/2026-10-16.1',
      families,
    },
    ...overrides,
  };
}

function backlogWorld(current = backlogIssue()) {
  const writes = [];
  let reads = 0;
  const refuseWrite = async () => {
    writes.push('unexpected-mutation');
    throw new Error('Backlog observation must not call a writer');
  };
  return {
    writes,
    get reads() {
      return reads;
    },
    setCurrent(next) {
      current = next;
    },
    client: {
      fetchIssue: async () => {
        reads += 1;
        return structuredClone(current);
      },
      addComment: refuseWrite,
      updateIssue: refuseWrite,
      transitionIssue: refuseWrite,
      fetchTeamLabel: refuseWrite,
    },
  };
}

function assertBacklogHeld(result, reason) {
  assert.equal(result.state, 'Backlog');
  assert.equal(result.disposition, 'held');
  assert.equal(result.reason, reason);
  assert.equal(result.authorizesTransition, false);
  assert.equal(result.authorizesDispatch, false);
  assert.equal(result.mutations, 0);
  assert.equal(result.wakeSymphony, false);
  assert.equal(result.requiresImmediateInvestigation, false);
}

test('Backlog exact events require a valid canonical version and always request the legacy fence', () => {
  const delivery = parseTriageEvent(backlogEvent());
  assert.equal(delivery.expectedState, 'Backlog');
  assert.equal(delivery.expectedLinearUpdatedAt, BACKLOG_VERSION);
  assert.equal(delivery.fenceLegacyGovernor, true);
  assert.equal(delivery.observeLegacyWorkflowDrain, true);
  assert.equal(parseTriageEvent(event()).expectedState, undefined);
  for (const issue_updated_at of [
    undefined,
    null,
    123,
    '',
    'yesterday',
    '2026-10-16',
    '2026-99-16T20:00:00Z',
  ]) {
    assert.throws(
      () => parseTriageEvent(backlogEvent({ issue_updated_at })),
      /invalid-linear-triage-event/
    );
  }
  assert.throws(
    () => parseTriageEvent(backlogEvent({ state_name: 'Todo' })),
    /invalid-linear-triage-event/
  );
});

test('only a current Backlog observation reaches the maintained guarded admission consumer', async () => {
  const world = backlogWorld();
  const calls = [];
  const receipt = await assessTriageEvent(
    backlogEvent(),
    world.client,
    async delivery =>
      backlogReceipt(delivery, 1, {
        workflowDrainObservation: { status: 'observed' },
      }),
    {
      admit: async (delivery, current, summerReceipt, client) => {
        calls.push({ delivery, current, summerReceipt, client });
        return {
          disposition: 'Todo',
          mutations: 1,
          wakeSymphony: true,
          authorizesDispatch: false,
        };
      },
    }
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].current.id, ISSUE_ID);
  assert.equal(calls[0].delivery.observeLegacyWorkflowDrain, true);
  assert.equal(receipt.state, 'Todo');
  assert.equal(receipt.mutations, 1);
  assert.deepEqual(world.writes, []);
});

test('valid Backlog negative fences remain held without Jev, reconciliation, wake or mutation, including replay', async () => {
  for (const priority of [0, 1, 2, 4]) {
    const world = backlogWorld(backlogIssue({ priority }));
    const deliveries = [];
    const observe = async delivery => {
      deliveries.push(delivery);
      assert.equal(delivery.fenceLegacyGovernor, true);
      return backlogReceipt(delivery, priority);
    };
    for (let replay = 0; replay < 2; replay += 1) {
      const result = await assessTriageEvent(
        backlogEvent(),
        world.client,
        observe
      );
      assertBacklogHeld(result, 'backlog-native-admission-unverified');
      assert.equal(result.priority, priority);
      assert.deepEqual(result.holds, [
        'generic-writer-drain-unverified',
        'native-backlog-admission-unverified',
      ]);
    }
    assert.equal(world.reads, 4);
    assert.deepEqual(deliveries[0], deliveries[1]);
    assert.deepEqual(world.writes, []);
  }
});

test('stale Backlog priority events are held before Summer while a later current event consumes the new priority', async () => {
  const newerVersion = '2026-10-16T20:01:00.000Z';
  let currentIssue = backlogIssue({ priority: 2 });
  const world = backlogWorld(currentIssue);
  const deliveries = [];
  const observe = async delivery => {
    deliveries.push(delivery);
    return backlogReceipt(delivery, currentIssue.priority);
  };
  const earlier = await assessTriageEvent(
    backlogEvent(),
    world.client,
    observe
  );
  assertBacklogHeld(earlier, 'backlog-native-admission-unverified');
  assert.equal(earlier.priority, 2);

  currentIssue = backlogIssue({ priority: 1, updatedAt: newerVersion });
  world.setCurrent(currentIssue);
  const stale = await assessTriageEvent(backlogEvent(), world.client, observe);
  assertBacklogHeld(stale, 'backlog-event-version-changed');
  assert.equal(deliveries.length, 1);
  const current = await assessTriageEvent(
    backlogEvent({
      issue_updated_at: newerVersion,
      delivery_id: 'priority-change-2',
    }),
    world.client,
    observe
  );
  assertBacklogHeld(current, 'backlog-native-admission-unverified');
  assert.equal(current.priority, 1);
  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[0].expectedLinearUpdatedAt, BACKLOG_VERSION);
  assert.equal(deliveries[1].expectedLinearUpdatedAt, newerVersion);
  assert.notEqual(deliveries[0].deliveryId, deliveries[1].deliveryId);
  assert.equal(world.reads, 5);
  assert.deepEqual(world.writes, []);
});

test('missing or malformed current Backlog priorities cannot become Urgent or cause an assessment', async () => {
  for (const priority of [
    undefined,
    null,
    '1',
    Number.NaN,
    Infinity,
    -1,
    5,
    1.5,
  ]) {
    const world = backlogWorld(backlogIssue({ priority }));
    let observations = 0;
    const result = await assessTriageEvent(
      backlogEvent(),
      world.client,
      async () => {
        observations += 1;
        throw new Error('must not assess an invalid priority');
      }
    );
    assertBacklogHeld(result, 'backlog-priority-invalid');
    assert.equal(result.priority, undefined);
    assert.equal(observations, 0);
    assert.deepEqual(world.writes, []);
  }
});

test('Backlog identity, state and version mismatches hold before signed observation', async () => {
  for (const [current, reason] of /** @type {Array<[any, string]>} */ ([
    [null, 'backlog-event-identity-mismatch'],
    [backlogIssue({ id: 'different' }), 'backlog-event-identity-mismatch'],
    [
      backlogIssue({ identifier: 'JOV-6501' }),
      'backlog-event-identity-mismatch',
    ],
    [
      backlogIssue({
        state: { id: TRIAGE_ID, name: 'Backlog', type: 'backlog' },
      }),
      'backlog-event-state-changed',
    ],
    [
      backlogIssue({
        state: { id: BACKLOG_ID, name: 'Todo', type: 'backlog' },
      }),
      'backlog-event-state-changed',
    ],
    [
      backlogIssue({
        state: { id: BACKLOG_ID, name: 'Backlog', type: 'unstarted' },
      }),
      'backlog-event-state-changed',
    ],
    [backlogIssue({ updatedAt: undefined }), 'backlog-event-version-changed'],
  ])) {
    const world = backlogWorld(current);
    let observations = 0;
    const result = await assessTriageEvent(
      backlogEvent(),
      world.client,
      async () => {
        observations += 1;
        throw new Error('must not assess a mismatched issue');
      }
    );
    assertBacklogHeld(result, reason);
    assert.equal(observations, 0);
    assert.deepEqual(world.writes, []);
  }
});

test('Backlog rereads current priority, custody, dependency and terminal evidence after the observation', async () => {
  for (const changed of [
    null,
    backlogIssue({ id: 'different' }),
    backlogIssue({ identifier: 'JOV-6501' }),
    backlogIssue({
      state: { id: TRIAGE_ID, name: 'Backlog', type: 'backlog' },
    }),
    backlogIssue({ state: { id: BACKLOG_ID, name: 'Todo', type: 'backlog' } }),
    backlogIssue({
      state: { id: BACKLOG_ID, name: 'Backlog', type: 'unstarted' },
    }),
    backlogIssue({ priority: 2 }),
    backlogIssue({ updatedAt: '2026-10-16T20:01:00.000Z' }),
    backlogIssue({
      assignee: { id: 'accepted-owner', name: 'Existing worker' },
    }),
    backlogIssue({
      relations: {
        nodes: [
          { type: 'blocked_by', relatedIssue: { identifier: 'JOV-7073' } },
        ],
      },
    }),
    backlogIssue({ labels: { nodes: [{ name: 'terminal-attempt-held' }] } }),
    backlogIssue({
      comments: { nodes: [{ body: 'current accepted terminal hold' }] },
    }),
  ]) {
    const world = backlogWorld();
    const result = await assessTriageEvent(
      backlogEvent(),
      world.client,
      async delivery => {
        world.setCurrent(changed);
        return backlogReceipt(delivery);
      }
    );
    assertBacklogHeld(result, 'backlog-changed-after-summer-observation');
    assert.equal(world.reads, 2);
    assert.deepEqual(world.writes, []);
  }
});

test('Backlog rejects inconsistent priority and every paid or mutating assessment form without dispatch', async () => {
  for (const overrides of [
    { state: 'Triage' },
    { linearUpdatedAt: '2026-10-16T20:01:00.000Z' },
    { priority: undefined },
    { priority: '1' },
    { priority: 2 },
    { authorizesDispatch: true },
    { acceptedInvestigation: true },
    { backlogIntake: { authorizesTransition: true } },
    { admissionDelegation: { authorizesTransition: true } },
    { legacyGovernorFence: { authorizesTransition: true } },
    { assessment: jev() },
    { assessment: undefined },
    { assessmentCost: 0 },
    { escalation: { status: 'provider-block', code: 'some-provider-block' } },
    { escalations: [] },
  ]) {
    const world = backlogWorld();
    const result = await assessTriageEvent(
      backlogEvent(),
      world.client,
      async delivery => backlogReceipt(delivery, 1, overrides)
    );
    assertBacklogHeld(result, 'summer-backlog-observation-invalid');
    assert.deepEqual(world.writes, []);
  }
  const world = backlogWorld();
  assertBacklogHeld(
    await assessTriageEvent(backlogEvent(), world.client, async () => null),
    'summer-backlog-observation-invalid'
  );
});

test('Backlog observation retries only one transient 5xx and retains named holds on failures', async () => {
  for (const [
    message,
    failures,
    reason,
    expectedCalls,
  ] of /** @type {Array<[string, number, string, number]>} */ ([
    [
      'summer-triage-assessment-http-503',
      1,
      'backlog-native-admission-unverified',
      2,
    ],
    [
      'summer-triage-assessment-http-503',
      2,
      'summer-backlog-observation-unavailable',
      2,
    ],
    [
      'summer-triage-assessment-http-409',
      1,
      'summer-backlog-observation-conflict',
      1,
    ],
    [
      'summer-triage-assessment-http-400',
      1,
      'summer-backlog-observation-unavailable',
      1,
    ],
    ['network-unavailable', 1, 'summer-backlog-observation-unavailable', 1],
    [
      'summer-triage-assessment-invalid',
      1,
      'summer-backlog-observation-unavailable',
      1,
    ],
  ])) {
    const world = backlogWorld();
    let calls = 0;
    const result = await assessTriageEvent(
      backlogEvent(),
      world.client,
      async delivery => {
        calls += 1;
        if (calls <= failures) throw new Error(message);
        return backlogReceipt(delivery);
      }
    );
    assertBacklogHeld(result, reason);
    assert.equal(calls, expectedCalls);
    assert.deepEqual(world.writes, []);
  }
});

test('initial Backlog read failure returns a safe hold without private error output or side effects', async () => {
  const marker = 'synthetic-private-initial-read-body';
  const failure = new LinearTransportError(marker, {
    code: 'HTTP_500',
    body: JSON.stringify({
      issue: { description: marker, comments: [marker] },
    }),
    cause: new Error(marker),
  });
  const world = backlogWorld();
  let summerCalls = 0;
  const result = await assessTriageEvent(
    backlogEvent(),
    {
      ...world.client,
      fetchIssue: async () => {
        throw failure;
      },
    },
    async () => {
      summerCalls += 1;
      throw new Error('Summer must not run');
    }
  );
  assertBacklogHeld(result, 'backlog-current-read-unavailable');
  assert.equal(JSON.stringify(result).includes(marker), false);
  assert.equal(summerCalls, 0);
  assert.deepEqual(world.writes, []);

  // Match Node's uncaught-error output boundary used by the event CLI, with
  // synthetic input and no transport, credential, provider or write access.
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { assessTriageEvent } from ${JSON.stringify(new URL('../triage-event-assess.mjs', import.meta.url).href)};
    import { LinearTransportError } from ${JSON.stringify(new URL('../linear-client.mjs', import.meta.url).href)};
    const marker = ${JSON.stringify(marker)};
    const client = { fetchIssue: async () => { throw new LinearTransportError('initial read failed', {
      body: JSON.stringify({ description: marker }), cause: new Error('public cause')
    }); }};
    const result = await assessTriageEvent(${JSON.stringify(backlogEvent())}, client,
      async () => { throw new Error('Summer must not run'); });
    process.stdout.write(JSON.stringify(result));
  `,
    ],
    { encoding: 'utf8', timeout: 10_000 }
  );
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, '');
  assert.equal(child.stdout.includes(marker), false);
  assertBacklogHeld(
    JSON.parse(child.stdout),
    'backlog-current-read-unavailable'
  );

  // Preserve the existing Triage failure semantics.
  await assert.rejects(
    assessTriageEvent(
      event(),
      {
        ...world.client,
        fetchIssue: async () => {
          throw failure;
        },
      },
      summer('unused')
    ),
    error => error === failure
  );
});

test('unavailable fresh Backlog read cannot turn a signed observation into admission', async () => {
  const world = backlogWorld();
  let reads = 0;
  const client = {
    ...world.client,
    fetchIssue: async () => {
      reads += 1;
      if (reads === 2) throw new Error('Linear read unavailable');
      return backlogIssue();
    },
  };
  const result = await assessTriageEvent(
    backlogEvent(),
    client,
    async delivery => backlogReceipt(delivery)
  );
  assertBacklogHeld(result, 'backlog-current-read-unavailable');
  assert.deepEqual(world.writes, []);
});

function jev(overrides = {}) {
  return {
    schema: 'summer.jev-triage/v1',
    model: 'typesafe-ai/jev',
    status: 'decided',
    destination: 'Todo',
    priority: 2,
    category: 'bug',
    confidence: 0.98,
    reason: 'bounded regression repair',
    assessmentKey: 'assessment-1',
    ...overrides,
  };
}

function jevWorld(overrides = {}) {
  let current = issue(overrides);
  const writes = [];
  const client = {
    fetchIssue: async () => structuredClone(current),
    fetchTeamLabel: async () => ({ id: 'ready-id', name: 'agent-ready' }),
    addComment: async (_id, body) => {
      current.comments.nodes.push({ body });
      writes.push('comment');
      return { success: true };
    },
    updateIssue: async (_id, input) => {
      current = {
        ...current,
        state: {
          id: input.stateId,
          type: 'unstarted',
          name:
            input.stateId === 'c6c00506-dc9f-4910-8ff7-3874dd77174c'
              ? 'Todo'
              : 'Backlog',
        },
        priority: input.priority,
        labels: {
          nodes: input.labelIds?.map(id => ({ id })) ?? current.labels.nodes,
        },
      };
      writes.push('update');
      return { success: true };
    },
  };
  return {
    client,
    writes,
    receipt: assessment => async () => ({
      ...(await summer('existing-intake-reconcile')()),
      assessment,
    }),
  };
}

test('applies Jev Todo with priority and preserved labels, verifies readback, then wakes existing admission', async () => {
  const world = jevWorld({
    labels: { nodes: [{ id: 'existing-id', name: 'bug' }] },
  });
  const result = await assessTriageEvent(
    event(),
    world.client,
    world.receipt(jev())
  );
  assert.equal(result.disposition, 'Todo');
  assert.equal(result.verified.state, 'Todo');
  assert.equal(result.wakeSymphony, true);
  assert.deepEqual(
    (await world.client.fetchIssue()).labels.nodes.map(row => row.id),
    ['existing-id', 'ready-id']
  );
  const replay = await assessTriageEvent(
    event(),
    world.client,
    world.receipt(jev())
  );
  assert.equal(replay.disposition, 'stale-event');
  assert.deepEqual(world.writes, ['comment', 'update']);
});

test('sorts Jev Backlog and incomplete Todo without creating an implementation lease', async () => {
  for (const [overrides, assessment, destination] of [
    [{}, jev({ destination: 'Backlog', priority: 4 }), 'Backlog'],
    [{ description: 'not scoped' }, jev(), 'Todo'],
  ]) {
    const world = jevWorld(overrides);
    const result = await assessTriageEvent(
      event(),
      world.client,
      world.receipt(assessment)
    );
    assert.equal(result.disposition, destination);
    assert.equal(result.wakeSymphony, false);
    assert.equal((await world.client.fetchIssue()).labels.nodes.length, 0);
  }
});

test('holds ambiguity, interrupted provider work, urgent downgrade and actual owners without writes', async () => {
  for (const [overrides, assessment] of [
    [{}, jev({ status: 'ambiguous', destination: null, priority: null })],
    [{}, jev({ status: 'unavailable', destination: null, priority: null })],
    [{ priority: 1 }, jev()],
    [{ assignee: { id: 'owner', name: 'Live writer' } }, jev()],
  ]) {
    const world = jevWorld(overrides);
    const result = await assessTriageEvent(
      event(),
      world.client,
      world.receipt(assessment)
    );
    assert.equal(result.wakeSymphony, false);
    assert.equal(result.mutations, 0);
    assert.deepEqual(world.writes, []);
  }
});

test('an unavailable Jev provider is a named provider-blocked escalation, not a red sweep', async () => {
  const world = jevWorld();
  const result = await assessTriageEvent(
    event(),
    world.client,
    world.receipt(
      jev({
        status: 'unavailable',
        reason: 'provider-unavailable',
        destination: null,
        priority: null,
      })
    )
  );
  assert.equal(result.disposition, 'unavailable');
  assert.equal(result.requiresImmediateInvestigation, false);
  assert.equal(result.escalation.status, 'provider-block');
  assert.equal(result.escalation.code, 'provider-unavailable');
  assert.equal(result.escalation.requestedModel, 'typesafe-ai/jev');
  assert.equal(result.mutations, 0);
  assert.deepEqual(world.writes, []);
});

test('fails closed on invalid Jev response, missing readiness label and ownership race', async () => {
  const invalid = jevWorld();
  await assert.rejects(
    assessTriageEvent(
      event(),
      invalid.client,
      invalid.receipt(jev({ destination: 'Done' }))
    ),
    /invalid-jev/
  );
  const missing = jevWorld();
  missing.client.fetchTeamLabel = async () => null;
  await assert.rejects(
    assessTriageEvent(event(), missing.client, missing.receipt(jev())),
    /label-unavailable/
  );
  const raced = jevWorld();
  const original = raced.client.fetchIssue;
  let reads = 0;
  raced.client.fetchIssue = async () => {
    const snapshot = await original();
    if (++reads >= 3)
      snapshot.assignee = { id: 'new-owner', name: 'Live writer' };
    return snapshot;
  };
  await assert.rejects(
    assessTriageEvent(event(), raced.client, raced.receipt(jev())),
    /ownership-changed/
  );
  assert.deepEqual(raced.writes, []);
});

test('requires authoritative mutation, comment and disposition readback before waking', async () => {
  for (const failure of ['comment', 'mutation', 'readback']) {
    const world = jevWorld();
    if (failure === 'comment')
      world.client.addComment = async () => ({ success: false });
    else
      world.client.updateIssue = async () => ({
        success: failure !== 'mutation',
      });
    await assert.rejects(
      assessTriageEvent(event(), world.client, world.receipt(jev())),
      /jev-triage-(comment|mutation|readback)-failed/
    );
  }
});

test('catch-up recovers missed deliveries oldest first and preserves partial failures', async () => {
  const first = issue({ updatedAt: '2026-09-23T00:00:00.000Z' });
  const second = issue({ identifier: 'JOV-6501' });
  const calls = [];
  const receipt = await assessTriageSweep(
    {
      fetchTeamTriageIssues: async () => [second, first],
      fetchIssue: async id => (id === first.identifier ? first : second),
    },
    async delivery => {
      calls.push(delivery.identifier);
      if (delivery.identifier === first.identifier)
        throw new Error('provider-unavailable');
      return { decision: 'urgent-investigation-required' };
    }
  );
  assert.deepEqual(calls, ['JOV-6500', 'JOV-6501']);
  assert.equal(receipt.failed, 1);
  assert.equal(receipt.assessed, 2);
  assert.equal(receipt.deferred, 0);
  assert.equal(receipt.wakeSymphony, false);
  assert.equal(receipt.results[0].error, 'provider-unavailable');
});

test('catch-up is bounded and reports deferred work rather than dropping it', async () => {
  const client = { fetchTeamTriageIssues: async () => [issue(), issue()] };
  const limited = await assessTriageSweep(client, undefined, { maxIssues: 0 });
  assert.equal(limited.assessed, 0);
  assert.equal(limited.deferred, 2);
  const expired = await assessTriageSweep(client, undefined, {
    now: (() => {
      let value = 0;
      return () => value++ * 60_000;
    })(),
  });
  assert.equal(expired.assessed, 0);
  assert.equal(expired.deferred, 2);
  await assert.rejects(
    assessTriageSweep({
      fetchTeamTriageIssues: async () => {
        throw new Error('inventory-unavailable');
      },
    }),
    /inventory-unavailable/
  );
});

test('the sweep CLI names failing and blocked rows instead of an anonymous exit', async () => {
  // The workflow step consumes the module's CLI (--sweep); the exit rule
  // keeps its full strength for every failure the sweep owns (failed > 0,
  // or a blocked row with no provider-blocked escalation), and each
  // failing/blocked/provider-blocked row is annotated by name.
  const source = readFileSync(
    new URL('../triage-event-assess.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /blockedWithoutEscalation > 0/);
  assert.match(source, /::error title=Triage assessment failed::/);
  assert.match(
    source,
    /::warning title=Urgent Triage investigation required::/
  );
  assert.match(source, /::warning title=Triage escalation provider-blocked::/);
});

test('a Summer provider-blocked escalation is named and counted without failing the sweep', async () => {
  const blocked = issue({ identifier: 'JOV-8015', priority: 1 });
  const urgent = issue({ identifier: 'JOV-6500', priority: 1 });
  const escalated = {
    ...(await summer('existing-intake-reconcile')()),
    escalation: {
      status: 'provider-block',
      code: 'reason-lane-model-capacity-cost-binding-unverified',
      requestedModel: 'openai/gpt-6.1-sol',
      owner: 'Gem reason lane',
    },
  };
  const receipt = await assessTriageSweep(
    {
      fetchTeamTriageIssues: async () => [blocked, urgent],
      fetchIssue: async id => (id === blocked.identifier ? blocked : urgent),
    },
    async delivery =>
      delivery.identifier === blocked.identifier
        ? escalated
        : summer('urgent-investigation-required')()
  );
  assert.equal(receipt.providerBlocked, 1);
  assert.equal(receipt.blocked, 1);
  assert.equal(receipt.failed, 0);
  const escalatedRow = receipt.results.find(
    result => result.issue === 'JOV-8015'
  );
  assert.equal(escalatedRow.escalation.status, 'provider-block');
  assert.equal(
    escalatedRow.escalation.code,
    'reason-lane-model-capacity-cost-binding-unverified'
  );

  assert.equal(escalationBlockOf(escalated).code, escalated.escalation.code);
  assert.equal(
    escalationBlockOf(await summer('urgent-investigation-required')()),
    null
  );
  assert.equal(escalationBlockOf(null), null);
  assert.equal(
    escalationBlockOf({
      escalation: { status: 'provider-unavailable', code: 'other' },
    }),
    null
  );

  // Live receipts carry the escalation at other depths: inside the Jev
  // assessment (ambiguous rows) and in a list. Every location matches.
  const inAssessment = {
    ...(await summer('existing-intake-reconcile')()),
    assessment: {
      schema: 'summer.jev-triage/v1',
      model: 'typesafe-ai/jev',
      status: 'ambiguous',
      destination: null,
      priority: null,
      category: 'operations',
      confidence: 0.4,
      reason: 'ambiguous-or-serious',
      assessmentKey: 'key-1',
      escalation: {
        status: 'provider-block',
        code: 'reason-lane-model-capacity-cost-binding-unverified',
        requestedModel: 'anthropic/claude-opus-5.5',
        owner: 'Gem reason lane',
      },
    },
  };
  assert.equal(
    escalationBlockOf(inAssessment).requestedModel,
    'anthropic/claude-opus-5.5'
  );
  const inList = {
    ...(await summer('urgent-investigation-required')()),
    escalations: [
      { status: 'provider-block', code: 'reason-lane-capacity-unverified' },
    ],
  };
  assert.equal(
    escalationBlockOf(inList).code,
    'reason-lane-capacity-unverified'
  );

  // An ambiguous Jev assessment carrying the escalation is provider-blocked:
  // the row carries the escalation and does not count as blocked.
  const ambiguousReceipt = await assessTriageSweep(
    {
      fetchTeamTriageIssues: async () => [blocked],
      fetchIssue: async () => blocked,
    },
    async () => inAssessment
  );
  assert.equal(ambiguousReceipt.providerBlocked, 1);
  assert.equal(ambiguousReceipt.blocked, 0);
  assert.equal(ambiguousReceipt.failed, 0);

  // An urgent-investigation row carrying the escalation is provider-blocked
  // too, not blocked.
  const urgentEscalated = {
    ...(await summer('urgent-investigation-required')()),
    escalation: {
      status: 'provider-block',
      code: 'reason-lane-model-capacity-cost-binding-unverified',
    },
  };
  const urgentReceipt = await assessTriageSweep(
    {
      fetchTeamTriageIssues: async () => [urgent],
      fetchIssue: async () => urgent,
    },
    async () => urgentEscalated
  );
  assert.equal(urgentReceipt.providerBlocked, 1);
  assert.equal(urgentReceipt.blocked, 0);
});

test('a transient Summer 5xx is retried once and a repeated 5xx fails the row', async () => {
  const target = issue({ identifier: 'JOV-6500' });
  let calls = 0;
  const flaky = async () => {
    calls += 1;
    if (calls === 1) throw new Error('summer-triage-assessment-http-503');
    return summer('urgent-investigation-required')();
  };
  const recovered = await assessTriageSweep(
    {
      fetchTeamTriageIssues: async () => [target],
      fetchIssue: async () => target,
    },
    flaky
  );
  assert.equal(recovered.failed, 0);
  assert.equal(calls, 2);

  calls = 0;
  const persistent = async () => {
    calls += 1;
    throw new Error('summer-triage-assessment-http-503');
  };
  const failing = await assessTriageSweep(
    {
      fetchTeamTriageIssues: async () => [target],
      fetchIssue: async () => target,
    },
    persistent
  );
  assert.equal(failing.failed, 1);
  assert.equal(failing.results[0].error, 'summer-triage-assessment-http-503');
  assert.equal(calls, 2);

  calls = 0;
  const badRequest = async () => {
    calls += 1;
    throw new Error('summer-triage-assessment-http-400');
  };
  await assessTriageSweep(
    {
      fetchTeamTriageIssues: async () => [target],
      fetchIssue: async () => target,
    },
    badRequest
  );
  assert.equal(calls, 1);
});

test('rejects untrusted or malformed repository dispatch before Linear access', () => {
  assert.throws(
    () => parseTriageEvent(event({ issue_identifier: 'LYB-12' })),
    /invalid-linear-triage-event/
  );
  assert.throws(
    () => parseTriageEvent(event({ issue_id: 'not-a-uuid' })),
    /invalid-linear-triage-event/
  );
  assert.throws(
    () => parseTriageEvent({ ...event(), action: 'other' }),
    /invalid-linear-triage-event/
  );
});

test('fails closed when the current Linear identity differs from the event', async () => {
  const client = { fetchIssue: async () => issue({ id: 'another-id' }) };
  await assert.rejects(
    assessTriageEvent(event(), client, summer('existing-intake-reconcile')),
    /linear-triage-identity-mismatch/
  );
});

test('does not mutate an issue that left Triage before the job ran', async () => {
  let writes = 0;
  const client = {
    fetchIssue: async () => issue({ state: { id: 'todo-id', name: 'Todo' } }),
    addComment: async () => {
      writes += 1;
    },
  };
  const receipt = await assessTriageEvent(
    event(),
    client,
    summer('existing-intake-reconcile')
  );
  assert.equal(receipt.disposition, 'stale-event');
  assert.equal(receipt.wakeSymphony, false);
  assert.equal(writes, 0);
});

test('triageSweepThrottle skips only a fresh successful sweep and fails open', () => {
  const nowMs = Date.parse('2026-10-10T17:00:00.000Z');
  // a successful sweep 45 minutes ago -> run again
  assert.deepEqual(
    triageSweepThrottle({ lastOkAt: '2026-10-10T16:15:00.000Z', nowMs }),
    { skip: false, reason: 'interval-elapsed' }
  );
  // a successful sweep 10 minutes ago -> skip
  const skipped = triageSweepThrottle({
    lastOkAt: '2026-10-10T16:50:00.000Z',
    nowMs,
  });
  assert.equal(skipped.skip, true);
  assert.match(skipped.reason, /^swept-10m-ago$/);
  // exactly at the 30-minute floor -> run (not < the floor)
  assert.equal(
    triageSweepThrottle({ lastOkAt: '2026-10-10T16:30:00.000Z', nowMs }).skip,
    false
  );
  // missing / unparseable / future timestamps never skip (fail open)
  assert.deepEqual(triageSweepThrottle({ lastOkAt: undefined, nowMs }), {
    skip: false,
    reason: 'no-prior-ok',
  });
  assert.deepEqual(triageSweepThrottle({ lastOkAt: 'garbage', nowMs }), {
    skip: false,
    reason: 'no-prior-ok',
  });
  assert.deepEqual(
    triageSweepThrottle({ lastOkAt: '2026-10-10T18:00:00.000Z', nowMs }),
    { skip: false, reason: 'clock-skew' }
  );
});

test('the sweep CLI skips a fresh successful sweep without Linear access', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'triage-sweep-throttle-'));
  const cacheFile = join(directory, 'cache.json');
  const previousArgv = process.argv;
  const previousCacheFile = process.env.JOVIE_ORCHESTRATOR_CACHE;
  const previousExitCode = process.exitCode;
  const logs = [];
  t.mock.method(console, 'log', message => logs.push(String(message)));
  try {
    writeFileSync(
      cacheFile,
      JSON.stringify({ lastTriageSweepOkAt: new Date().toISOString() })
    );
    process.argv = [process.execPath, 'triage-event-assess.mjs', '--sweep'];
    process.env.JOVIE_ORCHESTRATOR_CACHE = cacheFile;

    await runCli();

    assert.equal(process.exitCode, 0);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /^triage-sweep skipped reason=swept-0m-ago$/);
  } finally {
    process.argv = previousArgv;
    process.exitCode = previousExitCode;
    if (previousCacheFile === undefined)
      delete process.env.JOVIE_ORCHESTRATOR_CACHE;
    else process.env.JOVIE_ORCHESTRATOR_CACHE = previousCacheFile;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('records an urgent unowned assessment without waking Symphony', async () => {
  let comments = 0;
  const snapshot = issue({ priority: 1, title: 'P0 measurement blocker' });
  const client = {
    fetchIssue: async () => snapshot,
    addComment: async () => {
      comments += 1;
      return { success: true };
    },
    transitionIssue: async () => {
      throw new Error('unexpected transition');
    },
  };
  const receipt = await assessTriageEvent(
    event(),
    client,
    summer('urgent-investigation-required')
  );
  assert.equal(receipt.issue, 'JOV-6500');
  assert.equal(receipt.requiresImmediateInvestigation, true);
  assert.equal(receipt.wakeSymphony, false);
  assert.equal(comments, 0);
});

test('founder steering assignment alone is not an investigation acknowledgement', async () => {
  const snapshot = issue({
    priority: 1,
    assignee: { id: 'bb142ab2-e0e9-4f89-b330-b484d6b32139', name: 'Tim White' },
  });
  const client = {
    fetchIssue: async () => snapshot,
    addComment: async () => ({ success: true }),
  };
  const receipt = await assessTriageEvent(
    event(),
    client,
    summer('urgent-investigation-required')
  );
  assert.equal(
    receipt.summerAssessment.decision,
    'urgent-investigation-required'
  );
  assert.equal(receipt.requiresImmediateInvestigation, true);
  assert.equal(receipt.wakeSymphony, false);
});

test('moves only a fresh agent-ready issue through the existing reconciler', async () => {
  let transitions = 0;
  const snapshot = issue({
    labels: { nodes: [{ id: 'label-1', name: 'agent-ready' }] },
  });
  const client = {
    fetchIssue: async () => snapshot,
    addComment: async () => ({ success: true }),
    transitionIssue: async () => {
      transitions += 1;
      return { success: true };
    },
  };
  const receipt = await assessTriageEvent(
    event(),
    client,
    summer('existing-intake-reconcile')
  );
  assert.equal(receipt.wakeSymphony, true);
  assert.equal(receipt.reconciliation.route, 'agent-ready-lane');
  assert.equal(transitions, 1);
});

test('fails closed before reconciliation if Summer assessment is unavailable', async () => {
  let writes = 0;
  const client = {
    fetchIssue: async () => issue(),
    addComment: async () => {
      writes += 1;
    },
  };
  await assert.rejects(
    assessTriageEvent(event(), client, async () => {
      throw new Error('summer-unavailable');
    }),
    /summer-unavailable/
  );
  assert.equal(writes, 0);
});

test('rejects a changed issue after Summer assessed the prior revision', async () => {
  let reads = 0;
  let writes = 0;
  const client = {
    fetchIssue: async () => {
      reads += 1;
      return issue({
        updatedAt:
          reads === 1 ? '2026-09-24T00:00:00.000Z' : '2026-09-24T00:01:00.000Z',
      });
    },
    addComment: async () => {
      writes += 1;
    },
  };
  await assert.rejects(
    assessTriageEvent(event(), client, summer('existing-intake-reconcile')),
    /changed-after-summer/
  );
  assert.equal(writes, 0);
});

test('preserves founder steering eligibility through canonical Jovie ownership policy', async () => {
  let transitions = 0;
  const snapshot = issue({
    assignee: { id: 'bb142ab2-e0e9-4f89-b330-b484d6b32139', name: 'Tim White' },
    labels: { nodes: [{ id: 'label-1', name: 'agent-ready' }] },
  });
  const client = {
    fetchIssue: async () => snapshot,
    addComment: async () => ({ success: true }),
    transitionIssue: async () => {
      transitions += 1;
      return { success: true };
    },
  };
  const receipt = await assessTriageEvent(
    event(),
    client,
    summer('existing-intake-reconcile')
  );
  assert.equal(receipt.wakeSymphony, true);
  assert.equal(transitions, 1);
});

test('holds an actual assigned owner under canonical Jovie ownership policy', async () => {
  let writes = 0;
  const snapshot = issue({
    assignee: { id: 'other-owner', name: 'Another Owner' },
    labels: { nodes: [{ id: 'label-1', name: 'agent-ready' }] },
  });
  const client = {
    fetchIssue: async () => snapshot,
    addComment: async () => {
      writes += 1;
      return { success: true };
    },
    transitionIssue: async () => {
      writes += 1;
      return { success: true };
    },
  };
  const receipt = await assessTriageEvent(
    event(),
    client,
    summer('existing-intake-reconcile')
  );
  assert.equal(receipt.wakeSymphony, false);
  assert.equal(receipt.disposition, 'owned-active');
  assert.equal(writes, 0);
});

test('the maintained Summer callable forwards the guarded second signal into real signed transport', async () => {
  const pair = generateKeyPairSync('ed25519');
  const environment = {
    SUMMER_BOTTLENECK_ORIGIN: 'https://summer.example',
    SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_PRIVATE_KEY: pair.privateKey
      .export({ format: 'pem', type: 'pkcs8' })
      .toString(),
    SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID: 'host-outcome',
  };
  const controller = new AbortController();
  const world = backlogWorld();
  let fetches = 0;
  const now = () => Date.parse(BACKLOG_VERSION);
  const summer = (delivery, options = {}) =>
    requestSummerAssessment(delivery, {
      environment,
      now,
      signal: options.signal,
      fetchImpl: async (_url, init) => {
        fetches++;
        if (fetches === 2) {
          assert.ok(init.signal);
          const pending = new Promise((_resolve, reject) => {
            init.signal.addEventListener(
              'abort',
              () => reject(init.signal.reason),
              { once: true }
            );
          });
          controller.abort(Error('owned-guard-expired'));
          return pending;
        }
        assert.equal(typeof init.body, 'string');
        const body = JSON.parse(/** @type {string} */ (init.body));
        return Response.json(
          backlogReceipt(
            {
              identifier: body.issueIdentifier,
              issueId: body.issueId,
              deliveryId: body.deliveryId,
              expectedLinearUpdatedAt: body.expectedLinearUpdatedAt,
            },
            1,
            {
              workflowDrainObservation: {
                schema: 'summer.workflow-drain-observation/v1',
                api: 'eve0.47.7:world.runs.list:canonical-storage',
                observedAt: BACKLOG_VERSION,
                identity: {
                  projectId: 'prj_LaVQva346cjp5XfrbAIIQUln7tPH',
                  teamId: 'team_bpNDbti6srVLYPKdmQLu4UgT',
                  deploymentId: 'dpl_Current001',
                  latestDeploymentId: 'dpl_Current001',
                  sourceRevision: 'a'.repeat(40),
                  environment: 'production',
                  providerOwnerReadback: 'separate-required',
                },
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
                holds: [],
                pagination: {
                  pendingPages: 1,
                  runningPages: 1,
                  complete: true,
                  maxPagesPerStatus: 4,
                  pageSize: 1000,
                },
                retention: {
                  status: 'not-reported',
                  basis:
                    'pinned-canonical-current-nonterminal-storage-contract',
                  scope: 'current-nonterminal-storage',
                  historicalCoverage: 'not-claimed',
                  windows: [],
                },
              },
            }
          )
        );
      },
    });
  const result = await assessTriageEvent(backlogEvent(), world.client, summer, {
    admit: async (delivery, _issue, _receipt, _client, request) => {
      await assert.rejects(
        request(delivery, { signal: controller.signal }),
        /owned-guard-expired/
      );
      return {
        disposition: 'held',
        reason: 'native-backlog-admission-held',
        authorizesTransition: false,
        authorizesDispatch: false,
        mutations: 0,
        wakeSymphony: false,
      };
    },
  });
  assert.equal(result.reason, 'native-backlog-admission-held');
  assert.equal(fetches, 2);
  assert.deepEqual(world.writes, []);
});

test('Backlog returned output projects metadata and never raw private receipt or World payloads', async () => {
  const marker = 'private-prompt-preimage-do-not-return';
  const world = backlogWorld(
    backlogIssue({
      description: marker,
      comments: { nodes: [{ body: marker }] },
    })
  );
  const result = await assessTriageEvent(
    backlogEvent(),
    world.client,
    async delivery =>
      backlogReceipt(delivery, 1, {
        privatePreimages: marker,
        workflowDrainObservation: {
          schema: 'summer.workflow-drain-observation/v1',
          status: 'held',
          complete: false,
          observedAt: BACKLOG_VERSION,
          identity: {
            sourceRevision: 'a'.repeat(40),
            privatePreimages: marker,
          },
          counts: { running: 1 },
          holds: ['workflow-world-old-deployment-active'],
          runs: [{ input: marker }],
          privatePreimages: marker,
        },
      }),
    {
      admit: async () => ({
        disposition: 'held',
        reason: 'summer-old-world-writers-unverified',
        authorizesTransition: false,
        authorizesDispatch: false,
        mutations: 0,
        wakeSymphony: false,
      }),
    }
  );
  const output = JSON.stringify(result);
  assert.ok(!output.includes(marker));
  assert.ok(!output.includes('privatePreimages'));
  assert.equal(
    result.summerAssessment.workflowDrainObservation.schema,
    'summer.workflow-drain-observation-summary/v1'
  );
  assert.equal(
    result.summerAssessment.workflowDrainObservation.counts.running,
    1
  );
});

test('Backlog catch-up cannot exceed three attempts and reserves the complete 180 second operation', async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    ...backlogIssue(),
    id: `68b3e8de-588e-46ba-8209-84329d15462${i}`,
    identifier: `JOV-${6500 + i}`,
    archivedAt: null,
    createdAt: BACKLOG_VERSION,
    labels: [{ id: 'ready', name: 'agent-ready' }],
  }));
  const options = {
    maxIssues: 99,
    discover: async () => rows,
    assess: async () => ({
      disposition: 'held',
      reason: 'dependency-held',
      mutations: 0,
      wakeSymphony: false,
    }),
    now: () => 0,
  };
  assert.equal((await assessBacklogSweep({}, undefined, options)).assessed, 3);
  let tick = 0;
  assert.equal(
    (
      await assessBacklogSweep({}, undefined, {
        ...options,
        now: () => (tick++ === 0 ? 0 : 5001),
      })
    ).assessed,
    0
  );
});
