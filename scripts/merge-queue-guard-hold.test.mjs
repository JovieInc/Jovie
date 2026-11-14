import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import {
  guardRunForRemoval,
  guardVerdict,
  guardWindowStart,
  hasGuardHoldComment,
} from './lib/merge-queue-guard-hold.mjs';

// JOV-12617 slice 1: a merge-queue ejection by a deterministic Company guards
// verdict holds the unchanged head out of the queue until the head moves.
const REPO_ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { load } = require('js-yaml');
const workflow = /** @type {any} */ (
  load(
    readFileSync(
      resolve(REPO_ROOT, '.github/workflows/merge-queue-green-enroll.yml'),
      'utf8'
    )
  )
);
const script = workflow.jobs.enroll.steps.find(step => step.with?.script).with
  .script;
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const enroll = new AsyncFunction(
  'github',
  'context',
  'core',
  'process',
  'require',
  script
);

const HEAD = 'a'.repeat(40);
const NEW_HEAD = 'b'.repeat(40);
const BASE = 'c'.repeat(40);
const GROUP = 'd'.repeat(40);
const RUN_ID = 9001;
// A fixed clock: the enroll script's re-enroll dwell reads Date.now().
const NOW = Date.parse('2026-11-14T12:00:00Z');
const ago = minutes => new Date(NOW - minutes * 60_000).toISOString();

function guardRun(overrides = {}) {
  return {
    id: RUN_ID,
    run_attempt: 1,
    name: 'Company Guards',
    path: '.github/workflows/company-guards.yml',
    event: 'merge_group',
    status: 'completed',
    conclusion: 'failure',
    head_branch: `gh-readonly-queue/main/pr-7-${BASE}`,
    head_sha: GROUP,
    created_at: ago(20),
    updated_at: ago(15),
    html_url: `https://github.com/JovieInc/Jovie/actions/runs/${RUN_ID}`,
    ...overrides,
  };
}

const guardJob = (failedStep = 'Run guards', overrides = {}) => ({
  id: 555,
  name: 'Company guards',
  conclusion: 'failure',
  steps: [
    { name: 'Set up job', conclusion: 'success' },
    { name: failedStep, conclusion: 'failure' },
  ],
  ...overrides,
});

/** One in-memory repository the enroll script reads and writes across runs. */
function repository({
  runs = [guardRun()],
  jobs = [guardJob()],
  annotations = [{ message: 'Process completed with exit code 1.' }],
  compare = 'ahead',
  aheadRuns = [],
  failEvidence = false,
  failComment = false,
  failStatus = false,
} = {}) {
  const state = {
    head: HEAD,
    committedAt: ago(60),
    statuses: new Map(),
    comments: [],
    enqueues: [],
    statusWrites: [],
    runReads: [],
    failComment,
    failStatus,
  };
  const evidence = fn => async params => {
    if (failEvidence) throw new Error('Server Error');
    return fn(params);
  };
  const github = {
    rest: {
      pulls: {
        get: async ({ pull_number }) => ({
          data: {
            number: pull_number,
            state: 'open',
            draft: false,
            base: { ref: 'main' },
            head: { sha: state.head, repo: { full_name: 'JovieInc/Jovie' } },
            labels: [],
          },
        }),
        listFiles: Symbol('pulls.listFiles'),
      },
      git: {
        getRef: async () => ({ data: { object: { sha: BASE } } }),
      },
      repos: {
        listCommitStatusesForRef: Symbol('statuses'),
        createCommitStatus: async ({ owner, repo, sha, ...status }) => {
          if (state.failStatus) throw new Error('status write failed');
          state.statusWrites.push({ sha, ...status });
          const rows = state.statuses.get(sha) ?? [];
          rows.unshift({
            ...status,
            creator: { type: 'Bot', login: 'jovie-bot[bot]' },
          });
          state.statuses.set(sha, rows);
          return { data: {} };
        },
        compareCommitsWithBasehead: evidence(async () => ({
          data: { status: compare },
        })),
      },
      actions: {
        listWorkflowRuns: evidence(async params => {
          state.runReads.push(params);
          return {
            data: {
              workflow_runs: params.head_sha ? aheadRuns : runs,
            },
          };
        }),
        listJobsForWorkflowRun: evidence(async () => ({ data: { jobs } })),
      },
      checks: {
        listAnnotations: evidence(async () => ({ data: annotations })),
      },
      issues: {
        listComments: Symbol('comments'),
        createComment: async ({ body }) => {
          if (state.failComment) throw new Error('comment failed');
          state.comments.push({ body, user: { type: 'Bot' } });
          return { data: {} };
        },
      },
    },
    paginate: async (endpoint, params) => {
      if (endpoint === github.rest.repos.listCommitStatusesForRef)
        return [...(state.statuses.get(params.ref) ?? [])];
      if (endpoint === github.rest.issues.listComments)
        return [...state.comments];
      if (endpoint === github.rest.pulls.listFiles)
        return [{ filename: 'apps/web/page.tsx' }];
      throw new Error(`unexpected paginate ${String(endpoint)}`);
    },
    graphql: async (query, params) => {
      if (query.includes('enqueuePullRequest')) {
        state.enqueues.push(params.oid);
        return { enqueuePullRequest: { mergeQueueEntry: { position: 1 } } };
      }
      if (query.includes('mergeQueue(branch')) {
        return { repository: { mergeQueue: { entries: { nodes: [] } } } };
      }
      const removal = {
        createdAt: ago(10),
        reason: 'FAILED_CHECKS',
        actor: { __typename: 'Bot', login: 'github-merge-queue[bot]' },
      };
      return {
        repository: {
          pullRequest: {
            id: 'PR_7',
            number: params.number,
            state: 'OPEN',
            isDraft: false,
            baseRefName: 'main',
            headRefOid: state.head,
            mergeStateStatus: 'CLEAN',
            isInMergeQueue: false,
            isCrossRepository: false,
            autoMergeRequest: null,
            labels: { pageInfo: { hasNextPage: false }, nodes: [] },
            commits: {
              nodes: [{ commit: { committedDate: state.committedAt } }],
            },
            timelineItems: { nodes: [removal] },
            breakerEvents: {
              nodes: [{ __typename: 'RemovedFromMergeQueueEvent', ...removal }],
            },
            releases: { nodes: [] },
          },
        },
      };
    },
  };
  const sweep = async () => {
    const notices = [];
    await enroll(
      github,
      {
        repo: { owner: 'JovieInc', repo: 'Jovie' },
        eventName: 'workflow_dispatch',
        payload: {},
      },
      {
        info() {},
        notice: message => notices.push(message),
        warning() {},
      },
      {
        env: {
          DRY_RUN: 'false',
          DISPATCH_PR_NUMBER: '7',
          GITHUB_WORKSPACE: REPO_ROOT,
          MERGE_STATE_RETRY_MS: '0',
        },
      },
      require
    );
    return notices;
  };
  return { state, sweep };
}

describe('merge-queue enrollment hold after a deterministic guard ejection', () => {
  beforeEach(() => mock.timers.enable({ apis: ['Date'], now: NOW }));
  afterEach(() => mock.timers.reset());

  it('(a) holds the same head after a Company guards verdict ejected it', async () => {
    const repo = repository();
    await repo.sweep();
    await repo.sweep();
    assert.deepEqual(repo.state.enqueues, []);
    assert.deepEqual(repo.state.statusWrites, [
      {
        sha: HEAD,
        context: 'jovie-queue-failure-hold/v1',
        state: 'success',
        description: `class=deterministic-source;n=1;run=${RUN_ID};try=1`,
        target_url: `https://github.com/JovieInc/Jovie/actions/runs/${RUN_ID}`,
      },
    ]);
    // The ratchet step holds the same way as the guard suite.
    const ratchet = repository({ jobs: [guardJob('Size budgets never rise')] });
    await ratchet.sweep();
    assert.deepEqual(ratchet.state.enqueues, []);
    assert.equal(ratchet.state.statusWrites.length, 1);
  });

  it('(b) a new head re-enrolls after the hold', async () => {
    const repo = repository();
    await repo.sweep();
    assert.deepEqual(repo.state.enqueues, []);
    repo.state.head = NEW_HEAD;
    repo.state.committedAt = ago(5);
    await repo.sweep();
    assert.deepEqual(repo.state.enqueues, [NEW_HEAD]);
    assert.equal(repo.state.statuses.get(NEW_HEAD), undefined);
  });

  it('(c) runner, network, pin drift, exit 75, cancelled and unknown failures do not hold', async () => {
    /** @type {Array<[string, Parameters<typeof repository>[0]]>} */
    const cases = [
      ['cancelled', { runs: [guardRun({ conclusion: 'cancelled' })] }],
      ['timed out', { runs: [guardRun({ conclusion: 'timed_out' })] }],
      ['runner setup', { jobs: [guardJob('Set up job')] }],
      ['network fetch', { jobs: [guardJob('Fetch pinned guard suite')] }],
      ['pin drift API', { jobs: [guardJob('Pin drift')] }],
      ['runner lost', { jobs: [guardJob('Run guards', { steps: [] })] }],
      [
        'exit 75',
        { annotations: [{ message: 'Process completed with exit code 75.' }] },
      ],
      [
        'runner shutdown',
        {
          annotations: [
            { message: 'The runner has received a shutdown signal.' },
          ],
        },
      ],
      ['unreadable evidence', { failEvidence: true }],
      ['no guard run', { runs: [] }],
      ['guards passed', { runs: [guardRun({ conclusion: 'success' })] }],
      [
        'ahead group unproven',
        {
          compare: 'diverged',
          aheadRuns: [guardRun({ conclusion: 'failure' })],
        },
      ],
      [
        'earlier head',
        { runs: [guardRun({ created_at: ago(90), updated_at: ago(89) })] },
      ],
    ];
    for (const [name, options] of cases) {
      const repo = repository(options);
      await repo.sweep();
      assert.deepEqual(repo.state.enqueues, [HEAD], name);
      assert.deepEqual(repo.state.statusWrites, [], name);
      assert.deepEqual(repo.state.comments, [], name);
    }
    // A group behind an ahead entry whose guards passed is this head's own.
    const proven = repository({
      compare: 'diverged',
      aheadRuns: [guardRun({ conclusion: 'success', head_sha: BASE })],
    });
    await proven.sweep();
    assert.deepEqual(proven.state.enqueues, []);
  });

  it('(d) posts exactly one comment per head, naming the failing check', async () => {
    const repo = repository({ failStatus: true });
    await repo.sweep();
    // The receipt write failed, so the next sweep looks again: still held,
    // and the comment already on the PR is not repeated.
    assert.deepEqual(repo.state.enqueues, []);
    repo.state.failStatus = false;
    await repo.sweep();
    await repo.sweep();
    assert.deepEqual(repo.state.enqueues, []);
    assert.equal(repo.state.comments.length, 1);
    assert.equal(repo.state.statusWrites.length, 1);
    const [comment] = repo.state.comments;
    assert.match(comment.body, /`Company guards` failed at `Run guards`/);
    assert.match(comment.body, new RegExp(`actions/runs/${RUN_ID}`));
    assert.ok(hasGuardHoldComment(repo.state.comments, HEAD));
    assert.ok(!hasGuardHoldComment(repo.state.comments, NEW_HEAD));
    // A failed comment writes no receipt, so the comment is never skipped.
    const noisy = repository({ failComment: true });
    await noisy.sweep();
    assert.deepEqual(noisy.state.statusWrites, []);
    assert.deepEqual(noisy.state.enqueues, []);
    noisy.state.failComment = false;
    await noisy.sweep();
    assert.equal(noisy.state.comments.length, 1);
    assert.equal(noisy.state.statusWrites.length, 1);
    // Only a bot comment with this head's marker counts as already posted.
    assert.equal(
      hasGuardHoldComment(
        [{ body: comment.body, user: { type: 'User' } }],
        HEAD
      ),
      false
    );
  });

  it('reads only this head window and fails closed on malformed evidence', () => {
    assert.equal(
      guardWindowStart({
        headCommittedAt: '2026-11-14T10:00:00Z',
        removals: ['2026-11-14T11:00:00Z', '2026-11-14T12:00:00Z'],
        removedAt: '2026-11-14T12:00:00Z',
      }),
      '2026-11-14T11:00:00Z'
    );
    assert.equal(
      guardRunForRemoval({
        runs: [
          guardRun({ head_branch: `gh-readonly-queue/main/pr-8-${BASE}` }),
        ],
        prNumber: 7,
        since: ago(60),
        removedAt: ago(10),
      }),
      null
    );
    assert.deepEqual(
      guardVerdict({ run: guardRun(), jobs: undefined, annotations: [] }),
      {
        deterministic: false,
        reason: 'jobs-unavailable',
      }
    );
    assert.deepEqual(
      guardVerdict({ run: guardRun(), jobs: [guardJob()], annotations: null }),
      { deterministic: false, reason: 'annotations-unavailable' }
    );
  });
});
