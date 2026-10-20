import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runLiveness } from '../../automation-liveness.mjs';
import {
  livenessDecisions,
  livenessFingerprint,
  loadRegistry,
} from '../automation-registry.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const registry = loadRegistry(repoRoot);
const NOW = Date.parse('2026-10-20T19:35:00Z');
const iso = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString();
const MAIN = 'a'.repeat(40);
const LIVE = 'b'.repeat(40);

function only(...ids) {
  const entries = registry.entries.filter(entry => ids.includes(entry.id));
  expect(entries.map(entry => entry.id).sort()).toEqual([...ids].sort());
  return { ...registry, entries };
}

/** Fake network: URL substring -> JSON body (or a status number). */
function fakeFetch(routes) {
  return async url => {
    const hit = Object.entries(routes).find(([key]) => url.includes(key));
    if (!hit) return { status: 404, json: async () => ({}) };
    const value = typeof hit[1] === 'function' ? hit[1](url) : hit[1];
    if (typeof value === 'number')
      return { status: value, json: async () => ({}) };
    return { status: 200, json: async () => value };
  };
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

describe('dead-man liveness', () => {
  // (a) 2026-10-20: the Production Continuity Guard kept reading green while
  // production lagged main by ~5h. The promotion heartbeat is judged on its
  // own, so a green guard cannot mask a silent release pipeline.
  it('(a) a green continuity guard does not hide a production promotion that went silent', async () => {
    const { report } = await runLiveness({
      registry: only(
        'github:jovie:production-continuity',
        'derived:jovie:production-promotion'
      ),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'production-continuity.yml/runs': runs(
          [2, 'success', 3],
          [7, 'success', 2],
          [12, 'success', 1]
        ),
        'jov.ie/api/health/build-info': { commitSha: LIVE },
        '/commits/main': { sha: MAIN },
        [`/compare/${LIVE}...${MAIN}`]: {
          ahead_by: 9,
          commits: [{ commit: { committer: { date: iso(5 * 60) } } }],
        },
      }),
    });
    expect(rowFor(report, 'github:jovie:production-continuity').status).toBe(
      'fresh'
    );
    const promotion = rowFor(report, 'derived:jovie:production-promotion');
    expect(promotion.status).toBe('stale');
    expect(promotion.ageMinutes).toBe(300);
    expect(report.status).toBe('critical');
    const decisions = livenessDecisions(report);
    expect(decisions).toEqual([
      expect.objectContaining({
        action: 'red',
        fingerprint: livenessFingerprint('derived:jovie:production-promotion'),
      }),
    ]);
  });

  it('(a) an unreadable production build is silence, not health (the guard fails open)', async () => {
    const { report } = await runLiveness({
      registry: only('derived:jovie:production-promotion'),
      nowMs: NOW,
      fetchImpl: fakeFetch({ 'jov.ie/api/health/build-info': 503 }),
    });
    expect(rowFor(report, 'derived:jovie:production-promotion')).toMatchObject({
      status: 'unknown',
      reason: 'live-sha-unreadable',
    });
    expect(livenessDecisions(report)[0].action).toBe('red');
  });

  it('(a) a guard that stops producing verdicts is itself silent', async () => {
    const { report } = await runLiveness({
      registry: only('github:jovie:production-continuity'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'production-continuity.yml/runs': runs(
          [45, 'success', 2],
          [3, 'cancelled', 3]
        ),
      }),
    });
    expect(rowFor(report, 'github:jovie:production-continuity')).toMatchObject({
      status: 'stale',
      ageMinutes: 45,
    });
  });

  // (b) 2026-10-20 18:01-19:3x: the public lanes status gist stopped updating
  // and nothing alerted.
  it('(b) a stale public lanes status gist alerts', async () => {
    const { report } = await runLiveness({
      registry: only('gem:lanes-tick'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'lanes-status.json': {
          schema: 'symphony-lanes-status/v1',
          at: '2026-10-20T18:01:00Z',
        },
      }),
    });
    expect(rowFor(report, 'gem:lanes-tick')).toMatchObject({
      status: 'stale',
      ageMinutes: 94,
    });
    const [decision] = livenessDecisions(report);
    expect(decision).toMatchObject({
      action: 'red',
      fingerprint: 'automation-liveness-gem-lanes-tick',
    });
    expect(decision.detail).toMatch(/max silence 30m/);
    expect(decision.detail).toMatch(/Escalation owner: gem/);
  });

  it('(b) an unreachable gist is silence', async () => {
    const { report } = await runLiveness({
      registry: only('gem:lanes-tick'),
      nowMs: NOW,
      fetchImpl: fakeFetch({}),
    });
    expect(rowFor(report, 'gem:lanes-tick').status).toBe('unknown');
  });

  // (c) Summer's model turns failed for two days with no escalation, while
  // its provider-read receipts stayed fresh.
  it('(c) failing Summer model turns alert even while provider receipts are fresh', async () => {
    const health = {
      receiptFreshness: {
        githubRead: { status: 'verified', observedAt: iso(5) },
        modelTurn: { status: 'verified', observedAt: iso(2 * 24 * 60) },
      },
    };
    const { report } = await runLiveness({
      registry: only('summer:model-turns', 'summer:provider-receipts'),
      nowMs: NOW,
      fetchImpl: fakeFetch({ 'summer.jov.ie/runtime/v1/health': health }),
    });
    expect(rowFor(report, 'summer:provider-receipts').status).toBe('fresh');
    expect(rowFor(report, 'summer:model-turns')).toMatchObject({
      status: 'stale',
      ageMinutes: 2880,
    });
    expect(livenessDecisions(report).map(row => row.id)).toEqual([
      'summer:model-turns',
    ]);
  });

  it('(c) a missing or failed model-turn heartbeat is red, never green', async () => {
    for (const modelTurn of [
      undefined,
      { status: 'failed', observedAt: iso(1) },
    ]) {
      const { report } = await runLiveness({
        registry: only('summer:model-turns'),
        nowMs: NOW,
        fetchImpl: fakeFetch({
          'summer.jov.ie/runtime/v1/health': {
            receiptFreshness: {
              githubRead: { status: 'verified', observedAt: iso(1) },
              modelTurn,
            },
          },
        }),
      });
      expect(rowFor(report, 'summer:model-turns').status).toBe('missing');
    }
  });

  it('only counts the configured trigger events for scheduled baselines', async () => {
    const { report } = await runLiveness({
      registry: only('github:jovie:security'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'security.yml/runs': runs(
          [10, 'success', 2, 'push'],
          [9 * 24 * 60, 'failure', 1, 'schedule']
        ),
      }),
    });
    expect(rowFor(report, 'github:jovie:security').status).toBe('missing');
  });
});

describe('liveness run receipts', () => {
  it('emits receipts for observed runs during a liveness pass', async () => {
    const { events } = await runLiveness({
      registry: only('github:jovie:production-continuity'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'production-continuity.yml/runs': runs([2, 'failure', 7]),
      }),
    });
    expect(events.map(row => [row.stage, row.outcome])).toEqual([
      ['started', 'advanced'],
      ['finished', 'failed'],
    ]);
  });
});
