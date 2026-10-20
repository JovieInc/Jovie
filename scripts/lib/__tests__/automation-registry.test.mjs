import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runLiveness } from '../../automation-liveness.mjs';
import {
  checkRegistryCoverage,
  discoverScheduledAutomations,
  evaluateEntry,
  livenessDecisions,
  livenessFingerprint,
  loadRegistry,
  parseLanesClocks,
  REGISTRY_SCHEMA,
  runStageEvents,
  validateRegistry,
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

describe('automation registry', () => {
  it('validates the committed registry', () => {
    expect(registry.schema).toBe(REGISTRY_SCHEMA);
    expect(validateRegistry(registry)).toEqual([]);
  });

  it('registers every GitHub cron, Vercel cron and lanes clock in this repository', () => {
    const discovered = discoverScheduledAutomations(repoRoot);
    expect(
      [...discovered.keys()].some(key => key.startsWith('github-cron:'))
    ).toBe(true);
    expect(
      [...discovered.keys()].some(key => key.startsWith('vercel-cron:'))
    ).toBe(true);
    expect(
      [...discovered.keys()].some(key => key.startsWith('lanes-clock:'))
    ).toBe(true);
    expect(checkRegistryCoverage(registry, discovered)).toEqual([]);
  });

  it('fails when a schedule exists without a live entry, or an entry outlives its schedule', () => {
    const root = mkdtempSync(join(tmpdir(), 'automation-registry-'));
    mkdirSync(join(root, '.github/workflows'), { recursive: true });
    mkdirSync(join(root, 'apps/web'), { recursive: true });
    mkdirSync(join(root, 'scripts/lanes'), { recursive: true });
    writeFileSync(
      join(root, '.github/workflows/new-clock.yml'),
      "on:\n  schedule:\n    - cron: '0 * * * *'\n"
    );
    writeFileSync(
      join(root, 'apps/web/vercel.json'),
      JSON.stringify({
        crons: [{ path: '/api/cron/new', schedule: '0 0 * * *' }],
      })
    );
    writeFileSync(
      join(root, 'scripts/lanes/continuity_clock.py'),
      'CLOCKS = (\n    Clock("newClock", "x.yml", "clock_x", 60,\n          "x.json"),\n)\n'
    );
    const stale = {
      schema: REGISTRY_SCHEMA,
      entries: [
        {
          id: 'github:jovie:gone',
          status: 'live',
          trigger: {
            kind: 'github-cron',
            repo: 'JovieInc/Jovie',
            source: '.github/workflows/gone.yml',
          },
        },
      ],
    };
    const errors = checkRegistryCoverage(
      stale,
      discoverScheduledAutomations(root)
    );
    expect(errors.join('\n')).toMatch(
      /github-cron:\.github\/workflows\/new-clock\.yml: scheduled automation has no live entry/
    );
    expect(errors.join('\n')).toMatch(
      /vercel-cron:\/api\/cron\/new: scheduled automation has no live entry/
    );
    expect(errors.join('\n')).toMatch(
      /lanes-clock:newClock: scheduled automation has no live entry/
    );
    expect(errors.join('\n')).toMatch(
      /github:jovie:gone is live but the schedule no longer exists/
    );
  });

  it('parses lanes clocks from continuity_clock.py', () => {
    expect(
      parseLanesClocks(
        '    Clock("continuity", "production-continuity.yml", "e", 300,\n'
      )
    ).toEqual([{ name: 'continuity', workflow: 'production-continuity.yml' }]);
  });

  it('rejects entries missing the audit fields, and critical loops without a hosted heartbeat', () => {
    const base = registry.entries.find(entry => entry.id === 'gem:lanes-tick');
    const errors = validateRegistry({
      schema: REGISTRY_SCHEMA,
      entries: [
        { ...base, id: 'x:no-kill', killSwitch: '' },
        { ...base, id: 'x:no-beat', heartbeat: undefined },
        {
          ...base,
          id: 'x:host-only',
          receipt: { kind: 'host-local', location: 'somewhere' },
        },
        {
          ...base,
          id: 'x:unmeasured',
          critical: false,
          receipt: { kind: 'none' },
          gap: undefined,
        },
        {
          ...base,
          id: 'x:retired',
          status: 'retired',
          archive: undefined,
          retiredAt: undefined,
        },
      ],
    }).join('\n');
    expect(errors).toMatch(/x:no-kill\): killSwitch is required/);
    expect(errors).toMatch(
      /x:no-beat\): critical loops declare heartbeat\.proof/
    );
    expect(errors).toMatch(
      /x:host-only\): a critical loop needs a receipt the hosted dead-man can read/
    );
    expect(errors).toMatch(
      /x:unmeasured\): an unmeasured entry must name its measurement gap/
    );
    expect(errors).toMatch(/x:retired\): retired entries need retiredAt/);
    expect(errors).toMatch(/x:retired\): retired entries need archive/);
  });

  it('every critical loop declares proof, max silence and an escalation owner', () => {
    const critical = registry.entries.filter(
      entry => entry.status === 'live' && entry.critical
    );
    for (const id of [
      'github:jovie:production-continuity',
      'derived:jovie:production-promotion',
      'gem:lanes-tick',
      'summer:model-turns',
    ]) {
      expect(critical.map(entry => entry.id)).toContain(id);
    }
    for (const entry of critical) {
      expect(entry.heartbeat.proof.length, entry.id).toBeGreaterThan(20);
      expect(entry.heartbeat.maxSilenceMinutes, entry.id).toBeGreaterThan(0);
      expect(entry.heartbeat.escalationOwner, entry.id).toBeTruthy();
    }
  });
});

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

  it('resolves once the heartbeat returns, and stays quiet while steadily green', () => {
    const entry = registry.entries.find(row => row.id === 'gem:lanes-tick');
    const fresh = {
      results: [evaluateEntry(entry, { ok: true, lastProofAt: iso(3) }, NOW)],
    };
    const fingerprint = livenessFingerprint('gem:lanes-tick');
    expect(livenessDecisions(fresh, { [fingerprint]: 'red' })).toEqual([
      { action: 'green', fingerprint, id: 'gem:lanes-tick' },
    ]);
    expect(livenessDecisions(fresh, { [fingerprint]: 'green' })).toEqual([]);
    expect(livenessDecisions(fresh, {})).toEqual([]);
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

describe('run receipts', () => {
  it('records each run start and end as jovie-stage-event/v1 rows', () => {
    const rows = runStageEvents({
      automationId: 'github:jovie:production-continuity',
      runRef: '42',
      startedAt: '2026-10-20T19:00:00Z',
      endedAt: '2026-10-20T19:01:30Z',
      outcome: 'completed',
      sourceReceipt: 'https://github.com/JovieInc/Jovie/actions/runs/42',
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      schema: 'jovie-stage-event/v1',
      entityType: 'automation-run',
      entityId: 'github:jovie:production-continuity@42',
      stage: 'started',
      enteredAt: '2026-10-20T19:00:00.000Z',
      exitedAt: '2026-10-20T19:01:30.000Z',
      outcome: 'advanced',
    });
    expect(rows[1]).toMatchObject({ stage: 'finished', outcome: 'completed' });
  });

  it('never invents a timestamp', () => {
    expect(
      runStageEvents({
        automationId: 'x',
        runRef: '1',
        startedAt: null,
        endedAt: '2026-10-20T19:00:00Z',
        sourceReceipt: 'u',
      })
    ).toEqual([]);
  });

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
