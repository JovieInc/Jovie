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
    readback: [],
    readbackAt: later(id * 10 + 1),
    errors: [],
    prs: [16237, 20000].map(number => ({
      ...pr(),
      number,
      isInMergeQueue: true,
      mergeQueueEntry: {
        id: `entry${number}`,
        position: number === 16237 ? 1 : 2,
        state: 'AWAITING_CHECKS',
        enqueuedAt: at,
        enqueuer: { __typename: 'User', login: 'native-agent' },
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
      entryId: `entry${number}`,
      nativeMerge: {
        number,
        merged: true,
        state: 'closed',
        merged_at: later(number === 16237 ? 40 : 41),
        merged_by: { type: 'User', login: 'native-agent' },
        merge_commit_sha: head,
        head: { sha: head },
        base: { ref: 'main', repo: { full_name: repository } },
      },
      run,
      checks,
      compare: {
        base_commit: { sha: head },
        merge_base_commit: { sha: head },
        status: 'identical',
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
    snapshot.readback = structuredClone(snapshot.prs);
    snapshot.readbackAt = snapshot.finishedAt;
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
    ['hosted colorized table', '', 'PASS'],
    ['colored failure', '\u001b[31mTest Files 1 failed\u001b[39m', 'BLOCKED'],
    [
      'coverage failure',
      'ERROR: Coverage for lines does not meet threshold',
      'BLOCKED',
    ],
    ['missing table', 'missing', 'BLOCKED'],
  ])('validates %s coverage evidence', (_name, suffix, status) => {
    const b = passingFixture();
    // Successful hosted job 107432527829 uses V8 table output and ANSI colors.
    b.validation.log = [
      'lib/__tests__/native-queue-eval.test.mjs --coverage.include=lib/native-queue-eval.mjs',
      '2026-09-24T00:02:27.4730687Z \u001b[2m Test Files \u001b[22m \u001b[1m\u001b[32m50 passed\u001b[39m',
      ...(suffix === 'missing'
        ? []
        : [
            ' % Coverage report from v8',
            'File | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s',
            'All files | 89.54 | 81.54 | 92.11 | 90.33 |',
          ]),
      suffix,
    ].join('\n');
    expect(evaluate(b, evaluationTime).status).toBe(status);
  });
  it.each(['User', 'Bot'])(
    'proves native %s admission without retired workflow or timeline authority',
    actor => {
      const b = passingFixture();
      for (const snapshot of b.snapshots)
        for (const p of snapshot.prs)
          p.mergeQueueEntry.enqueuer.__typename = actor;
      for (const m of b.merges) m.nativeMerge.merged_by.type = actor;
      // The live canary returned an hours-old removal after native admission.
      b.merges = b.merges.map(m => ({
        ...m,
        timeline: {
          nodes: [
            {
              __typename: 'RemovedFromMergeQueueEvent',
              createdAt: later(-3600),
            },
          ],
        },
      }));
      expect(evaluate(b, evaluationTime).status).toBe('PASS');
    }
  );
  it.each([null, {}, { schema: SCHEMA, repository: 'other/repo' }])(
    'rejects invalid envelope %s',
    input => {
      expect(evaluate(input).status).toBe('BLOCKED');
    }
  );
  it.each([
    ['nativeMerge.merged', false],
    ['nativeMerge.base.repo.full_name', 'other/repo'],
    ['nativeMerge.head.sha', base],
    ['nativeMerge.merge_commit_sha', base],
    ['nativeMerge.base.ref', 'other'],
    ['nativeMerge.number', 123],
    ['nativeMerge.merged_by', null],
    ['entryId', 'replacement'],
    ['nativeMerge', undefined],
    ['nativeMerge.state', 'open'],
    ['nativeMerge.merged_at', null],
    ['nativeMerge.merged_by.login', ''],
  ])('blocks unbound native merge: %s', (path, value) => {
    const b = passingFixture();
    const keys = path.split('.');
    const key = keys.pop();
    const target = keys.reduce((record, field) => record[field], b.merges[0]);
    target[key] = value;
    expect(evaluate(b, evaluationTime).status).toBe('BLOCKED');
  });
  it.each(['queue-deferred', 'needs-conflict-resolution', 'fast'])(
    'distinguishes stale %s from a real native conflict',
    label => {
      const b = passingFixture();
      for (const s of b.snapshots) s.prs[0].labels = [label];
      expect(evaluate(b, evaluationTime).status).toBe('PASS');
      for (const s of b.snapshots) s.prs[0].mergeable = 'CONFLICTING';
      expect(evaluate(b, evaluationTime).blocked).toContain(
        '16237:source-policy-at-admission'
      );
    }
  );
  it('retains review rejection despite obsolete machine labels', () => {
    const b = passingFixture();
    for (const s of b.snapshots) {
      s.prs[0].labels = ['needs-conflict-resolution'];
      s.prs[0].reviewDecision = 'CHANGES_REQUESTED';
    }
    expect(evaluate(b, evaluationTime).blocked).toContain(
      '16237:source-policy-at-admission'
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
        b.merges[0].nativeMerge.merged_at = later(90);
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
      'missing inventory readback',
      b => {
        delete b.snapshots[0].readback;
      },
    ],
    [
      'changed inventory readback',
      b => {
        b.snapshots[0].readback[0].headRefOid = base;
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
      'missing native admission identity',
      b => {
        for (const s of b.snapshots) s.prs[0].mergeQueueEntry.enqueuer = null;
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
      'API error',
      b => {
        b.snapshots[0].errors = ['502'];
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
  it('distinguishes observed admission from stranded eligible work', () => {
    const b = passingFixture();
    b.snapshots[0].prs[0].isInMergeQueue = false;
    b.snapshots[0].prs[0].mergeQueueEntry = null;
    b.snapshots[0].readback = structuredClone(b.snapshots[0].prs);
    expect(evaluate(b, evaluationTime).status).toBe('PASS');
    for (const s of b.snapshots) s.prs.push({ ...pr(), number: 123 });
    expect(evaluate(b, evaluationTime).blocked).toContain(
      `unadmitted-eligible:123:${head}`
    );
  });
  it('rejects stale/future snapshots and missing lifecycle evidence', () => {
    expect(
      evaluate(passingFixture(), Date.parse(at) + 600_000).blocked
    ).toContain('stale-or-future-inventory');
    expect(evaluate(passingFixture(), Date.parse(at) - 1).blocked).toContain(
      'stale-or-future-inventory'
    );
  });
});
