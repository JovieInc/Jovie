import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MemoryLedgerStore } from '../../../packages/api-client/store.ts';
import {
  applyVictimRearms,
  enqueueVictim,
  planVictimRearms,
} from '../../merge-group-victim-rearm.mjs';
import {
  artifactJson,
  githubIo,
  reconcileQueueRetry,
  reconcileVictimRearms,
} from '../promotion-github.mjs';

const now = 1800000000000;
const repo = 'JovieInc/Jovie';
const head = 'a'.repeat(40);
const response = value =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
  });
function network(handler) {
  const calls = [];
  const io = githubIo({
    repo,
    token: 'offline-test-token',
    now: () => now,
    clientOptions: { store: new MemoryLedgerStore(), log: () => {} },
    fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      return handler(new URL(url), options);
    },
  });
  return { io, calls };
}
test('paginated REST reads reject incomplete counts rather than returning partial evidence', async () => {
  const { io } = network(() =>
    response({ total_count: 2, workflow_runs: [{ id: 1 }] })
  );
  await assert.rejects(io.pages('actions/runs', 'workflow_runs'), /truncated/);
});
test('queue reads all GraphQL pages and versions their complete ordered contents', async () => {
  const { io, calls } = network((url, options) => {
    const cursor = JSON.parse(options.body).variables.cursor;
    return response({
      data: {
        repository: {
          mergeQueue: {
            entries: {
              nodes: [{ id: cursor ? 'second' : 'first' }],
              pageInfo: {
                hasNextPage: !cursor,
                endCursor: cursor ? null : 'next',
              },
            },
          },
        },
      },
    });
  });
  const queue = await io.queue();
  assert.equal(queue.complete, true);
  assert.equal(queue.entries.length, 2);
  assert.equal(queue.version.length, 40);
  assert.equal(calls.length, 2);
});
test('head ledger reads current attempts and classifies before any classifier label exists', async () => {
  const { io, calls } = network(url => {
    if (url.pathname.endsWith('/actions/runs'))
      return response({
        total_count: 1,
        workflow_runs: [
          {
            id: 9,
            run_attempt: 2,
            head_branch: `gh-readonly-queue/main/pr-7-${head}`,
            conclusion: 'failure',
            updated_at: new Date(now).toISOString(),
          },
        ],
      });
    if (url.pathname.endsWith('/attempts/2/jobs'))
      return response({
        total_count: 1,
        jobs: [{ name: 'Build', conclusion: 'timed_out' }],
      });
    if (url.pathname.endsWith('/statuses')) return response([]);
    if (url.pathname.endsWith('/artifacts'))
      return response({ total_count: 0, artifacts: [] });
    assert.fail(`unexpected request: ${url.pathname}`);
  });
  const evidence = await io.readRetryEvidence({ pr: 7, head });
  assert.equal(evidence.complete, true);
  assert.equal(evidence.receipts[0].class, 'infra');
  assert.equal(evidence.receipts[0].attempt, 2);
  assert.equal(
    new URL(calls[0].url).searchParams.get('branch'),
    `gh-readonly-queue/main/pr-7-${head}`
  );
});
test('circuit opens for the same failed job on three distinct PRs, and green main closes older failures', async () => {
  for (const fixed of [false, true]) {
    const { io } = network(url => {
      if (url.pathname.endsWith('/actions/runs'))
        return response({
          total_count: 4,
          workflow_runs: [
            {
              id: 20,
              name: 'CI',
              event: 'push',
              head_branch: 'main',
              conclusion: 'success',
              updated_at: new Date(now - (fixed ? 100 : 2000)).toISOString(),
            },
            ...[1, 2, 3].map(id => ({
              id,
              event: 'merge_group',
              head_branch: `gh-readonly-queue/main/pr-${id}-${head}`,
              conclusion: 'failure',
              updated_at: new Date(now - 1000).toISOString(),
            })),
          ],
        });
      if (url.pathname.endsWith('/jobs'))
        return response({
          total_count: 1,
          jobs: [{ name: 'Build', conclusion: 'failure' }],
        });
      assert.fail(url.pathname);
    });
    assert.equal((await io.health()).circuitOpen, !fixed);
  }
});
test('read outages become a skipped reconciliation decision, never an exception or free retry', async () => {
  const result = await reconcileQueueRetry(
    { pr: 1, head },
    {
      readRetryEvidence: async () => {
        throw new Error('offline');
      },
      health: async () => ({ complete: false }),
    }
  );
  assert.equal(result.allow, false);
  assert.equal(result.reason, 'head-unchanged-non-infra');
});
test('malformed artifact members cannot provide evidence', () => {
  assert.throws(
    () => artifactJson(Buffer.from('not a ZIP'), 'evidence.json'),
    /absent/
  );
});

const victim = (prNumber, files = ['docs/guide.md']) => ({
  prNumber,
  headSha: String(prNumber).repeat(40),
  state: 'OPEN',
  baseRefName: 'main',
  mergeStateStatus: 'CLEAN',
  labels: [],
  files,
  statuses: [],
});
const infraEvidence = head => ({
  complete: true,
  retries: 0,
  receipts: [
    { schema: 'ejection/v1', head, class: 'infra', run: 6, attempt: 2 },
  ],
});

test('victim reconciliation loads evidence before planning, reserves before enqueue and leaves changed heads alone', async () => {
  const candidates = [
    victim(1),
    victim(2),
    victim(3, ['other.mjs']),
    victim(4),
  ];
  const calls = [];
  const logs = [];
  const net = {
    readRetryEvidence: async ({ pr, head, labels }) => {
      calls.push(`evidence:${pr}`);
      assert.deepEqual(labels, []);
      return pr === 1 || pr === 4
        ? infraEvidence(head)
        : { complete: true, receipts: [], retries: 0 };
    },
    health: async () => ({ complete: true, circuitOpen: false }),
    reserveRetry: async reservation => {
      await Promise.resolve();
      calls.push(reservation);
    },
  };
  await reconcileVictimRearms(candidates, net, {
    plan() {
      calls.push('plan');
      return planVictimRearms({
        runId: 7,
        implicatedPaths: ['other.mjs'],
        candidates,
        now,
      });
    },
    apply: applyVictimRearms,
    targetUrl: 'https://github.com/JovieInc/Jovie/actions/runs/7',
    readPullRequest(prNumber) {
      calls.push(`read:${prNumber}`);
      return {
        nodeId: `PR_${prNumber}`,
        headSha: prNumber === 4 ? head : candidates[prNumber - 1].headSha,
        mergeStateStatus: 'CLEAN',
      };
    },
    enqueue: enqueueVictim,
    exec(args) {
      const id = args.find(arg => arg.startsWith('id=')).slice(3);
      const pr = Number(id.slice(3));
      assert.ok(args.includes(`oid=${candidates[pr - 1].headSha}`));
      calls.push(`enqueue:${pr}`);
      return {
        data: { enqueuePullRequest: { mergeQueueEntry: { position: pr } } },
      };
    },
    writeStatus(status) {
      calls.push(`status:${status.sha}`);
      assert.equal(
        status.targetUrl,
        'https://github.com/JovieInc/Jovie/actions/runs/7'
      );
      assert.equal(
        status.description,
        `n=1;sha=${status.sha};run=7;why=another-pr`
      );
    },
    log: line => logs.push(line),
  });
  assert.deepEqual(calls, [
    'evidence:1',
    'evidence:2',
    'evidence:3',
    'evidence:4',
    'plan',
    'read:1',
    { head: candidates[0].headSha, run: 6, attempt: 2 },
    'enqueue:1',
    `status:${candidates[0].headSha}`,
    'read:2',
    'enqueue:2',
    `status:${candidates[1].headSha}`,
    'read:4',
  ]);
  assert.deepEqual(logs, [
    'enqueued #1 at position 1',
    'enqueued #2 at position 2',
    'rearm #1 class=another-pr reason=infra-retry n=1 increment=true run=7',
    'rearm #2 class=another-pr reason=cascade-rearm n=1 increment=true run=7',
    'skip #3 own-failure',
    'rearm #4 class=another-pr reason=infra-retry n=1 increment=true run=7',
    'applied=2',
  ]);
});

test('a rejected victim retry reservation prevents enqueue and success receipts', async () => {
  const candidates = [victim(1)];
  const failure = new Error('reservation denied');
  const effects = [];
  await assert.rejects(
    reconcileVictimRearms(
      candidates,
      {
        readRetryEvidence: async ({ head }) => infraEvidence(head),
        health: async () => ({ complete: true, circuitOpen: false }),
        reserveRetry: async () => {
          throw failure;
        },
      },
      {
        plan: () =>
          planVictimRearms({
            runId: 7,
            implicatedPaths: ['other.mjs'],
            candidates,
            now,
          }),
        apply: applyVictimRearms,
        readPullRequest: () => ({ ...candidates[0], nodeId: 'PR_1' }),
        enqueue: () => effects.push('enqueue'),
        writeStatus: () => effects.push('status'),
        log: () => effects.push('log'),
      }
    ),
    error => error === failure
  );
  assert.deepEqual(effects, []);
});
