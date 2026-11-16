import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createApiClient,
} from '../../../packages/api-client/client.ts';
import { MemoryLedgerStore } from '../../../packages/api-client/store.ts';
import {
  observeWorkflowFailureStreak,
  runLiveness as runLivenessImpl,
} from '../../automation-liveness.mjs';
import { selectSourceGuards } from '../../ci-fast-lanes.mjs';
import {
  livenessDecisions,
  livenessFingerprint,
  loadRegistry,
} from '../automation-registry.mjs';

import { mapTestReferences } from '../ci-script-test-inventory.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const registry = loadRegistry(repoRoot);

const NOW = Date.parse('2026-10-20T19:35:00Z');
const iso = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString();
const MAIN = 'a'.repeat(40);
const LIVE = 'b'.repeat(40);

function runLiveness(options) {
  return runLivenessImpl({
    // Keep the suite off the network and the host's shared budget ledger.
    lsRemote: async () => null,
    ...options,
    githubClient: createApiClient({
      provider: 'github',
      credential: 'test',
      fetch: options.fetchImpl,
      store: new MemoryLedgerStore(),
      now: () => NOW,
      sleep: async () => {},
      random: () => 0,
    }),
  });
}

function only(...ids) {
  const entries = registry.entries.filter(entry => ids.includes(entry.id));
  expect(entries.map(entry => entry.id).sort()).toEqual([...ids].sort());
  return { ...registry, entries };
}

function runs(...rows) {
  return {
    workflow_runs: rows.map(
      ([minutesAgo, conclusion, id, event = 'repository_dispatch']) => ({
        id,
        conclusion,
        event,
        run_started_at: iso(minutesAgo + 1),
        created_at: iso(minutesAgo + 1),
        updated_at: iso(minutesAgo),
        html_url: `https://github.com/JovieInc/Jovie/actions/runs/${id}`,
      })
    ),
  };
}

function rowFor(report, id) {
  return report.results.find(row => row.id === id);
}

describe('workflow run-list reads survive a denied Actions token (JOV-11677)', () => {
  // Automation-liveness run 43150125408: the shared installation REST budget
  // answered 403 for the golden-path-nightly run list while the workflow
  // itself was green, filing a false P0. The repo is public, so one
  // unauthenticated retry (lib/github-json-read.mjs readGithubJson) must
  // recover the heartbeat.
  const deniedTokenFetch = body => async (input, init) => {
    const authenticated = Boolean(init?.headers?.Authorization);
    if (authenticated) return new Response('{}', { status: 403 });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  it('reads a healthy golden-path-nightly heartbeat when the token is denied', async () => {
    const fetchImpl = vi.fn(
      deniedTokenFetch(runs([600, 'success', 9], [2000, 'failure', 8]))
    );
    const { report } = await runLiveness({
      registry: only('github:jovie:golden-path-nightly'),
      nowMs: NOW,
      fetchImpl,
      token: 'actions-token',
    });
    expect(rowFor(report, 'github:jovie:golden-path-nightly').status).toBe(
      'fresh'
    );
    // One denied authenticated read plus the unauthenticated recovery.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('stays red when the public read is also denied', async () => {
    const { report } = await runLiveness({
      registry: only('github:jovie:golden-path-nightly'),
      nowMs: NOW,
      fetchImpl: async () => new Response('{}', { status: 403 }),
      token: 'actions-token',
    });
    expect(rowFor(report, 'github:jovie:golden-path-nightly')).toMatchObject({
      status: 'unknown',
      reason: 'github-http-403',
    });
    expect(livenessDecisions(report)[0]).toMatchObject({ action: 'red' });
  });

  it('keeps a non-403 failure red without a public retry', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 404 }));
    const { report } = await runLiveness({
      registry: only('github:jovie:golden-path-nightly'),
      nowMs: NOW,
      fetchImpl,
      token: 'actions-token',
    });
    expect(rowFor(report, 'github:jovie:golden-path-nightly')).toMatchObject({
      status: 'unknown',
      reason: 'github-http-404',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 403 when the read was already unauthenticated', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 403 }));
    const observed = await observeWorkflowFailureStreak(
      {
        repo: 'JovieInc/Jovie',
        workflow: 'production-controller.yml',
        streak: 3,
      },
      { fetchImpl, token: '', nowMs: NOW }
    );
    expect(observed).toMatchObject({ ok: false, reason: 'github-http-403' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('recovers a failure-streak read the same way', async () => {
    const observed = await observeWorkflowFailureStreak(
      {
        repo: 'JovieInc/Jovie',
        workflow: 'production-controller.yml',
        streak: 3,
      },
      {
        fetchImpl: deniedTokenFetch({
          workflow_runs: [
            {
              id: 3,
              conclusion: 'failure',
              created_at: iso(3),
              updated_at: iso(3),
            },
            {
              id: 2,
              conclusion: 'success',
              created_at: iso(5),
              updated_at: iso(5),
            },
          ],
        }),
        token: 'test-token',
        nowMs: NOW,
      }
    );
    expect(observed).toMatchObject({ ok: true, reason: 'no-failure-streak' });
  });
});

describe('403 recovery CI admission', () => {
  it.each([
    'scripts/automation-liveness.mjs',
    'scripts/lib/github-json-read.mjs',
    'scripts/lib/__tests__/automation-liveness-github-403-recovery.test.mjs',
  ])('runs the recovery suite when %s changes', path => {
    for (const event of ['pull_request', 'merge_group', 'push']) {
      const guard = selectSourceGuards(event, [path]).find(
        candidate => candidate.id === 'automation-registry'
      );
      const file =
        'scripts/lib/__tests__/automation-liveness-github-403-recovery.test.mjs';
      const refs = mapTestReferences(
        [{ source: 'automation-registry', text: guard?.command ?? '' }],
        [file]
      );
      expect(refs.get(file)?.has('automation-registry')).toBe(true);
    }
  });
});

/** URL substring -> JSON body or response for the production identity probe. */
function fakeFetch(routes) {
  return async input => {
    const hit = Object.entries(routes).find(([key]) =>
      String(input).includes(key)
    );
    if (!hit) return new Response('{}', { status: 404 });
    return hit[1] instanceof Response
      ? hit[1]
      : new Response(JSON.stringify(hit[1]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
  };
}

describe('main-ref quota recovery (JOV-7973)', () => {
  beforeEach(() => vi.stubEnv('JOVIE_API_STATE', 'memory'));
  afterEach(() => vi.unstubAllEnvs());
  // Run 43196902039: local REST shedding hid a readable main.
  it.each(/** @type {const} */ (['shed', 'budget']))(
    'recovers both production heartbeats through git after a %s error',
    async kind => {
      const ids = [
        'derived:jovie:production-promotion',
        'derived:jovie:production-lag-2h',
      ];
      const request = vi.fn(async () => {
        throw new ApiError(kind, 'github', 'report budget unavailable');
      });
      const lsRemote = vi.fn(async () => MAIN);
      const { report } = await runLivenessImpl({
        registry: only(...ids),
        nowMs: NOW,
        token: 'actions-token',
        fetchImpl: fakeFetch({
          'jov.ie/api/health/build-info': { commitSha: MAIN },
        }),
        githubClient: {
          provider: 'github',
          credential: 'test',
          state: async () => null,
          request,
        },
        lsRemote,
      });
      for (const id of ids) {
        expect(rowFor(report, id)).toMatchObject({
          status: 'fresh',
          reason: 'production-current',
        });
      }
      expect(request).toHaveBeenCalledTimes(2);
      expect(lsRemote).toHaveBeenCalledTimes(2);
      expect(lsRemote).toHaveBeenCalledWith('JovieInc/Jovie', 'actions-token');
      expect(
        livenessDecisions(
          report,
          Object.fromEntries(ids.map(id => [livenessFingerprint(id), 'red']))
        )
      ).toEqual(
        ids.map(id =>
          expect.objectContaining({
            action: 'green',
            fingerprint: livenessFingerprint(id),
          })
        )
      );
    }
  );

  it.each([null, 'invalid', new Error('git down')])(
    'keeps shedding red when git cannot prove main (%j)',
    async gitResult => {
      const { report } = await runLivenessImpl({
        registry: only('derived:jovie:production-promotion'),
        nowMs: NOW,
        fetchImpl: fakeFetch({
          'jov.ie/api/health/build-info': { commitSha: MAIN },
        }),
        githubClient: {
          provider: 'github',
          credential: 'test',
          state: async () => null,
          request: async () => {
            throw new ApiError('shed', 'github', 'report budget unavailable');
          },
        },
        lsRemote: async () => {
          if (gitResult instanceof Error) throw gitResult;
          return gitResult;
        },
      });
      expect(
        rowFor(report, 'derived:jovie:production-promotion')
      ).toMatchObject({
        status: 'unknown',
        reason: 'main-ref-shed',
      });
      expect(livenessDecisions(report)[0].action).toBe('red');
    }
  );

  it.each([0, 300])(
    'still measures production lag after a rate-limited ref read (%sm)',
    async age => {
      const lsRemote = vi.fn(async () => MAIN);
      const { report } = await runLiveness({
        registry: only('derived:jovie:production-promotion'),
        nowMs: NOW,
        token: 'actions-token',
        lsRemote,
        fetchImpl: fakeFetch({
          'jov.ie/api/health/build-info': { commitSha: age ? LIVE : MAIN },
          '/git/ref/heads/main': new Response('{}', {
            status: 429,
            headers: { 'Retry-After': '60' },
          }),
          [`/compare/${LIVE}...${MAIN}`]: {
            ahead_by: 1,
            commits: [{ commit: { committer: { date: iso(age) } } }],
          },
        }),
      });
      expect(lsRemote).toHaveBeenCalledTimes(1);
      expect(
        rowFor(report, 'derived:jovie:production-promotion')
      ).toMatchObject({
        status: age ? 'stale' : 'fresh',
        ...(age ? { ageMinutes: age } : { reason: 'production-current' }),
      });
      expect(
        livenessDecisions(report).map(decision => decision.action)
      ).toEqual(age ? ['red'] : []);
    }
  );
});
