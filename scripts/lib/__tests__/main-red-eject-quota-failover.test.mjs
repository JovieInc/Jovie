// Regression for run 41227299023 (2026-10-31): the stuck-head path crashed
// with MergeQueueBackendError 'verifying the native queue mutation actor
// failed' because the backend spawned `gh` with the exhausted Jovie Bot
// installation token while the gh() failover wrapper only covered this
// script's own calls. The failover must reach the actor-verify call, and the
// mutation-actor safety check must stay meaningful when the fallback identity
// is not a trusted queue writer (defer honestly, never bypass).
//
// The fake lives at the process boundary (spawnSync), not at the backend
// module seam: a module-level mock of createGhRunner cannot intercept the
// backend's own default-parameter binding, so a module mock would silently
// exercise a real `gh` spawn on the primary attempt. Faking spawnSync drives
// the REAL createGhRunner, the REAL dequeuePullRequest, and the REAL
// mutation-actor safety check on both the primary attempt and the failover
// retry — credential-keyed by the env each runner was built with.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ghCalls = [];
const backendCalls = [];
const RATE_LIMIT_STDERR =
  'gh: API rate limit already exceeded for installation ID 112037986.';
const rateLimited = { code: 1, stdout: '', stderr: RATE_LIMIT_STDERR };
/** True reproduces the exhaustion window; false exercises the healthy path. */
let primaryExhausted = true;
/** Independent: the backend's own runners vs the gh() wrapper bucket. */
let backendPrimaryExhausted = true;
/** Identity the queried credential authenticates as. */
let fallbackViewerLogin = 'jovie-bot[bot]';
/**
 * Fake `gh` result: {code, stdout, stderr} like runGh returns.
 * @typedef {{code: number, stdout: string, stderr: string}} GhResult
 */
/** Router for backend (`gh` spawned) calls, keyed by argv text. */
/** @type {(line: string) => GhResult} */
let backendRoute = () => rateLimited;
/** Router for gh() wrapper calls made with the fallback credential. */
/** @type {(line: string) => GhResult | Promise<GhResult>} */
let ghRoutes = () => {
  throw new Error('unrouted gh call');
};

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    spawnSync: vi.fn((command, args, options = {}) => {
      const env = options?.env ?? process.env;
      const credential = env.GH_TOKEN ?? process.env.GH_TOKEN;
      const line = Array.isArray(args) ? args.join(' ') : String(args ?? '');
      backendCalls.push({ credential, line });
      /** @type {GhResult} */
      const result =
        credential === 'installation-token' && backendPrimaryExhausted
          ? rateLimited
          : credential === 'installation-token' ||
              credential === 'fallback-token'
            ? backendRoute(line)
            : { code: 1, stdout: '', stderr: 'unknown credential' };
      return {
        status: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }),
  };
});

vi.mock('../../../packages/api-client/gh.ts', () => ({
  runGh: vi.fn(async (args, options = {}) => {
    const credential = options?.env?.GH_TOKEN ?? process.env.GH_TOKEN;
    const line = args.join(' ');
    ghCalls.push({ credential, line });
    if (credential === 'installation-token' && primaryExhausted)
      return rateLimited;
    return ghRoutes(line);
  }),
}));

const { stuckHead } = await import('../../main-red-eject.mjs');
const { marker } = await import('../main-red-eject.mjs');

const ORIGINAL_ENV = {
  GH_TOKEN: process.env.GH_TOKEN,
  GH_FALLBACK_TOKEN: process.env.GH_FALLBACK_TOKEN,
  GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
};
const restoreEnv = () => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

const NOW = Date.parse('2026-10-31T18:06:00Z');
const HEAD_PR = 24000;
const PR_ID = 'PR_kwDO_native_pr';
const ENTRY_ID = 'MQE_kwDO_native_entry';
const HEAD = 'c'.repeat(40);

const prState = overrides => ({
  id: PR_ID,
  number: HEAD_PR,
  state: 'OPEN',
  isDraft: false,
  baseRefName: 'main',
  headRefOid: HEAD,
  labels: { nodes: [] },
  isInMergeQueue: false,
  mergeQueueEntry: null,
  autoMergeRequest: null,
  ...overrides,
});
const queuedState = prState({
  isInMergeQueue: true,
  mergeQueueEntry: {
    id: ENTRY_ID,
    state: 'UNMERGEABLE',
    position: 1,
    enqueuedAt: '2026-10-31T17:56:00Z',
  },
});
const okJson = value => ({
  code: 0,
  stdout: JSON.stringify(value),
  stderr: '',
});
const wireHappyBackend = () => {
  const states = [queuedState, prState({})];
  backendRoute = line => {
    if (line.includes('MergeQueueNativeMutationActor'))
      return okJson({ data: { viewer: { login: fallbackViewerLogin } } });
    if (line.includes('MergeQueuePullRequestState'))
      return okJson({
        data: { repository: { pullRequest: states.shift() } },
      });
    if (line.includes('DequeuePullRequest')) return okJson({ data: {} });
    return { code: 1, stdout: '', stderr: `unrouted backend call: ${line}` };
  };
};
const wireHappyGh = () => {
  ghRoutes = line => {
    if (line.includes('mergeQueue(branch:'))
      return okJson({
        data: {
          repository: {
            mergeQueue: {
              entries: {
                nodes: [
                  {
                    position: 1,
                    state: 'UNMERGEABLE',
                    enqueuedAt: '2026-10-31T17:56:00Z',
                    pullRequest: {
                      number: HEAD_PR,
                      labels: { nodes: [] },
                    },
                  },
                ],
              },
            },
          },
        },
      });
    if (line.includes(`/issues/${HEAD_PR}/comments`))
      return okJson([
        {
          body: marker({
            unmergeableSince: new Date(NOW - 6 * 60_000).toISOString(),
          }),
        },
      ]);
    if (line.includes('labels=main-health-incident')) return okJson([]);
    if (line.includes('-X POST') && line.includes('/issues?'))
      throw new Error('unexpected issue-create route shape');
    if (line.includes('/issues -f') || line.includes('issues -f title='))
      return okJson({ number: 555 });
    if (line.includes('-X POST')) return okJson({});
    if (line.includes('workflow run')) return okJson('');
    return { code: 1, stdout: '', stderr: `unrouted gh call: ${line}` };
  };
};
// Every gh() POST is attempted on the primary credential first, so an
// exhausted primary double-records each write (failed try + fallback retry);
// dedupe by argv text so the count reflects distinct writes, not attempts.
const writes = () => [
  ...new Set(
    ghCalls
      .filter(
        c => c.line.includes('-X POST') || c.line.includes('workflow run')
      )
      .map(c => c.line)
  ),
];

beforeEach(() => {
  ghCalls.length = 0;
  backendCalls.length = 0;
  primaryExhausted = true;
  backendPrimaryExhausted = true;
  fallbackViewerLogin = 'jovie-bot[bot]';
  process.env.GH_TOKEN = 'installation-token';
  process.env.GH_FALLBACK_TOKEN = 'fallback-token';
  process.env.GITHUB_REPOSITORY = 'JovieInc/Jovie';
  wireHappyBackend();
  wireHappyGh();
});

afterEach(restoreEnv);

describe('stuck-head dequeue under installation quota exhaustion (run 41227299023)', () => {
  it('simulates installation-403 on the actor-verify call and completes the dequeue on the fallback token when its identity is a trusted mutation actor', async () => {
    const out = await stuckHead({ doApply: true, now: NOW });
    expect(out).toMatchObject({ dequeued: true, stuck: true });
    // First backend call was the actor verification, and it hit the
    // installation-403.
    expect(backendCalls[0]).toMatchObject({ credential: 'installation-token' });
    expect(backendCalls[0].line).toContain('MergeQueueNativeMutationActor');
    // The retry ran the whole backend call (actor verify + mutation) on the
    // fallback credential.
    const mutation = backendCalls.find(c =>
      c.line.includes('DequeuePullRequest')
    );
    expect(mutation?.credential).toBe('fallback-token');
    const retries = backendCalls.filter(c =>
      c.line.includes('MergeQueueNativeMutationActor')
    );
    expect(retries.at(-1)?.credential).toBe('fallback-token');
    // Post-dequeue duties still ran (labels, swarm, re-enroll, incident).
    expect(writes()).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`/issues/${HEAD_PR}/labels`),
        expect.stringContaining('pr-remediation-swarm.yml'),
        expect.stringContaining('merge-queue-green-enroll.yml'),
      ])
    );
  });

  it('defers with a visible status — no labels, no dispatches — when the fallback identity is refused by the mutation-actor check', async () => {
    fallbackViewerLogin = 'github-actions[bot]';
    const out = await stuckHead({ doApply: true, now: NOW });
    expect(out).toMatchObject({ dequeued: false, deferred: true, stuck: true });
    const reason = /** @type {string} */ (
      /** @type {{ deferred?: boolean, reason?: string }} */ (out).reason
    );
    expect(reason).toContain('not a trusted native queue mutation actor');
    expect(reason).toContain('github-actions[bot]');
    // The safety check held: the mutation never ran on the fallback token.
    expect(backendCalls.some(c => c.line.includes('DequeuePullRequest'))).toBe(
      false
    );
    // Only the incident write happened; no conflict pass, no re-enqueue.
    const lines = writes();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('/issues -f');
    expect(lines[0]).toContain('dequeue deferred');
  });

  it('defers when the fallback token bucket is exhausted too', async () => {
    backendRoute = () => rateLimited;
    const out = await stuckHead({ doApply: true, now: NOW });
    expect(out).toMatchObject({ dequeued: false, deferred: true });
    const reason = /** @type {string} */ (
      /** @type {{ deferred?: boolean, reason?: string }} */ (out).reason
    );
    expect(reason).toContain('fallback token also exhausted');
    expect(backendCalls.some(c => c.line.includes('DequeuePullRequest'))).toBe(
      false
    );
  });

  it('still throws (alert-failure path) when the failure is not installation quota exhaustion', async () => {
    primaryExhausted = false;
    backendPrimaryExhausted = false;
    backendRoute = () => ({
      code: 1,
      stdout: '',
      stderr: 'HTTP 404: Not Found',
    });
    await expect(stuckHead({ doApply: true, now: NOW })).rejects.toMatchObject({
      name: 'MergeQueueBackendError',
      code: 'gh_command_failed',
    });
    expect(backendCalls).toHaveLength(1);
  });

  it('throws the original exhaustion error without retrying when no fallback token exists', async () => {
    // gh() wrapper stays healthy so the queue read succeeds; only the
    // backend's runners hit the exhausted installation bucket.
    primaryExhausted = false;
    backendPrimaryExhausted = true;
    delete process.env.GH_FALLBACK_TOKEN;
    await expect(stuckHead({ doApply: true, now: NOW })).rejects.toMatchObject({
      name: 'MergeQueueBackendError',
      code: 'gh_command_failed',
    });
    expect(
      backendCalls.filter(c => c.line.includes('MergeQueueNativeMutationActor'))
    ).toHaveLength(1);
  });

  it('keeps the single fast attempt when the primary token is healthy', async () => {
    primaryExhausted = false;
    backendPrimaryExhausted = false;
    const out = await stuckHead({ doApply: true, now: NOW });
    expect(out).toMatchObject({ dequeued: true });
    expect(
      backendCalls.filter(c => c.line.includes('MergeQueueNativeMutationActor'))
    ).toHaveLength(1);
    expect(backendCalls.every(c => c.credential === 'installation-token')).toBe(
      true
    );
  });

  it('propagates the defer-class error out of the failing-head path so alert-failure stays the honest surface', async () => {
    // failingHead() keeps #24021's exact bytes (that region is a both-sides
    // addition vs the fork point and can never auto-merge). It still inherits
    // the fallback retry inside dequeue(); when the fallback identity is
    // refused the defer-class error must surface — visible via alert-failure —
    // and the queue mutation must not run.
    fallbackViewerLogin = 'github-actions[bot]';
    ghRoutes = line => {
      if (line.includes('mergeQueue(branch:'))
        return okJson({
          data: {
            repository: {
              mergeQueue: {
                entries: {
                  nodes: [
                    {
                      position: 1,
                      state: 'AWAITING_CHECKS',
                      enqueuedAt: '2026-10-31T17:56:00Z',
                      headCommit: { oid: HEAD },
                      pullRequest: { number: HEAD_PR, labels: { nodes: [] } },
                    },
                  ],
                },
              },
            },
          },
        });
      if (line.includes('check-runs'))
        return okJson({
          check_runs: [{ id: 1, name: 'PR Ready', conclusion: 'failure' }],
        });
      if (line.includes('branch=main&event=push'))
        return okJson({
          workflow_runs: [{ status: 'completed', conclusion: 'success' }],
        });
      if (line.includes('labels=main-health-incident')) return okJson([]);
      if (line.includes('/issues -f')) return okJson({ number: 556 });
      if (line.includes('-X POST')) return okJson({});
      if (line.includes('workflow run')) return okJson('');
      return { code: 1, stdout: '', stderr: `unrouted gh call: ${line}` };
    };
    await expect(stuckHead({ doApply: true, now: NOW })).rejects.toMatchObject({
      name: 'MergeQueueDeferError',
      code: 'dequeue_quota_deferred',
    });
    // The safety check held: the mutation never ran on the fallback token.
    expect(backendCalls.some(c => c.line.includes('DequeuePullRequest'))).toBe(
      false
    );
    // No writes at all before the throw: no incident, no comment, no labels.
    expect(writes()).toHaveLength(0);
  });
});
