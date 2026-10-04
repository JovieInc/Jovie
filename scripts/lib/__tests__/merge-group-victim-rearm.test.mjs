import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import {
  applyVictimRearms,
  heldRevisionFromReceipt,
  implicatedPathsFromAnnotations,
  planVictimRearms,
  REARM_CAP,
  REARM_CONTEXT,
  trustedRearmRecords,
} from '../../merge-group-victim-rearm.mjs';

const { load } = createRequire(import.meta.url)('js-yaml');
const sha = 'a'.repeat(40);
const other = 'b'.repeat(40);

function candidate(overrides = {}) {
  return {
    prNumber: 10,
    state: 'OPEN',
    isDraft: false,
    baseRefName: 'main',
    isCrossRepository: false,
    headSha: sha,
    mergeStateStatus: 'CLEAN',
    inQueue: false,
    autoMerge: false,
    labels: [],
    files: ['apps/web/README.md'],
    statuses: [],
    ...overrides,
  };
}

function status(n, head = sha, runId = 100) {
  return {
    context: REARM_CONTEXT,
    state: 'success',
    creator: { login: 'jovie-bot[bot]', type: 'Bot' },
    description: `n=${n};sha=${head};run=${runId}`,
  };
}

test('annotations keep budget files and ignore workflow paths', () => {
  assert.deepEqual(
    implicatedPathsFromAnnotations([
      {
        path: '.github/workflows/ci.yml',
        message: 'CLAUDE.md: 6081 bytes exceeds 6000',
      },
      { path: './apps/web/story.tsx', message: 'TS2352' },
    ]),
    ['CLAUDE.md', 'apps/web/story.tsx']
  );
});

test('another PR in the group is rearmed once, then capped, and the culprit is not', () => {
  const group = [
    candidate({
      prNumber: 10,
      files: ['docs/guide.md'],
    }),
    candidate({
      prNumber: 11,
      headSha: other,
      files: ['apps/web/story.tsx'],
    }),
  ];
  const first = planVictimRearms({
    runId: 501,
    implicatedPaths: ['apps/web/story.tsx'],
    candidates: group,
  });
  assert.deepEqual(
    first.map(item => [
      item.prNumber,
      item.action,
      item.classification,
      item.n,
      item.reason,
    ]),
    [
      [10, 'rearm', 'another-pr', 1, undefined],
      [11, 'skip', undefined, undefined, 'own-failure'],
    ]
  );
  const capped = planVictimRearms({
    runId: 900,
    implicatedPaths: ['apps/web/story.tsx'],
    candidates: [
      candidate({
        statuses: [status(1, sha, 501), status(REARM_CAP, sha, 502)],
      }),
    ],
    cap: REARM_CAP,
  });
  assert.equal(capped[0].reason, 'cap');
});

test('the same CI run does not spend a second rearm', () => {
  const [decision] = planVictimRearms({
    runId: 501,
    implicatedPaths: ['apps/web/story.tsx'],
    candidates: [
      candidate({
        files: ['docs/guide.md'],
        statuses: [status(1, sha, 501)],
      }),
      candidate({
        prNumber: 11,
        headSha: other,
        files: ['apps/web/story.tsx'],
      }),
    ],
  });
  assert.equal(decision.increment, false);
  assert.equal(decision.n, 1);
  assert.equal(decision.action, 'rearm');
});

test('a green head whose diff misses the failure is a base-branch victim', () => {
  const [decision] = planVictimRearms({
    runId: 7,
    implicatedPaths: ['CLAUDE.md'],
    candidates: [candidate({ files: ['apps/web/page.tsx'] })],
  });
  assert.equal(decision.classification, 'base-branch');
  assert.equal(decision.action, 'rearm');
});

test('a red head, an armed PR, and a poison label are not rearmed', () => {
  const decisions = planVictimRearms({
    runId: 7,
    implicatedPaths: ['CLAUDE.md'],
    candidates: [
      candidate({ mergeStateStatus: 'BLOCKED' }),
      candidate({ prNumber: 12, headSha: other, inQueue: true, files: [] }),
      candidate({
        prNumber: 13,
        headSha: 'c'.repeat(40),
        autoMerge: true,
        files: [],
      }),
      candidate({
        prNumber: 14,
        headSha: 'd'.repeat(40),
        labels: ['queue-poison'],
        files: [],
      }),
    ],
  });
  assert.deepEqual(
    decisions.map(item => item.reason),
    ['head-not-green', 'already-armed', 'already-armed', 'blocking-label']
  );
});

test('untrusted or foreign-sha receipts do not count toward the cap', () => {
  assert.deepEqual(
    trustedRearmRecords([
      { ...status(2), creator: { login: 'someone', type: 'User' } },
      status(1, other, 3),
    ]).map(record => record.sha),
    [other]
  );
});

test('apply writes the receipt before enabling and skips a moved head', async () => {
  const writes = [];
  const enables = [];
  const applied = await applyVictimRearms(
    [
      {
        action: 'rearm',
        prNumber: 10,
        headSha: sha,
        classification: 'base-branch',
        n: 1,
        increment: true,
        runId: 7,
      },
      {
        action: 'rearm',
        prNumber: 11,
        headSha: other,
        classification: 'another-pr',
        n: 1,
        increment: true,
        runId: 7,
      },
    ],
    {
      targetUrl: 'https://github.com/JovieInc/Jovie/actions/runs/7',
      async readPullRequest(prNumber) {
        return prNumber === 10
          ? {
              headSha: sha,
              mergeStateStatus: 'CLEAN',
              inQueue: false,
              autoMerge: false,
            }
          : {
              headSha: 'e'.repeat(40),
              mergeStateStatus: 'CLEAN',
              inQueue: false,
              autoMerge: false,
            };
      },
      async writeStatus(receipt) {
        writes.push(receipt);
      },
      async enable(prNumber) {
        enables.push(prNumber);
      },
    }
  );
  assert.deepEqual(enables, [10]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].description, `n=1;sha=${sha};run=7`);
  assert.equal(applied.length, 1);
});

test('the rearm job is a later step of the existing enroll workflow', () => {
  const workflow = load(
    readFileSync('.github/workflows/merge-queue-green-enroll.yml', 'utf8')
  );
  const job = workflow.jobs['rearm-green-victims'];
  assert.deepEqual(job.needs, ['hold-failed-revision']);
  assert.match(job.if, /needs\.hold-failed-revision\.result == 'success'/);
  assert.match(
    job.steps.at(-1).run,
    /node scripts\/merge-group-victim-rearm\.mjs --event-path "\$GITHUB_EVENT_PATH"/
  );
  assert.match(
    job.steps.at(-1).env.FAILURE_HOLD_RECEIPT,
    /needs\.hold-failed-revision\.outputs\.failure_receipt/
  );
  const enroll = workflow.jobs.enroll.steps.find(step => step.with?.script).with
    .script;
  assert.equal(enroll.includes('merge-group-victim-rearm'), false);
});

test('a revision the failure hold blocked is never rearmed, even as a base-branch victim (JOV-7708)', () => {
  // #20354: no PR owned the failed paths, so the culprit classified as a
  // base-branch victim and was rearmed on the same head it kept failing.
  const receipt = JSON.stringify({
    schema: 'jovie-merge-group-failure-hold/v1',
    repository: 'JovieInc/Jovie',
    prNumber: 10,
    sourceHeadSha: sha,
    retryDisposition: 'blocked-until-new-source-head',
  });
  const heldRevision = heldRevisionFromReceipt(receipt, 'JovieInc/Jovie');
  assert.deepEqual(heldRevision, { prNumber: 10, headSha: sha });
  const plan = planVictimRearms({
    runId: 300,
    implicatedPaths: ['scripts/unowned.mjs'],
    candidates: [candidate(), candidate({ prNumber: 11, headSha: other })],
    heldRevision,
  });
  assert.deepEqual(plan[0], {
    action: 'skip',
    prNumber: 10,
    reason: 'revision-held',
  });
  assert.equal(plan[1].action, 'rearm');
  // A new head on the same PR is a new revision and may be rearmed.
  const moved = planVictimRearms({
    runId: 301,
    implicatedPaths: ['scripts/unowned.mjs'],
    candidates: [candidate({ headSha: other })],
    heldRevision,
  });
  assert.equal(moved[0].action, 'rearm');
});

test('only a trusted blocked receipt for this repository names a held revision', () => {
  const base = {
    schema: 'jovie-merge-group-failure-hold/v1',
    repository: 'JovieInc/Jovie',
    prNumber: 10,
    sourceHeadSha: sha,
    retryDisposition: 'blocked-until-new-source-head',
  };
  for (const raw of [
    '',
    undefined,
    'not json',
    JSON.stringify({ ...base, retryDisposition: 'one-queue-authority-retry' }),
    JSON.stringify({ ...base, retryDisposition: 'requeue-after-base-moves' }),
    JSON.stringify({ ...base, repository: 'someone/else' }),
    JSON.stringify({ ...base, schema: 'other/v1' }),
    JSON.stringify({ ...base, sourceHeadSha: 'abc' }),
  ]) {
    assert.equal(heldRevisionFromReceipt(raw, 'JovieInc/Jovie'), null);
  }
});
