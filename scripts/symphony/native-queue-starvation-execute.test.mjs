import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  AUTONOMOUS_LINEAR_WORKER,
  appendSummerIssueBind,
  assertAutonomousClaim,
  assertAutonomousTerminal,
  assertDurableNativeQueueOracle,
  decideNativeQueueExecution,
  ENROLL_EXACT_HEAD,
  executeNativeQueueStarvation,
  FOUNDER_LINEAR_ASSIGNEE,
  NATIVE_QUEUE_ACTION,
  NO_GREEN_READY_PR,
  nativeQueueEnrollPlan,
  PR_CHURN_EJECT,
  RELEASE_CERT_ACTION,
  SUMMER_ISSUE_BIND_MARKER,
  selectGreenReadyPrs,
  signNativeQueueExecution,
  unsignedNativeQueueExecution,
} from './native-queue-starvation-execute.mjs';
import {
  canonical,
  createFileJournal,
  signOutcomeV2,
} from './summer-symphony-outbox-consumer.mjs';

function pair() {
  const keys = generateKeyPairSync('ed25519');
  return {
    privateKey: keys.privateKey
      .export({ format: 'pem', type: 'pkcs8' })
      .toString(),
    publicKey: keys.publicKey
      .export({ format: 'pem', type: 'spki' })
      .toString(),
  };
}

const TASK_KEY = '2'.repeat(64);
const SOURCE = {
  sourceVersion: '7'.repeat(40),
  snapshotDigest: 'c'.repeat(64),
};

describe('assertAutonomousClaim', () => {
  it('rejects founder-named In Progress claims and accepts a cleared machine claim', () => {
    assert.equal(FOUNDER_LINEAR_ASSIGNEE, 'Tim White');
    assert.deepEqual(
      assertAutonomousClaim({ state: 'In Progress', assignee: null }),
      { state: 'In Progress', assignee: AUTONOMOUS_LINEAR_WORKER }
    );
    assert.deepEqual(
      assertAutonomousClaim({ state: 'In Progress', assignee: 'Codex' }),
      { state: 'In Progress', assignee: 'Codex' }
    );
    assert.throws(
      () =>
        assertAutonomousClaim({ state: 'In Progress', assignee: 'Tim White' }),
      /linear-claim-not-autonomous/
    );
    assert.throws(
      () => assertAutonomousClaim({ state: 'Todo', assignee: null }),
      /linear-claim-not-autonomous/
    );
  });
});

describe('assertAutonomousTerminal', () => {
  it('rejects founder-named Done and leftover In Progress', () => {
    assert.deepEqual(
      assertAutonomousTerminal({ state: 'Done', assignee: null }),
      { state: 'Done', assignee: AUTONOMOUS_LINEAR_WORKER }
    );
    assert.throws(
      () => assertAutonomousTerminal({ state: 'Done', assignee: 'Tim White' }),
      /linear-terminal-not-autonomous/
    );
    assert.throws(
      () => assertAutonomousTerminal({ state: 'In Progress', assignee: null }),
      /linear-terminal-not-autonomous/
    );
  });
});

describe('selectGreenReadyPrs', () => {
  it('binds promote lifecycle actions instead of inventing PR numbers from a count', () => {
    assert.deepEqual(
      selectGreenReadyPrs({
        signals: {
          queue: { greenReadyPrs: 4 },
          closureHealth: {
            lifecycleActions: [
              {
                sourceState: 'held',
                pr: 17001,
                headSha: 'a'.repeat(40),
              },
              {
                sourceState: 'promote',
                pr: 17886,
                headSha: 'e'.repeat(40),
              },
            ],
          },
        },
      }),
      [{ number: 17886, head: 'e'.repeat(40) }]
    );
    assert.deepEqual(
      selectGreenReadyPrs({ signals: { queue: { greenReadyPrs: 4 } } }),
      []
    );
  });
});

describe('appendSummerIssueBind', () => {
  it('appends the Linear identifier so is:pr search can bind, and is idempotent', () => {
    const first = appendSummerIssueBind('PR body', 'JOV-6371', TASK_KEY);
    assert.match(first, new RegExp(`${SUMMER_ISSUE_BIND_MARKER}\\nJOV-6371`));
    assert.match(first, new RegExp(`taskKey:${TASK_KEY}`));
    assert.equal(appendSummerIssueBind(first, 'JOV-6371', TASK_KEY), first);
    assert.equal(appendSummerIssueBind('x', 'JOV-0', TASK_KEY), 'x');
  });
});

const CAPTURED_17917 = 'MQE_lQDOPXNGM88AAAABD124nc4ABAFUzgLeRvE';
const REPLACEMENT_17917 = 'MQE_lQDOPXNGM88AAAABD124nc4ABAFUzgLeTSs';
const TIMELINE_17917_CHURN = [
  {
    __typename: 'AddedToMergeQueueEvent',
    createdAt: '2026-09-17T04:57:01Z',
    actor: { login: 'jovie-bot' },
  },
  {
    __typename: 'RemovedFromMergeQueueEvent',
    createdAt: '2026-09-17T05:10:40Z',
    actor: { login: 'github-merge-queue' },
  },
  {
    __typename: 'AddedToMergeQueueEvent',
    createdAt: '2026-09-17T05:14:12Z',
    actor: { login: 'jovie-bot' },
  },
];

describe('assertDurableNativeQueueOracle', () => {
  it('rejects the JOV-6384/#17917 replacement enqueue and accepts same-id or mergedAt', () => {
    assert.deepEqual(
      assertDurableNativeQueueOracle({
        mergedAt: null,
        mergeQueueEntry: {
          id: REPLACEMENT_17917,
          enqueuedAt: '2026-09-17T05:14:12Z',
        },
        timeline: TIMELINE_17917_CHURN,
        capturedEntryId: CAPTURED_17917,
      }),
      { ok: false, detail: PR_CHURN_EJECT }
    );
    assert.deepEqual(
      assertDurableNativeQueueOracle({
        mergedAt: null,
        mergeQueueEntry: {
          id: CAPTURED_17917,
          enqueuedAt: '2026-09-17T04:57:01Z',
        },
        timeline: [
          {
            __typename: 'AddedToMergeQueueEvent',
            createdAt: '2026-09-17T04:57:01Z',
            actor: { login: 'jovie-bot' },
          },
        ],
        capturedEntryId: CAPTURED_17917,
      }),
      { ok: true, detail: 'same-entry' }
    );
    assert.deepEqual(
      assertDurableNativeQueueOracle({
        mergedAt: '2026-09-17T05:20:00Z',
        mergeQueueEntry: null,
        timeline: TIMELINE_17917_CHURN,
        capturedEntryId: CAPTURED_17917,
      }),
      { ok: true, detail: 'merged' }
    );
    assert.equal(
      assertDurableNativeQueueOracle({
        mergedAt: null,
        mergeQueueEntry: { id: CAPTURED_17917 },
        timeline: [],
      }).ok,
      false
    );
  });
});

describe('nativeQueueEnrollPlan', () => {
  it('rejects github-merge-queue churn; occupancy without a captured id is not a ship', () => {
    assert.deepEqual(
      nativeQueueEnrollPlan({
        mergeStateStatus: 'CLEAN',
        mergeQueueEntry: { id: REPLACEMENT_17917 },
        timeline: TIMELINE_17917_CHURN,
        capturedEntryId: CAPTURED_17917,
      }),
      { action: 'reject', detail: PR_CHURN_EJECT }
    );
    assert.deepEqual(
      nativeQueueEnrollPlan({
        mergeStateStatus: 'CLEAN',
        mergeQueueEntry: { id: CAPTURED_17917 },
        timeline: [
          {
            __typename: 'AddedToMergeQueueEvent',
            createdAt: '2026-09-17T04:57:01Z',
            actor: { login: 'jovie-bot' },
          },
        ],
        capturedEntryId: CAPTURED_17917,
      }),
      { action: 'bind-durable-queue' }
    );
    assert.deepEqual(
      nativeQueueEnrollPlan({
        mergeStateStatus: 'CLEAN',
        mergeQueueEntry: null,
        timeline: [],
      }),
      { action: 'bind-and-await-bot' }
    );
  });
});

describe('decideNativeQueueExecution', () => {
  it('enrolls an existing green-ready PR even when new-mutation seats are closed', () => {
    assert.deepEqual(
      decideNativeQueueExecution({
        action: NATIVE_QUEUE_ACTION,
        mutationAllowed: false,
        pushAllowed: false,
        maxConcurrent: 0,
        greenReadyPrs: [{ number: 17917, head: 'd'.repeat(40) }],
      }),
      {
        status: 'ready-to-enroll',
        detail: ENROLL_EXACT_HEAD,
        mutationAttempted: true,
        authority:
          'exact-source-ci-native-queue-production-gates-remain-required',
        pr: 17917,
        head: 'd'.repeat(40),
        candidates: [{ number: 17917, head: 'd'.repeat(40) }],
        mergeQueueEntryId: null,
        mergedAt: null,
      }
    );
  });

  it('enrolls the same green-ready PR for release-certification-starvation', () => {
    assert.equal(
      decideNativeQueueExecution({
        action: RELEASE_CERT_ACTION,
        mutationAllowed: false,
        pushAllowed: false,
        maxConcurrent: 0,
        greenReadyPrs: [{ number: 17918, head: 'e'.repeat(40) }],
      }).pr,
      17918
    );
  });

  it('fail-closes when no green-ready PR is bound', () => {
    assert.equal(
      decideNativeQueueExecution({
        action: NATIVE_QUEUE_ACTION,
        mutationAllowed: true,
        pushAllowed: true,
        maxConcurrent: 1,
        greenReadyPrs: [],
      }).detail,
      NO_GREEN_READY_PR
    );
  });

  it('selects the first green-ready PR', () => {
    assert.deepEqual(
      decideNativeQueueExecution({
        action: NATIVE_QUEUE_ACTION,
        mutationAllowed: true,
        pushAllowed: true,
        maxConcurrent: 2,
        greenReadyPrs: [{ number: 17540, head: 'd'.repeat(40) }, 17542],
      }),
      {
        status: 'ready-to-enroll',
        detail: ENROLL_EXACT_HEAD,
        mutationAttempted: true,
        authority:
          'exact-source-ci-native-queue-production-gates-remain-required',
        pr: 17540,
        head: 'd'.repeat(40),
        candidates: [{ number: 17540, head: 'd'.repeat(40) }, 17542],
        mergeQueueEntryId: null,
        mergedAt: null,
      }
    );
  });

  it('skips churned PRs and fail-closes when every candidate is churned', () => {
    assert.equal(
      decideNativeQueueExecution({
        action: NATIVE_QUEUE_ACTION,
        greenReadyPrs: [
          { number: 17917, head: 'd'.repeat(40), churned: true },
          { number: 17918, head: 'e'.repeat(40), churned: true },
        ],
      }).detail,
      PR_CHURN_EJECT
    );
    assert.equal(
      decideNativeQueueExecution({
        action: NATIVE_QUEUE_ACTION,
        greenReadyPrs: [
          { number: 17917, head: 'd'.repeat(40), churned: true },
          { number: 17923, head: 'f'.repeat(40) },
        ],
      }).pr,
      17923
    );
  });

  it('rejects other bottleneck actions instead of lie-mapping onto a CI class', () => {
    assert.throws(
      () =>
        decideNativeQueueExecution({
          action: 'remediate-selected-ci-audit-class',
          mutationAllowed: true,
          pushAllowed: true,
          maxConcurrent: 1,
          greenReadyPrs: [1],
        }),
      /native-queue-action-required/
    );
  });
});

describe('executeNativeQueueStarvation', () => {
  const host = pair();

  it('claims the Linear child and records a signed fail-closed terminal without mutating a PR', async () => {
    const claims = [];
    const completes = [];
    const enrolls = [];
    const writes = [];
    const result = await executeNativeQueueStarvation({
      taskKey: TASK_KEY,
      issueIdentifier: 'JOV-6304',
      source: SOURCE,
      admission: {
        action: NATIVE_QUEUE_ACTION,
        mutationAllowed: false,
        pushAllowed: false,
        maxConcurrent: 0,
        greenReadyPrs: [],
      },
      signatureKeyId: 'symphony-outcome-2026-09',
      privateKeyPem: host.privateKey,
      now: () => '2026-09-16T00:00:00.000Z',
      claimIssue: async input => {
        claims.push(input);
        return { state: 'In Progress', assignee: 'symphony-worker' };
      },
      completeIssue: async input => {
        completes.push(input);
        return { state: 'Done', assignee: AUTONOMOUS_LINEAR_WORKER };
      },
      enrollPr: async input => {
        enrolls.push(input);
        return { ok: true, head: 'd'.repeat(40) };
      },
      writeExecution: async record => {
        writes.push(record);
        return {
          schema: 'summer.symphony-execution-ack/v1',
          taskKey: record.taskKey,
          status: 'recorded',
          decision: record.status,
        };
      },
    });
    assert.equal(result.status, 'execution-recorded');
    assert.equal(result.decision.detail, NO_GREEN_READY_PR);
    assert.equal(result.decision.mutationAttempted, false);
    assert.equal(result.decision.pr, null);
    assert.deepEqual(claims, [
      { identifier: 'JOV-6304', state: 'In Progress' },
    ]);
    assert.deepEqual(completes, []);
    assert.deepEqual(result.terminal, {
      state: 'In Progress',
      assignee: 'symphony-worker',
    });
    assert.deepEqual(enrolls, []);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].status, 'failed');
    assert.equal(writes[0].claim.state, 'In Progress');
    assert.equal(writes[0].claim.assignee, 'symphony-worker');
    assert.equal(writes[0].execution.mutationAttempted, false);
    assert.match(writes[0].signature, /^ed25519=[A-Za-z0-9_-]{86}$/u);
    assert.equal(result.record.taskKey, TASK_KEY);
  });

  it('enrolls the bound PR even when new-mutation seats are closed', async () => {
    const enrolls = [];
    const result = await executeNativeQueueStarvation({
      taskKey: TASK_KEY,
      issueIdentifier: 'JOV-6371',
      source: SOURCE,
      admission: {
        action: RELEASE_CERT_ACTION,
        mutationAllowed: false,
        pushAllowed: false,
        maxConcurrent: 0,
        greenReadyPrs: [{ number: 17917, head: 'd'.repeat(40) }],
      },
      signatureKeyId: 'symphony-outcome-2026-09',
      privateKeyPem: host.privateKey,
      now: () => '2026-09-16T00:00:00.000Z',
      claimIssue: async () => ({
        state: 'In Progress',
        assignee: 'symphony-worker',
      }),
      completeIssue: async () => ({
        state: 'Done',
        assignee: AUTONOMOUS_LINEAR_WORKER,
      }),
      enrollPr: async input => {
        enrolls.push(input);
        return {
          ok: true,
          durable: true,
          mergeQueueEntryId: CAPTURED_17917,
          head: 'd'.repeat(40),
        };
      },
      writeExecution: async record => ({
        schema: 'summer.symphony-execution-ack/v1',
        taskKey: record.taskKey,
        status: 'recorded',
        decision: record.status,
      }),
    });
    assert.deepEqual(enrolls, [
      {
        pr: 17917,
        head: 'd'.repeat(40),
        issueIdentifier: 'JOV-6371',
        taskKey: TASK_KEY,
      },
    ]);
    assert.equal(result.decision.status, 'succeeded');
    assert.equal(result.decision.pr, 17917);
    assert.equal(result.decision.mergeQueueEntryId, CAPTURED_17917);
    assert.equal(result.record.status, 'succeeded');
    assert.equal(result.record.action, RELEASE_CERT_ACTION);
    assert.equal(result.record.source.action, RELEASE_CERT_ACTION);
  });

  it('does not terminal Done on occupancy-only enroll or churn eject', async () => {
    const completes = [];
    const occupancy = await executeNativeQueueStarvation({
      taskKey: TASK_KEY,
      issueIdentifier: 'JOV-6384',
      source: SOURCE,
      admission: {
        action: RELEASE_CERT_ACTION,
        greenReadyPrs: [{ number: 17917, head: 'd'.repeat(40) }],
      },
      signatureKeyId: 'symphony-outcome-2026-09',
      privateKeyPem: host.privateKey,
      now: () => '2026-09-17T05:00:11.000Z',
      claimIssue: async () => ({
        state: 'In Progress',
        assignee: null,
      }),
      completeIssue: async input => {
        completes.push(input);
        return { state: 'Done', assignee: AUTONOMOUS_LINEAR_WORKER };
      },
      enrollPr: async () => ({
        ok: false,
        reason: PR_CHURN_EJECT,
        pr: 17917,
      }),
      writeExecution: async record => ({
        schema: 'summer.symphony-execution-ack/v1',
        taskKey: record.taskKey,
        status: 'recorded',
        decision: record.status,
      }),
    });
    assert.deepEqual(completes, []);
    assert.equal(occupancy.decision.detail, PR_CHURN_EJECT);
    assert.equal(occupancy.terminal.state, 'In Progress');
    assert.equal(occupancy.record.status, 'failed');
  });

  it('keeps Linear open when execution delivery is missing, malformed, or cross-bound', async () => {
    for (const response of [
      null,
      {},
      { status: 'recorded' },
      {
        schema: 'summer.symphony-execution-ack/v1',
        taskKey: 'f'.repeat(64),
        status: 'recorded',
        decision: 'succeeded',
      },
      {
        schema: 'summer.symphony-execution-ack/v1',
        taskKey: TASK_KEY,
        status: 'pending',
        decision: 'succeeded',
      },
      {
        schema: 'summer.symphony-execution-ack/v1',
        taskKey: TASK_KEY,
        status: 'replay',
        decision: 'failed',
      },
    ]) {
      const completes = [];
      const result = await executeNativeQueueStarvation({
        taskKey: TASK_KEY,
        issueIdentifier: 'JOV-6383',
        source: SOURCE,
        admission: {
          action: RELEASE_CERT_ACTION,
          greenReadyPrs: [{ number: 17918, head: 'e'.repeat(40) }],
        },
        signatureKeyId: 'symphony-outcome-2026-09',
        privateKeyPem: host.privateKey,
        now: () => '2026-09-17T04:43:32.000Z',
        claimIssue: async () => ({
          state: 'In Progress',
          assignee: null,
        }),
        completeIssue: async input => {
          completes.push(input);
          return { state: 'Done', assignee: AUTONOMOUS_LINEAR_WORKER };
        },
        enrollPr: async () => ({
          ok: true,
          durable: true,
          mergeQueueEntryId: 'MQE_durable',
          head: 'e'.repeat(40),
        }),
        writeExecution: async () => {
          if (response === null)
            throw new Error('execution-write-rejected:schema');
          return response;
        },
      });
      assert.deepEqual(completes, []);
      assert.equal(result.status, 'execution-unacknowledged');
      assert.equal(result.terminal.state, 'In Progress');
      assert.equal(result.acknowledgement.status, 'execution-write-failed');
      assert.match(
        result.acknowledgement.detail,
        /execution-write-rejected|execution-ack-invalid-or-cross-bound/
      );
      assert.equal(result.decision.pr, 17918);
    }
  });

  it('signs a fail-closed execution that cannot claim a PR number', () => {
    const decision = decideNativeQueueExecution({
      action: NATIVE_QUEUE_ACTION,
      mutationAllowed: false,
      pushAllowed: false,
      maxConcurrent: 0,
      greenReadyPrs: [],
    });
    const unsigned = unsignedNativeQueueExecution({
      action: NATIVE_QUEUE_ACTION,
      taskKey: TASK_KEY,
      issueIdentifier: 'JOV-6304',
      source: SOURCE,
      decision,
      completedAt: '2026-09-16T00:00:00.000Z',
      claim: { state: 'In Progress', assignee: 'symphony-worker' },
      signatureKeyId: 'symphony-outcome-2026-09',
    });
    assert.equal(unsigned.execution.pr, null);
    const signed = signNativeQueueExecution(
      {
        action: NATIVE_QUEUE_ACTION,
        taskKey: TASK_KEY,
        issueIdentifier: 'JOV-6304',
        source: SOURCE,
        decision,
        completedAt: '2026-09-16T00:00:00.000Z',
        claim: { state: 'In Progress', assignee: 'symphony-worker' },
        signatureKeyId: 'symphony-outcome-2026-09',
      },
      host.privateKey
    );
    assert.notEqual(signed.signature, unsigned.signature);
  });
});

describe('native queue execution command delivery status', () => {
  const host = pair();
  function makeJournal(directory) {
    const company = pair();
    const task = {
      schema: 'jovie-symphony-repair-task/v2',
      taskKey: TASK_KEY,
      decisionFingerprint: TASK_KEY,
      createdAt: '2026-09-19T00:00:00Z',
      owner: 'symphony',
      route: 'symphony',
      authority: 'linear-child-projection-only',
      action: NATIVE_QUEUE_ACTION,
      safety: 'exact-source-ci-native-queue-production-gates-remain-required',
      selected: {
        id: 'native-queue-starvation',
        sourceRevision: SOURCE.sourceVersion,
        sourceDigest: 'd'.repeat(64),
        owner: 'Summer',
        handle: 'symphony',
      },
      source: SOURCE,
      linearProjection: {
        mutation: 'create-child-issue',
        team: 'JOV',
        parentIssue: 'JOV-5853',
        title: `[summer-task:${TASK_KEY}] native-queue-starvation`,
        description: `[summer-task:${TASK_KEY}]\n\nSelected: native-queue-starvation\nAction: ${NATIVE_QUEUE_ACTION}\nSource: ${SOURCE.sourceVersion}`,
        initialState: 'Todo',
        labels: ['symphony'],
      },
    };
    const unsigned = {
      schema: 'jovie.eve.symphony-repair-outbox/v2',
      destination: 'symphony',
      idempotencyKey: TASK_KEY,
      status: 'ready',
      task,
      signatureKeyId: 'company-fixture',
    };
    const record = {
      ...unsigned,
      signature: `ed25519=${sign(null, Buffer.from(`${unsigned.schema}\0${canonical(unsigned)}`), company.privateKey).toString('base64url')}`,
    };
    const outcome = signOutcomeV2(
      task,
      { identifier: 'JOV-6383', createdAt: '2026-09-19T00:01:00Z' },
      host.privateKey,
      'host-fixture'
    );
    const journal = createFileJournal(
      directory,
      new Map([['company-fixture', company.publicKey]]),
      host.publicKey
    );
    return { company, journal, record, outcome };
  }
  it('returns nonzero on missing acknowledgment and zero for a correlated failed-result acknowledgment', () => {
    const directory = mkdtempSync(join(tmpdir(), 'summer-execution-ack-'));
    try {
      const preload = join(directory, 'transport.mjs');
      const fleet = join(directory, 'fleet.json');
      writeFileSync(fleet, JSON.stringify({}));
      writeFileSync(
        preload,
        `
        import cp from 'node:child_process';
        import {syncBuiltinESMExports} from 'node:module';
        cp.spawnSync = (command, args) => {
          if (process.env.FIXTURE_ACK === 'recorded') throw new Error('replay-must-not-run-command');
          if (command !== 'gh' || args[0] !== 'pr' || args[1] !== 'list')
            throw new Error('unexpected-command');
          return {status:0,stdout:'[]',stderr:''};
        };
        syncBuiltinESMExports();
        globalThis.fetch = async (url, options) => {
          const body = JSON.parse(options.body);
          if (url === 'https://api.linear.app/graphql') {
            if (process.env.FIXTURE_ACK === 'recorded') throw new Error('replay-must-not-claim');
            if (body.query.includes('issueUpdate')) return Response.json({data:{issueUpdate:{success:true,issue:{identifier:'JOV-6383',state:{name:'In Progress'},assignee:null}}}});
            return Response.json({data:{issue:{id:'fixture-issue',identifier:'JOV-6383',state:{name:'Todo'}}}});
          }
          if (url !== 'https://summer.example/summer/v1/symphony/executions') throw new Error('unexpected-url');
          if (process.env.FIXTURE_ACK === 'missing') throw new Error('ack-lost');
          return Response.json({schema:'summer.symphony-execution-ack/v1',taskKey:body.taskKey,status:process.env.FIXTURE_ACK,decision:body.status});
        };
      `
      );
      const { company, journal, record, outcome } = makeJournal(directory);
      for (const mode of ['missing', 'recorded', 'replay']) {
        if (mode !== 'recorded')
          journal.write({
            schema: 'jovie.summer-symphony-consumer-state/v1',
            active: {
              phase: 'execution-ready',
              taskKey: TASK_KEY,
              record,
              outcome,
            },
          });
        const result = spawnSync(
          process.execPath,
          [
            '--import',
            preload,
            new URL('./run-native-queue-execution.mjs', import.meta.url)
              .pathname,
            TASK_KEY,
            'JOV-6383',
            SOURCE.sourceVersion,
            SOURCE.snapshotDigest,
            fleet,
            NATIVE_QUEUE_ACTION,
          ],
          {
            encoding: 'utf8',
            timeout: 10000,
            env: {
              FIXTURE_ACK: mode,
              GEM_WORKSPACE: directory,
              SUMMER_BOTTLENECK_EVE_OUTBOX_VERIFICATION_KEYS_JSON:
                JSON.stringify({ 'company-fixture': company.publicKey }),
              SUMMER_LINEAR_GOVERNOR_API_KEY: 'fixture',
              SUMMER_BOTTLENECK_ORIGIN: 'https://summer.example',
              SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID: 'host-fixture',
              SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_PRIVATE_KEY:
                host.privateKey,
            },
          }
        );
        assert.equal(result.status, mode === 'missing' ? 1 : 0, result.stderr);
        const output = JSON.parse(result.stdout);
        assert.equal(
          output.status,
          mode === 'missing' ? 'execution-unacknowledged' : 'execution-recorded'
        );
        assert.equal(output.decision.status, 'failed');
        assert.equal(output.terminal.state, 'In Progress');
        assert.equal(
          journal.read().active.phase,
          mode === 'missing' ? 'execution-pending' : 'execution-recorded'
        );
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('replays a succeeded record across lost acknowledgment and failed Done write without executing twice', () => {
    const directory = mkdtempSync(join(tmpdir(), 'summer-success-replay-'));
    try {
      const { company, journal, record, outcome } = makeJournal(directory);
      journal.write({
        schema: 'jovie.summer-symphony-consumer-state/v1',
        active: {
          phase: 'execution-ready',
          taskKey: TASK_KEY,
          record,
          outcome,
        },
      });
      const fleet = join(directory, 'fleet.json');
      writeFileSync(
        fleet,
        JSON.stringify({
          signals: {
            queue: { greenReady: [{ number: 17918, head: 'e'.repeat(40) }] },
          },
        })
      );
      const preload = join(directory, 'success-transport.mjs');
      const trace = join(directory, 'trace.jsonl');
      writeFileSync(
        preload,
        `
        import cp from 'node:child_process';
        import {appendFileSync} from 'node:fs';
        import {syncBuiltinESMExports} from 'node:module';
        const mode=process.env.FIXTURE_MODE;
        const trace=(event)=>appendFileSync(process.env.FIXTURE_TRACE, JSON.stringify({mode,event})+'\\n');
        cp.spawnSync=(command,args)=>{
          if(mode!=='lost' || command!=='gh') throw new Error('duplicate-execution');
          trace('gh:'+args.slice(0,2).join(':'));
          let value;
          if(args[0]==='pr' && args[1]==='list') value=[];
          else if(args[0]==='pr' && args[1]==='view') value={number:17918,state:'OPEN',isDraft:false,baseRefName:'main',headRefOid:'e'.repeat(40),mergeStateStatus:'CLEAN',body:'JOV-6383\\nmergeQueueEntryId:MQE_fixture'};
          else if(args[0]==='api') value={data:{repository:{pullRequest:{mergedAt:null,mergeQueueEntry:{id:'MQE_fixture'},timelineItems:{nodes:[{__typename:'AddedToMergeQueueEvent'}]}}}}};
          else if(args[0]==='pr' && args[1]==='comment') value={};
          else throw new Error('unexpected-command');
          return {status:0,stdout:JSON.stringify(value),stderr:''};
        };
        syncBuiltinESMExports();
        globalThis.fetch=async(url,options)=>{
          const body=JSON.parse(options.body);
          if(url==='https://api.linear.app/graphql') {
            if(body.query.includes('issueUpdate')) {
              const done=body.variables.stateId==='a95b08f1-61f8-438f-ba39-ebd8f8ae6471';
              if(!done && mode!=='lost') throw new Error('duplicate-claim');
              trace(done?'Done':'claim');
              if(done && mode==='completion-failed') return Response.json({errors:[{message:'write-failed'}]});
              return Response.json({data:{issueUpdate:{success:true,issue:{identifier:'JOV-6383',state:{name:done?'Done':'In Progress'},assignee:null}}}});
            }
            return Response.json({data:{issue:{id:'fixture-issue',identifier:'JOV-6383',state:{name:'In Progress'}}}});
          }
          if(url!=='https://summer.example/summer/v1/symphony/executions') throw new Error('unexpected-url');
          trace('execution-post');
          if(mode==='lost') throw new Error('lost-ack');
          trace('acknowledged');
          return Response.json({schema:'summer.symphony-execution-ack/v1',taskKey:body.taskKey,status:'replay',decision:body.status});
        };
      `
      );
      let original;
      for (const mode of ['lost', 'completion-failed', 'accepted']) {
        const result = spawnSync(
          process.execPath,
          [
            '--import',
            preload,
            new URL('./run-native-queue-execution.mjs', import.meta.url)
              .pathname,
            TASK_KEY,
            'JOV-6383',
            SOURCE.sourceVersion,
            SOURCE.snapshotDigest,
            fleet,
            NATIVE_QUEUE_ACTION,
          ],
          {
            encoding: 'utf8',
            timeout: 10000,
            env: {
              GEM_WORKSPACE: directory,
              FIXTURE_MODE: mode,
              FIXTURE_TRACE: trace,
              SUMMER_LINEAR_GOVERNOR_API_KEY: 'fixture',
              SUMMER_BOTTLENECK_ORIGIN: 'https://summer.example',
              SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID: 'host-fixture',
              SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_PRIVATE_KEY:
                host.privateKey,
              SUMMER_BOTTLENECK_EVE_OUTBOX_VERIFICATION_KEYS_JSON:
                JSON.stringify({ 'company-fixture': company.publicKey }),
            },
          }
        );
        assert.equal(result.status, mode === 'accepted' ? 0 : 1, result.stderr);
        const active = journal.read().active;
        if (mode === 'lost') {
          original = JSON.stringify(active.execution);
          assert.equal(active.execution.status, 'succeeded');
          assert.equal(JSON.parse(result.stdout).terminal.state, 'In Progress');
        }
        assert.equal(JSON.stringify(active.execution), original);
        assert.equal(
          active.phase,
          mode === 'accepted' ? 'execution-recorded' : 'execution-pending'
        );
        if (mode === 'completion-failed')
          assert.match(result.stderr, /write-failed/);
        if (mode === 'accepted')
          assert.equal(JSON.parse(result.stdout).terminal.state, 'Done');
      }
      const events = readFileSync(trace, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      assert.equal(events.filter(row => row.event === 'claim').length, 1);
      assert.equal(events.filter(row => row.event === 'gh:pr:view').length, 1);
      assert.equal(
        events.filter(row => row.event === 'execution-post').length,
        3
      );
      for (const mode of ['lost', 'completion-failed', 'accepted']) {
        const row = events
          .filter(event => event.mode === mode)
          .map(event => event.event);
        if (mode === 'lost') assert.equal(row.includes('Done'), false);
        else {
          assert.ok(row.indexOf('acknowledged') < row.indexOf('Done'));
          assert.ok(!row.some(event => event.startsWith('gh:')));
        }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('execution action protocol', () => {
  it('signs exactly matching native and release actions under the existing domain', () => {
    const host = pair();
    for (const action of [NATIVE_QUEUE_ACTION, RELEASE_CERT_ACTION]) {
      const record = signNativeQueueExecution(
        {
          action,
          taskKey: TASK_KEY,
          issueIdentifier: 'JOV-6418',
          source: SOURCE,
          decision: decideNativeQueueExecution({ action, greenReadyPrs: [] }),
          completedAt: '2026-09-19T14:00:00Z',
          claim: { state: 'In Progress', assignee: 'unassigned-machine' },
          signatureKeyId: 'host',
        },
        host.privateKey
      );
      assert.equal(record.action, action);
      assert.equal(record.source.action, action);
      assert.equal(record.schema, 'jovie.symphony-native-queue-execution/v1');
      const { signature, ...unsigned } = record;
      assert.ok(
        verify(
          null,
          Buffer.from(`${record.schema}\0${canonical(unsigned)}`),
          host.publicKey,
          Buffer.from(signature.slice(8), 'base64url')
        )
      );
    }
  });
  it('rejects missing and unsupported action before claiming or executing any work', async () => {
    for (const action of [undefined, null, '', 'arbitrary']) {
      assert.throws(
        () => unsignedNativeQueueExecution({ action }),
        /native-queue-action-required/
      );
      let claims = 0;
      await assert.rejects(
        executeNativeQueueStarvation({
          taskKey: TASK_KEY,
          issueIdentifier: 'JOV-6418',
          source: SOURCE,
          signatureKeyId: 'host',
          privateKeyPem: pair().privateKey,
          completeIssue: async () => {
            throw new Error('unexpected-completion');
          },
          enrollPr: async () => {
            throw new Error('unexpected-execution');
          },
          writeExecution: async () => {
            throw new Error('unexpected-write');
          },
          admission: { action, greenReadyPrs: [] },
          claimIssue: async () => {
            claims++;
          },
        }),
        /native-queue-action-required/
      );
      assert.equal(claims, 0);
    }
  });
});

describe('retained execution delivery binding', () => {
  it('rejects cross-bound replay before posting or repeating any mutation', async () => {
    const host = pair();
    const record = signNativeQueueExecution(
      {
        action: NATIVE_QUEUE_ACTION,
        taskKey: TASK_KEY,
        issueIdentifier: 'JOV-6418',
        source: SOURCE,
        decision: decideNativeQueueExecution({
          action: NATIVE_QUEUE_ACTION,
          greenReadyPrs: [],
        }),
        completedAt: '2026-09-19T14:00:00Z',
        claim: { state: 'In Progress', assignee: null },
        signatureKeyId: 'host',
      },
      host.privateKey
    );
    for (const change of [
      { delivery: null },
      { taskKey: 'f'.repeat(64) },
      { issueIdentifier: 'JOV-6417' },
      { admission: { action: RELEASE_CERT_ACTION } },
      { source: { ...SOURCE, snapshotDigest: 'f'.repeat(64) } },
      { source: { ...SOURCE, sourceVersion: 'f'.repeat(40) } },
      {
        retainedRecord: {
          ...record,
          source: { ...record.source, action: RELEASE_CERT_ACTION },
        },
      },
    ]) {
      await assert.rejects(
        executeNativeQueueStarvation({
          taskKey: TASK_KEY,
          issueIdentifier: 'JOV-6418',
          admission: { action: NATIVE_QUEUE_ACTION },
          source: SOURCE,
          signatureKeyId: 'host',
          privateKeyPem: host.privateKey,
          delivery: {},
          retainedRecord: record,
          claimIssue: async () => {
            throw new Error('unexpected claim');
          },
          completeIssue: async () => {
            throw new Error('unexpected completion');
          },
          enrollPr: async () => {
            throw new Error('unexpected mutation');
          },
          writeExecution: async () => {
            throw new Error('unexpected write');
          },
          ...change,
        }),
        /execution-replay-cross-bound/
      );
    }
  });
});
