import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { digest, evaluate, SCHEMA } from '../native-queue-eval.mjs';

const head = 'a'.repeat(40),
  base = 'b'.repeat(40);
const at = '2026-09-09T02:00:00.000Z';
const later = seconds =>
  new Date(Date.parse(at) + seconds * 1000).toISOString();
const evaluationTime = Date.parse(at) + 60_000;
const required = [
  'PR Ready',
  'Migration Guard',
  'Fork PR Gate',
  'PR Size Guard',
].map(context => ({ context }));
const policy = {
  required,
  review: { required_approving_review_count: 0 },
  queue: { grouping_strategy: 'ALLGREEN' },
  bypassActors: [],
  classicProtection: null,
  enforcement: 'active',
};
const checks = required.map(r => ({
  name: r.context,
  sha: head,
  state: 'success',
  startedAt: at,
  completedAt: at,
}));
const pr = () => ({
  number: 16237,
  headRefOid: head,
  baseRefOid: base,
  baseRefName: 'main',
  state: 'OPEN',
  isDraft: false,
  mergeable: 'MERGEABLE',
  labels: [],
  files: ['scripts/example.mjs'],
  checks: structuredClone(checks),
  reviewDecision: null,
  isInMergeQueue: false,
  mergeQueueEntry: null,
});

function policySource(path, content) {
  return {
    path,
    ref: base,
    encoding: 'base64',
    content: Buffer.from(content).toString('base64'),
    sha: createHash('sha1')
      .update(`blob ${Buffer.byteLength(content)}\0`)
      .update(content)
      .digest('hex'),
  };
}

function passingFixture() {
  const repository = 'JovieInc/Jovie';
  const run = {
    id: 10,
    run_attempt: 1,
    repository: { full_name: repository },
    head_sha: head,
    path: '.github/workflows/ci.yml',
    event: 'merge_group',
    status: 'completed',
    conclusion: 'success',
  };
  const snapshots = [1, 2, 3].map(id => ({
    repository,
    main: base,
    policySha: base,
    policy,
    policyDigest: digest(policy),
    startedAt: later(id * 10),
    finishedAt: later(id * 10 + 1),
    complete: true,
    errors: [],
    scheduler: {
      workflow: policySource(
        '.github/workflows/merge-queue-autoenroll.yml',
        'on:\n  workflow_run:\nconcurrency:\n  group: merge-queue-drain-mutex\n  cancel-in-progress: false\njobs:\n  fleet-policy:\n    timeout-minutes: 5\n  enroll:\n    steps: []\n'
      ),
      drain: policySource(
        'scripts/drain-pr-queue.sh',
        'DRAIN_MAX_SECONDS="${DRAIN_MAX_SECONDS:-900}"'
      ),
    },
    cycles: [
      {
        id,
        repository: { full_name: repository },
        path: '.github/workflows/merge-queue-autoenroll.yml',
        status: 'completed',
        conclusion: 'success',
        created_at: later(id * 10 - 9),
        updated_at: later(id * 10 - 5),
      },
    ],
    prs: [16237, 20000].map(number => ({
      ...pr(),
      number,
      isInMergeQueue: true,
      mergeQueueEntry: {
        id: `entry${number}`,
        position: number === 16237 ? 1 : 2,
        state: 'AWAITING_CHECKS',
        enqueuedAt: at,
        headCommit: { oid: head },
        baseCommit: { oid: base },
      },
    })),
  }));
  const merges = [16237, 20000].map(number => {
    const values = {
      ADMISSION_ADMITTED: 'true',
      ADMISSION_OBSOLETE: 'false',
      ADMISSION_PR: String(number),
      ADMISSION_SYNTHETIC_HEAD: head,
      RUN_WEB: 'true',
      RUN_IOS: 'false',
      RUN_MACOS: 'false',
      RUN_CROSS_PRODUCT: 'false',
      RUN_PROMPTFOO: 'false',
      RUN_GOLDEN_EVAL: 'false',
      SELECTED_LANES: 'web',
    };
    for (const n of [
      'PATH',
      'ADMISSION',
      'RISK',
      'FAST',
      'SECRET',
      'GOLDEN_PATH_LOCK',
      'VISUAL_COMPARE',
      'MIGRATION',
      'LANE_RECEIPT',
      'UNIT',
      'BUILD_LAYOUT',
    ])
      values[`${n}_RESULT`] = 'success';
    for (const n of [
      'IOS',
      'MACOS',
      'CROSS_PRODUCT',
      'PROMPTFOO',
      'GOLDEN_EVAL',
    ])
      values[`${n}_RESULT`] = 'skipped';
    return {
      repository,
      number,
      observedAt: later(45),
      head,
      commit: head,
      groupHead: head,
      groupBase: base,
      main: head,
      policyDigest: digest(policy),
      run,
      checks,
      compare: {
        base_commit: { sha: head },
        merge_base_commit: { sha: head },
        status: 'identical',
      },
      timeline: {
        pageInfo: { hasPreviousPage: false },
        nodes: [
          {
            __typename: 'AddedToMergeQueueEvent',
            createdAt: at,
            actor: { login: 'jovie-bot' },
            enqueuer: { login: 'jovie-bot[bot]' },
          },
          {
            __typename: 'MergedEvent',
            createdAt: later(number === 16237 ? 40 : 41),
            actor: { login: 'jovie-bot' },
            commit: { oid: head },
            mergeRefName: 'main',
          },
        ],
      },
      gateEvidence: {
        readyJob: {
          run_id: run.id,
          run_attempt: run.run_attempt,
          head_sha: head,
          name: 'PR Ready',
          status: 'completed',
          conclusion: 'success',
        },
        readyLog: Object.entries(values)
          .map(([k, v]) => `${k}="${v}"`)
          .join('\n'),
        artifact: {
          workflow_run: { id: run.id, head_sha: head },
          name: `product-lane-final-${head}-1`,
          expired: false,
        },
        laneReceipt: {
          provenance: { sha: head, runId: run.id, runAttempt: 1 },
          selectedLanes: ['web'],
          actualResults: { lanes: { web: ['success', 'success'] } },
        },
      },
    };
  });
  // Distinct PRs must have distinct exact combined revisions.
  const secondHead = 'c'.repeat(40);
  merges[1] = JSON.parse(
    JSON.stringify(merges[1]).replaceAll(head, secondHead)
  );
  merges[1].groupBase = head;
  for (const snapshot of snapshots) {
    snapshot.prs[1] = JSON.parse(
      JSON.stringify(snapshot.prs[1]).replaceAll(head, secondHead)
    );
    snapshot.prs[1].mergeQueueEntry.baseCommit.oid = head;
  }
  return {
    schema: SCHEMA,
    repository,
    startedAt: at,
    snapshots,
    merges,
    evaluatorSha: head,
    validation: {
      run,
      job: {
        run_id: run.id,
        run_attempt: 1,
        head_sha: head,
        conclusion: 'success',
        name: 'ci-fast (remaining)',
        status: 'completed',
        completed_at: later(50),
        steps: [
          {
            name: 'Run structural ci-fast lane',
            status: 'completed',
            conclusion: 'success',
          },
        ],
      },
      log: 'lib/__tests__/native-queue-eval.test.mjs --coverage.include=lib/native-queue-eval.mjs\nTest Files 1 passed\nLines : 99%',
    },
  };
}

describe('complete evidence and deliberate negative controls', () => {
  it.each([
    null,
    {},
    { schema: SCHEMA, repository: 'other/repo' },
  ])('rejects invalid envelope %s', input => {
    expect(evaluate(input).status).toBe('BLOCKED');
  });
  const successfulRemoval = () => ({
    __typename: 'RemovedFromMergeQueueEvent',
    createdAt: later(39),
    reason: 'merged',
    actor: { login: 'github-merge-queue' },
    enqueuer: { login: 'github-merge-queue[bot]' },
    beforeCommit: { oid: head },
  });
  it('accepts GitHub native successful-merge removal with the exact commit', () => {
    const b = passingFixture();
    b.merges[0].timeline.nodes.splice(1, 0, successfulRemoval());
    expect(evaluate(b, evaluationTime).status).toBe('PASS');
  });
  it.each([
    ['manual removal', e => (e.reason = 'manual')],
    [
      'missing removal reason',
      e => {
        delete e.reason;
      },
    ],
    ['wrong removal actor', e => (e.actor.login = 'jovie-bot')],
    ['wrong removal enqueuer', e => (e.enqueuer.login = 'jovie-bot[bot]')],
    ['wrong removal commit', e => (e.beforeCommit.oid = base)],
  ])('rejects %s before merge', (_, mutate) => {
    const b = passingFixture(),
      e = successfulRemoval();
    mutate(e);
    b.merges[0].timeline.nodes.splice(1, 0, e);
    expect(evaluate(b, evaluationTime).blocked).toContain(
      '16237:dequeue-before-merge'
    );
  });
  it('accepts a complete isolated receipt fixture', () => {
    expect(evaluate(passingFixture(), evaluationTime).status).toBe('PASS');
  });
  it.each([
    [
      'skipped hosted validation',
      b => (b.validation.job.steps[0].conclusion = 'skipped'),
    ],
    ['wrong hosted attempt', b => (b.validation.job.run_attempt = 2)],
    ['fake job log', b => (b.validation.job.name = 'unrelated job')],
    ['future CI receipt', b => (b.validation.job.completed_at = later(90))],
    [
      'future merge',
      b => {
        b.merges[0].timeline.nodes[1].createdAt = later(90);
      },
    ],
    [
      'future observation',
      b => {
        b.merges[0].observedAt = later(90);
      },
    ],
    [
      'missing observation',
      b => {
        delete b.merges[0].observedAt;
      },
    ],
    [
      'replayed inventory',
      b => {
        b.snapshots[1].startedAt = b.snapshots[0].startedAt;
      },
    ],
    [
      'reversed inventory times',
      b => {
        b.snapshots[0].finishedAt = at;
      },
    ],
    [
      'stale collection started long ago',
      b => {
        b.snapshots[2].startedAt = '2026-09-09T01:00:00Z';
      },
    ],
    [
      'actor mismatch',
      b => {
        b.merges[0].timeline.nodes[0].actor.login = 'human';
      },
    ],
    [
      'changed head',
      b => {
        b.merges[0].head = base;
      },
    ],
    [
      'bad group revision',
      b => {
        b.merges[0].groupHead = base;
      },
    ],
    [
      'failing check',
      b => {
        b.merges[0].checks = [{ ...checks[0], state: 'failure' }];
      },
    ],
    [
      'unreachable merge',
      b => {
        b.merges[0].compare.status = 'diverged';
      },
    ],
    [
      'missing artifact',
      b => {
        b.merges[0].gateEvidence.artifact = null;
      },
    ],

    [
      'missing recurrence observation',
      b => (b.snapshots = b.snapshots.slice(0, 2)),
    ],
    [
      'same cycle replay',
      b => {
        for (const s of b.snapshots) s.cycles[0].id = 1;
      },
    ],
    [
      'API error',
      b => {
        b.snapshots[0].errors = ['502'];
      },
    ],
    [
      'unknown scheduler',
      b => {
        b.snapshots[0].scheduler.workflow.sha = head;
      },
    ],
    [
      'false validation flags',
      b => {
        b.validation = {
          ciControlPassed: true,
          coveragePassed: true,
          selfTestPassed: true,
          hostedCiPassed: true,
        };
      },
    ],
    [
      'bypass',
      b => {
        b.snapshots[0].policy = { ...policy, bypassActors: [{ actor_id: 1 }] };
      },
    ],
    [
      'queue ejection',
      b => {
        b.merges[0].timeline.nodes.splice(1, 0, {
          __typename: 'RemovedFromMergeQueueEvent',
          createdAt: '2026-09-09T02:00:00.500Z',
        });
      },
    ],
    [
      'entry churn',
      b => {
        b.snapshots[1].prs[0].mergeQueueEntry.id = 'replacement';
      },
    ],
  ])('%s cannot produce PASS', (_, mutate) => {
    const b = structuredClone(passingFixture());
    mutate(b);
    expect(evaluate(b, evaluationTime).status).not.toBe('PASS');
  });
  it('distinguishes bounded admission from stranded eligible work', () => {
    const b = passingFixture();
    b.snapshots[0].prs[0].isInMergeQueue = false;
    b.snapshots[0].prs[0].mergeQueueEntry = null;
    expect(evaluate(b, evaluationTime).status).toBe('PASS');
    for (const s of b.snapshots) s.prs.push({ ...pr(), number: 123 });
    expect(evaluate(b, evaluationTime).blocked).toContain(
      `unadmitted-eligible:123:${head}`
    );
    b.snapshots[0].cycles[0].conclusion = 'failure';
    expect(evaluate(b, evaluationTime).status).toBe('FAIL');
  });
  it('rejects stale/future snapshots and absent scheduler execution', () => {
    expect(
      evaluate(passingFixture(), Date.parse(at) + 600_000).blocked
    ).toContain('stale-or-future-inventory');
    expect(evaluate(passingFixture(), Date.parse(at) - 1).blocked).toContain(
      'stale-or-future-inventory'
    );
  });
});
