import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import {
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

test('the sweep comments then unlabels only released holds and dry runs never write', () => {
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
      comments: { nodes: [] },
    },
    2: {
      state: 'OPEN',
      headRefOid: HEAD,
      labels: { nodes: [{ name: HOLD_LABEL }] },
      timelineItems: {
        nodes: [{ createdAt: LABELED, label: { name: HOLD_LABEL } }],
      },
      comments: { nodes: [comment({ owner: 'gem', head: HEAD })] },
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
    const dry = sweepHolds({ now: T0 + 30 * HOUR, dryRun: true, io });
    assert.deepEqual(
      dry.map(r => [r.number, r.action]),
      [
        [1, 'release'],
        [2, 'keep'],
      ]
    );
    assert.deepEqual(writes, []);
    sweepHolds({ now: T0 + 30 * HOUR, dryRun: false, io });
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

test('every stop label is held to the contract, each on its own labeled time', () => {
  // #21014 / #20953: `gated` applied 2026-10-08 with no owner or expiry sat
  // outside the contract and blocked admission indefinitely.
  const pr = {
    state: 'OPEN',
    headRefOid: HEAD,
    labels: {
      nodes: [{ name: 'gated' }, { name: 'tim:hold' }, { name: 'ui' }],
    },
    timelineItems: {
      nodes: [
        { createdAt: LABELED, label: { name: 'gated' } },
        { createdAt: '2026-10-09T10:00:00Z', label: { name: 'tim:hold' } },
      ],
    },
    comments: { nodes: [] },
  };
  const writes = [];
  const log = console.log;
  console.log = () => {};
  try {
    const results = sweepHolds({
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
        ['tim:hold', 'keep', 'ownerless-grace'],
      ]
    );
  } finally {
    console.log = log;
  }
  assert.deepEqual(writes[1], ['unlabel', 9, 'gated']);
  assert.match(writes[0][2], /removed `gated`/);
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
