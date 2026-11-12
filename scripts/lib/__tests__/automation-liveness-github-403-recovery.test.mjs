import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  observeWorkflowFailureStreak,
  runLiveness as runLivenessImpl,
} from '../../automation-liveness.mjs';
import { selectSourceGuards } from '../../ci-fast-lanes.mjs';
import { livenessDecisions, loadRegistry } from '../automation-registry.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const registry = loadRegistry(repoRoot);

const NOW = Date.parse('2026-10-20T19:35:00Z');
const iso = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString();

function runLiveness(options) {
  return runLivenessImpl({
    // Keep the suite off the network.
    lsRemote: async () => null,
    ...options,
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
      expect(guard?.command.split(' ')).toContain(
        'lib/__tests__/automation-liveness-github-403-recovery.test.mjs'
      );
    }
  });
});
