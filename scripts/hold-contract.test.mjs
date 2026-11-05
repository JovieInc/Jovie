import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  CONTRACT_LABELS,
  evaluateHold,
  HOLD_LABEL,
  MAX_HOLD_MS,
  OWNERLESS_GRACE_MS,
  parseHoldReceipt,
  releaseComment,
  sweepHolds,
} from './hold-contract.mjs';

const HOUR = 3600 * 1000;
const LABELED = '2026-10-08T05:47:46Z';
const T0 = Date.parse(LABELED);
const HEAD = 'a'.repeat(40);
const receipt = fields =>
  `Holding for qualification.\n<!-- jovie-hold/v1 ${JSON.stringify(fields)} -->`;
const comment = (fields, createdAt = '2026-10-08T05:48:00Z') => ({
  body: typeof fields === 'string' ? fields : receipt(fields),
  createdAt,
});

// Execute the actual CLI and retry adapter across the gh process boundary.
// The fixture answers every request locally, including the reset-budget read.
function runCli(scenario, { dryRun = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hold-contract-cli-'));
  const callsPath = join(dir, 'calls.jsonl');
  const executable = join(dir, 'gh');
  writeFileSync(
    executable,
    `#!${process.execPath}
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.HOLD_TEST_CALLS, JSON.stringify(args) + '\\n');
const stage = args[0] === 'pr' ? 'list'
  : args[1] === 'rate_limit' ? 'reset'
  : args[1] === 'graphql' ? 'read'
  : args.includes('DELETE') ? 'unlabel' : 'comment';
const scenario = process.env.HOLD_TEST_SCENARIO;
if (stage === 'reset') { console.log('0 9999999999'); process.exit(0); }
if (scenario === stage + '-quota') {
  console.error('GraphQL: API rate limit already exceeded for installation ID 112037986.');
  process.exit(1);
}
if (scenario === stage + '-transient' && !existsSync(process.env.HOLD_TEST_CALLS + '.transient')) {
  writeFileSync(process.env.HOLD_TEST_CALLS + '.transient', 'response lost');
  console.error('HTTP 503: response lost after the write may have completed');
  process.exit(1);
}
if (scenario === stage + '-forbidden') {
  console.error('HTTP 403: Resource not accessible by integration');
  process.exit(1);
}
if (stage === 'list') {
  console.log(JSON.stringify(scenario === 'empty' ? [] : [
    { number: 1, labels: [{ name: 'hold' }] },
    { number: 2, labels: [{ name: 'unrelated' }] }
  ]));
} else if (stage === 'read') {
  console.log(JSON.stringify({ data: { repository: { pullRequest: {
    state: scenario === 'closed' ? 'CLOSED' : 'OPEN',
    headRefOid: 'a'.repeat(40), labels: { nodes: [{ name: 'hold' }] },
    timelineItems: { nodes: [{ createdAt: '2026-10-08T05:47:46Z', label: { name: 'hold' } }] },
    comments: { pageInfo: { hasPreviousPage: false }, nodes: [] }
  } } } }));
} else { console.log('{}'); }
`
  );
  chmodSync(executable, 0o755);
  try {
    const result = spawnSync(
      process.execPath,
      [resolve('scripts/hold-contract.mjs')],
      {
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          GITHUB_REPOSITORY: 'JovieInc/Jovie',
          DRY_RUN: String(dryRun),
          HOLD_TEST_SCENARIO: scenario,
          HOLD_TEST_CALLS: callsPath,
        },
      }
    );
    assert.equal(result.error, undefined);
    const calls = readFileSync(callsPath, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      calls,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const mutations = calls =>
  calls.filter(
    args =>
      args[0] === 'api' && args[1] !== 'graphql' && args[1] !== 'rate_limit'
  );

test('CLI defers a quota-exhausted list without judging or releasing holds', () => {
  const result = runCli('list-quota');
  assert.equal(result.status, 75);
  assert.match(result.stderr, /github-quota-deferred/);
  assert.match(result.stderr, /Hold contract sweep deferred/);
  assert.deepEqual(mutations(result.calls), []);
  assert.equal(result.calls.filter(args => args[0] === 'pr').length, 1);
  assert.equal(result.calls.filter(args => args[1] === 'rate_limit').length, 1);
});

test('CLI defers unreadable PR evidence without posting a release comment', () => {
  const result = runCli('read-quota');
  assert.equal(result.status, 75);
  assert.match(result.stderr, /github-quota-deferred/);
  assert.deepEqual(mutations(result.calls), []);
});

test('CLI preserves authorization failures as real failures without retrying', () => {
  const result = runCli('list-forbidden');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Resource not accessible/);
  assert.doesNotMatch(result.stderr, /github-quota-deferred/);
  assert.equal(result.calls.length, 1);
});

test('CLI awaits the release comment before removing the held label', () => {
  const result = runCli('success');
  assert.equal(result.status, 0);
  const writes = mutations(result.calls);
  assert.equal(writes.length, 2);
  assert.match(writes[0][1], /issues\/1\/comments$/);
  assert.ok(writes[1].includes('DELETE'));
  assert.ok(writes[1].includes('repos/JovieInc/Jovie/issues/1/labels/hold'));
});

test('CLI never unlabels when the release comment is quota-deferred', () => {
  const result = runCli('comment-quota');
  assert.equal(result.status, 75);
  const writes = mutations(result.calls);
  assert.equal(writes.length, 1);
  assert.match(writes[0][1], /comments$/);
  assert.ok(!result.calls.some(args => args.includes('DELETE')));
});

test('CLI reports an incomplete label release as deferred after the comment', () => {
  const result = runCli('unlabel-quota');
  assert.equal(result.status, 75);
  assert.equal(mutations(result.calls).length, 2);
  assert.match(result.stderr, /github-quota-deferred/);
});

test('CLI dry runs read evidence but never write, and empty or closed sets succeed', () => {
  const dry = runCli('success', { dryRun: true });
  assert.equal(dry.status, 0);
  assert.deepEqual(mutations(dry.calls), []);
  assert.equal(runCli('empty').status, 0);
  assert.equal(runCli('closed').status, 0);
});

test('parses only receipts that name an owner and a machine-checkable release', () => {
  assert.deepEqual(
    parseHoldReceipt(
      receipt({ owner: 'codex', until: '2026-10-09T00:00:00Z', reason: 'x' })
    ),
    {
      owner: 'codex',
      until: Date.parse('2026-10-09T00:00:00Z'),
      head: null,
      reason: 'x',
    }
  );
  assert.equal(
    parseHoldReceipt(receipt({ owner: 'gem', head: HEAD.toUpperCase() })).head,
    HEAD
  );
  for (const invalid of [
    receipt({ until: '2026-10-09T00:00:00Z' }),
    receipt({ owner: ' ', head: HEAD }),
    receipt({ owner: 'codex', reason: 'native admission' }),
    receipt({ owner: 'codex', until: 'tomorrow', head: 'abc' }),
    '<!-- jovie-hold/v1 {not json} -->',
    'Keep this draft held until normal qualification completes.',
    null,
  ]) {
    assert.equal(parseHoldReceipt(invalid), null);
  }
});

test('a prose-only hold is released after the ownerless grace period', () => {
  // #20985 / #20983: "until qualification completes" with no machine check,
  // held 86 h while lanes only nagged.
  const prose = [comment('Keep this draft held until qualification.')];
  assert.deepEqual(
    evaluateHold({
      labeledAt: LABELED,
      now: T0 + OWNERLESS_GRACE_MS - 1,
      headSha: HEAD,
      comments: prose,
    }),
    { action: 'keep', reason: 'ownerless-grace' }
  );
  assert.deepEqual(
    evaluateHold({
      labeledAt: LABELED,
      now: T0 + 86 * HOUR,
      headSha: HEAD,
      comments: prose,
    }),
    { action: 'release', reason: 'ownerless' }
  );
});

test('an owned receipt holds until its expiry, its head change, or the hard cap', () => {
  const until = comment({ owner: 'codex', until: '2026-10-09T05:47:46Z' });
  const at = now =>
    evaluateHold({ labeledAt: LABELED, now, headSha: HEAD, comments: [until] })
      .reason;
  assert.equal(at(T0 + 23 * HOUR), 'receipt-valid');
  assert.equal(at(T0 + 24 * HOUR), 'expired');

  const onHead = comment({ owner: 'gem', head: HEAD });
  const headAt = (headSha, now = T0 + HOUR) =>
    evaluateHold({ labeledAt: LABELED, now, headSha, comments: [onHead] })
      .reason;
  assert.equal(headAt(HEAD), 'receipt-valid');
  assert.equal(headAt('b'.repeat(40)), 'head-changed');
  assert.equal(headAt(HEAD, T0 + MAX_HOLD_MS + HOUR), 'expired');

  const farFuture = comment({ owner: 'codex', until: '2099-01-01T00:00:00Z' });
  assert.equal(
    evaluateHold({
      labeledAt: LABELED,
      now: T0 + MAX_HOLD_MS + HOUR,
      headSha: HEAD,
      comments: [farFuture],
    }).reason,
    'expired'
  );
});

test('receipts from before the current hold do not keep it, and the newest receipt wins', () => {
  const stale = comment({ owner: 'codex', head: HEAD }, '2026-10-01T00:00:00Z');
  assert.equal(
    evaluateHold({
      labeledAt: LABELED,
      now: T0 + 30 * HOUR,
      headSha: HEAD,
      comments: [stale],
    }).reason,
    'ownerless'
  );
  const justBefore = comment(
    { owner: 'codex', head: HEAD },
    '2026-10-08T05:30:00Z'
  );
  const newer = comment(
    { owner: 'gem', until: '2026-10-08T07:00:00Z' },
    '2026-10-08T06:00:00Z'
  );
  assert.deepEqual(
    evaluateHold({
      labeledAt: LABELED,
      now: T0 + 2 * HOUR,
      headSha: HEAD,
      comments: [justBefore, newer],
    }),
    { action: 'release', reason: 'expired', owner: 'gem' }
  );
  assert.equal(
    evaluateHold({
      labeledAt: 'not a time',
      now: T0,
      headSha: HEAD,
      comments: [],
    }).reason,
    'incomplete-evidence'
  );
});

test('the sweep comments then unlabels only released holds and dry runs never write', async () => {
  const prs = {
    1: {
      state: 'OPEN',
      headRefOid: HEAD,
      labels: { nodes: [{ name: HOLD_LABEL }] },
      timelineItems: {
        nodes: [
          { createdAt: '2026-10-01T00:00:00Z', label: { name: HOLD_LABEL } },
          { createdAt: LABELED, label: { name: HOLD_LABEL } },
          { createdAt: '2026-10-09T00:00:00Z', label: { name: 'other' } },
        ],
      },
      comments: { pageInfo: { hasPreviousPage: false }, nodes: [] },
    },
    2: {
      state: 'OPEN',
      headRefOid: HEAD,
      labels: { nodes: [{ name: HOLD_LABEL }] },
      timelineItems: {
        nodes: [{ createdAt: LABELED, label: { name: HOLD_LABEL } }],
      },
      comments: {
        pageInfo: { hasPreviousPage: false },
        nodes: [comment({ owner: 'gem', head: HEAD })],
      },
    },
    3: { state: 'CLOSED' },
    4: {
      state: 'OPEN',
      headRefOid: HEAD,
      labels: { nodes: [] },
      timelineItems: { nodes: [] },
    },
  };
  const writes = [];
  const io = {
    listHeld: () => [1, 2, 3, 4],
    read: number => prs[number],
    comment: (number, body) => writes.push(['comment', number, body]),
    unlabel: number => writes.push(['unlabel', number]),
  };
  const log = console.log;
  console.log = () => {};
  try {
    const dry = await sweepHolds({ now: T0 + 30 * HOUR, dryRun: true, io });
    assert.deepEqual(
      dry.map(r => [r.number, r.action]),
      [
        [1, 'release'],
        [2, 'keep'],
      ]
    );
    assert.deepEqual(writes, []);
    await sweepHolds({ now: T0 + 30 * HOUR, dryRun: false, io });
  } finally {
    console.log = log;
  }
  assert.deepEqual(
    writes.map(([kind, number]) => [kind, number]),
    [
      ['comment', 1],
      ['unlabel', 1],
    ]
  );
  assert.match(writes[0][2], /no `jovie-hold\/v1` receipt/);
  assert.match(
    releaseComment({ reason: 'head-changed', owner: 'gem' }),
    /owner `gem`/
  );
});

test('the enroll workflow runs the trusted hold contract with a Jovie Bot token', () => {
  const { load } = createRequire(import.meta.url)('js-yaml');
  const workflow = load(
    readFileSync('.github/workflows/merge-queue-green-enroll.yml', 'utf8')
  );
  const job = workflow.jobs['enforce-hold-contract'];
  assert.match(job.if, /push/);
  const checkout = job.steps.find(step => step.uses?.includes('checkout'));
  assert.equal(
    checkout.with.ref,
    '${{ github.event.repository.default_branch }}'
  );
  assert.match(checkout.with['sparse-checkout'], /scripts\/hold-contract\.mjs/);
  assert.match(
    checkout.with['sparse-checkout'],
    /scripts\/lib\/admission-hold-labels\.json\n\s*scripts\/lib\/admission-hold-labels\.mjs/
  );
  const token = job.steps.find(step => step.id === 'app-token');
  assert.equal(token.with['permission-pull-requests'], 'write');
  assert.ok(
    job.steps.some(step => step.run === 'node scripts/hold-contract.mjs')
  );
});

async function runHoldSweep(pr, now) {
  const writes = [];
  const log = console.log;
  console.log = () => {};
  try {
    const results = await sweepHolds({
      now,
      dryRun: false,
      io: {
        listHeld: () => [pr.number ?? 9],
        read: () => pr,
        comment: (...args) => writes.push(['comment', ...args]),
        unlabel: (...args) => writes.push(['unlabel', ...args]),
      },
    });
    return { results, writes };
  } finally {
    console.log = log;
  }
}

// EVENT 2026-10-28: no stop label is human-owned. The retired labels are not in
// the contract vocabulary, so the sweep neither honours nor touches them.
for (const label of ['tim-hold', 'tim:hold', 'hold:tim', 'do-not-merge']) {
  test(`${label} is retired: not a stop label and never preserved`, async () => {
    assert.ok(!CONTRACT_LABELS.includes(label));
    const pr = {
      state: 'OPEN',
      headRefOid: HEAD,
      labels: { nodes: [{ name: label }] },
      timelineItems: {
        nodes: [{ createdAt: LABELED, label: { name: label } }],
      },
      comments: { pageInfo: { hasPreviousPage: false }, nodes: [] },
    };
    const { results, writes } = await runHoldSweep(pr, T0 + MAX_HOLD_MS + HOUR);
    assert.deepEqual(results, []);
    assert.deepEqual(writes, []);
  });
}

test('a machine hold alongside a retired human label still follows the contract', async () => {
  const pr = {
    state: 'OPEN',
    headRefOid: 'b'.repeat(40),
    labels: { nodes: [{ name: 'hold' }, { name: 'tim-hold' }] },
    timelineItems: { nodes: [{ createdAt: LABELED, label: { name: 'hold' } }] },
    comments: {
      pageInfo: { hasPreviousPage: false },
      nodes: [comment({ owner: 'gem', head: HEAD })],
    },
  };
  const { results } = await runHoldSweep(pr, T0 + MAX_HOLD_MS + HOUR);
  assert.deepEqual(
    results.map(row => [row.label, row.action]),
    [['hold', 'release']]
  );
});

test('machine stop labels follow their own labeled time', async () => {
  // #21014 / #20953: `gated` applied 2026-10-08 with no owner or expiry sat
  // outside the contract and blocked admission indefinitely.
  const pr = {
    state: 'OPEN',
    headRefOid: HEAD,
    labels: {
      nodes: [{ name: 'gated' }, { name: 'queue-deferred' }, { name: 'ui' }],
    },
    timelineItems: {
      nodes: [
        { createdAt: LABELED, label: { name: 'gated' } },
        {
          createdAt: '2026-10-09T10:00:00Z',
          label: { name: 'queue-deferred' },
        },
      ],
    },
    comments: { pageInfo: { hasPreviousPage: false }, nodes: [] },
  };
  const writes = [];
  const log = console.log;
  console.log = () => {};
  try {
    const results = await sweepHolds({
      now: T0 + 30 * HOUR,
      dryRun: false,
      io: {
        listHeld: () => [9],
        read: () => pr,
        comment: (number, body) => writes.push(['comment', number, body]),
        unlabel: (number, label) => writes.push(['unlabel', number, label]),
      },
    });
    assert.deepEqual(
      results.map(r => [r.label, r.action, r.reason]),
      [
        ['gated', 'release', 'ownerless'],
        ['queue-deferred', 'keep', 'ownerless-grace'],
      ]
    );
  } finally {
    console.log = log;
  }
  assert.deepEqual(writes[1], ['unlabel', 9, 'gated']);
  assert.match(writes[0][2], /releasing `gated`/);
  assert.equal(writes.length, 2);
});

test('an exact-head queue-deferral receipt keeps queue-deferred until the head moves', () => {
  const head = 'c'.repeat(40);
  const body = [
    '<!-- bot-comment:queue-deferral -->',
    '```json',
    JSON.stringify({
      schema: 'jovie-queue-deferral/v1',
      repository: 'JovieInc/Jovie',
      pr: 7,
      head,
      reason: 'queue-pressure',
      source: 'agent-pipeline',
      deferredAt: '2026-10-13T00:00:00Z',
    }),
    '```',
  ].join('\n');
  assert.deepEqual(parseHoldReceipt(body), {
    owner: 'agent-pipeline',
    until: null,
    head,
    reason: 'queue-pressure',
  });
  const labeledAt = '2026-10-13T00:00:00Z';
  const now = Date.parse(labeledAt) + 2 * 24 * 3600 * 1000;
  const comments = [{ body, createdAt: labeledAt }];
  assert.equal(
    evaluateHold({ labeledAt, now, headSha: head, comments }).action,
    'keep'
  );
  assert.equal(
    evaluateHold({ labeledAt, now, headSha: 'd'.repeat(40), comments }).reason,
    'head-changed'
  );
  assert.equal(parseHoldReceipt(body.replace('"pr":7', '"pr":0')), null);
});

test('CLI never replays an ambiguous comment or delete response', () => {
  for (const stage of ['comment', 'unlabel']) {
    const result = runCli(`${stage}-transient`);
    assert.equal(result.status, 75);
    assert.match(result.stderr, /github-quota-deferred/);
    const writes = mutations(result.calls);
    assert.equal(writes.length, stage === 'comment' ? 1 : 2);
    assert.ok(!result.calls.some(args => args[1] === 'rate_limit'));
  }
});

for (const failure of ['comment-response-lost', 'unlabel-quota']) {
  test(`the next sweep reconciles a persisted comment after ${failure}`, async () => {
    const pr = {
      state: 'OPEN',
      headRefOid: HEAD,
      labels: { nodes: [{ name: 'hold' }] },
      timelineItems: {
        nodes: [{ createdAt: LABELED, label: { name: 'hold' } }],
      },
      comments: { pageInfo: { hasPreviousPage: false }, nodes: [] },
    };
    let comments = 0;
    let deletes = 0;
    let first = true;
    const io = {
      listHeld: async () => [1],
      read: async () => pr,
      comment: async (_number, body) => {
        comments += 1;
        pr.comments.nodes.push({
          body,
          createdAt: new Date(T0 + 30 * HOUR).toISOString(),
        });
        if (first && failure === 'comment-response-lost')
          throw new Error('response lost');
      },
      unlabel: async () => {
        deletes += 1;
        if (first)
          throw Object.assign(new Error('quota deferred'), { deferred: true });
      },
    };
    await assert.rejects(
      sweepHolds({ now: T0 + 30 * HOUR, dryRun: false, io })
    );
    first = false;
    const log = console.log;
    console.log = () => {};
    try {
      await sweepHolds({ now: T0 + 31 * HOUR, dryRun: false, io });
    } finally {
      console.log = log;
    }
    assert.equal(comments, 1);
    assert.equal(deletes, failure === 'comment-response-lost' ? 1 : 2);
  });
}

test('a release comment from an earlier application does not dedupe a new hold', async () => {
  const body = releaseComment({ reason: 'ownerless', label: 'hold' });
  const pr = {
    state: 'OPEN',
    headRefOid: HEAD,
    labels: { nodes: [{ name: 'hold' }] },
    timelineItems: {
      nodes: [
        {
          createdAt: new Date(T0 + 31 * HOUR).toISOString(),
          label: { name: 'hold' },
        },
      ],
    },
    comments: {
      pageInfo: { hasPreviousPage: false },
      nodes: [{ body, createdAt: new Date(T0 + 30 * HOUR).toISOString() }],
    },
  };
  const writes = [];
  const log = console.log;
  console.log = () => {};
  try {
    await sweepHolds({
      now: T0 + 60 * HOUR,
      dryRun: false,
      io: {
        listHeld: () => [1],
        read: () => pr,
        comment: (_number, text) => writes.push(['comment', text]),
        unlabel: () => writes.push(['unlabel']),
      },
    });
  } finally {
    console.log = log;
  }
  assert.deepEqual(
    writes.map(row => row[0]),
    ['comment', 'unlabel']
  );
});

for (const evidence of [
  'truncated-recent',
  'missing-page-info',
  'truncated-empty',
]) {
  test(`the sweep keeps a hold when receipt evidence is ${evidence}`, async () => {
    const comments = {
      nodes:
        evidence === 'truncated-empty'
          ? []
          : Array.from({ length: 100 }, (_, i) => ({
              body: 'unrelated comment',
              createdAt: new Date(T0 + (i + 1) * HOUR).toISOString(),
            })),
      ...(evidence === 'missing-page-info'
        ? {}
        : { pageInfo: { hasPreviousPage: true } }),
    };
    const writes = [];
    const result = await sweepHolds({
      now: T0 + 101 * HOUR,
      dryRun: false,
      io: {
        listHeld: () => [1],
        read: () => ({
          state: 'OPEN',
          headRefOid: HEAD,
          labels: { nodes: [{ name: 'hold' }] },
          timelineItems: {
            nodes: [{ createdAt: LABELED, label: { name: 'hold' } }],
          },
          comments,
        }),
        comment: () => writes.push('comment'),
        unlabel: () => writes.push('unlabel'),
      },
    });
    assert.deepEqual(
      result.map(r => [r.action, r.reason]),
      [['keep', 'incomplete-evidence']]
    );
    assert.deepEqual(writes, []);
  });
}

test('an older partial comment page can release when it spans the entire receipt window', async () => {
  const writes = [];
  const result = await sweepHolds({
    now: T0 + 30 * HOUR,
    dryRun: false,
    io: {
      listHeld: () => [1],
      read: () => ({
        state: 'OPEN',
        headRefOid: HEAD,
        labels: { nodes: [{ name: 'hold' }] },
        timelineItems: {
          nodes: [{ createdAt: LABELED, label: { name: 'hold' } }],
        },
        comments: {
          pageInfo: { hasPreviousPage: true },
          nodes: [
            {
              body: 'older unrelated comment',
              createdAt: new Date(T0 - HOUR).toISOString(),
            },
            {
              body: 'recent unrelated comment',
              createdAt: new Date(T0 + HOUR).toISOString(),
            },
          ],
        },
      }),
      comment: () => writes.push('comment'),
      unlabel: () => writes.push('unlabel'),
    },
  });
  assert.deepEqual(
    result.map(r => [r.action, r.reason]),
    [['release', 'ownerless']]
  );
  assert.deepEqual(writes, ['comment', 'unlabel']);
});
