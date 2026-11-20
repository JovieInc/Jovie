import { execFileSync } from 'node:child_process';
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
  loadSchedulers,
  parseLanesClocks,
  parseWranglerCrons,
  REGISTRY_SCHEMA,
  runStageEvents,
  runsPerDay,
  validateRegistry,
  validateScheduling,
} from '../automation-registry.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const registry = loadRegistry(repoRoot);
const NOW = Date.parse('2026-10-20T19:35:00Z');
const iso = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString();
describe('automation registry', () => {
  it('keeps every hosted gist heartbeat root in the bounded public feed', () => {
    // This checkout contract belongs here: immutable lanes release bundles do
    // not include the automation registry (JOV-9115).
    const keys = JSON.parse(
      execFileSync(
        'python3',
        [
          '-c',
          [
            'import ast,json,pathlib',
            'tree=ast.parse(pathlib.Path("scripts/lanes/public_feed.py").read_text())',
            'value=next(n.value for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=="HEARTBEAT_FEED_KEYS" for t in n.targets))',
            'print(json.dumps(ast.literal_eval(value)))',
          ].join('; '),
        ],
        { cwd: repoRoot, encoding: 'utf8' }
      )
    );
    const roots = registry.entries
      .filter(
        entry =>
          entry.status === 'live' &&
          entry.receipt?.kind === 'json-timestamp' &&
          entry.receipt?.url?.includes('gist')
      )
      .map(entry => entry.receipt.path.split('.')[0]);
    expect(roots.length).toBeGreaterThan(0);
    expect([...new Set(roots)].filter(root => !keys.includes(root))).toEqual(
      []
    );
  });

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

  it('lets a workflow-sourced lanes-clock entry cover its clock, before and after the clock lands', () => {
    const pending = {
      schema: REGISTRY_SCHEMA,
      entries: [
        {
          id: 'github:jovie:sweep',
          status: 'live',
          trigger: {
            kind: 'lanes-clock',
            repo: 'JovieInc/Jovie',
            source: '.github/workflows/sweep.yml',
          },
        },
      ],
    };
    expect(checkRegistryCoverage(pending, new Map())).toEqual([]);
    const landed = new Map([
      ['lanes-clock:sweepClock', { workflow: 'sweep.yml' }],
    ]);
    expect(checkRegistryCoverage(pending, landed)).toEqual([]);
    const other = new Map([
      ['lanes-clock:otherClock', { workflow: 'other.yml' }],
    ]);
    expect(checkRegistryCoverage(pending, other).join('\n')).toMatch(
      /lanes-clock:otherClock: scheduled automation has no live entry/
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
        { ...base, id: 'x:no-identity', runsAs: undefined },
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
    expect(errors).toMatch(/x:no-identity\): runsAs is required/);
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

describe('liveness evaluation (pure)', () => {
  const entry = registry.entries.find(row => row.id === 'gem:lanes-tick');
  const fingerprint = livenessFingerprint('gem:lanes-tick');

  it('treats an unreadable or missing heartbeat as red, never green', () => {
    expect(
      evaluateEntry(entry, { ok: false, reason: 'timeout' }, NOW).status
    ).toBe('unknown');
    expect(
      evaluateEntry(entry, { ok: true, lastProofAt: null }, NOW).status
    ).toBe('missing');
    expect(evaluateEntry(entry, undefined, NOW).status).toBe('unknown');
    expect(
      evaluateEntry(entry, { ok: true, lastProofAt: iso(31) }, NOW)
    ).toMatchObject({ status: 'stale', ageMinutes: 31 });
  });

  it('resolves once the heartbeat returns, and stays quiet while steadily green', () => {
    const fresh = {
      results: [evaluateEntry(entry, { ok: true, lastProofAt: iso(3) }, NOW)],
    };
    expect(livenessDecisions(fresh, { [fingerprint]: 'red' })).toEqual([
      { action: 'green', fingerprint, id: 'gem:lanes-tick' },
    ]);
    expect(livenessDecisions(fresh, { [fingerprint]: 'green' })).toEqual([]);
    expect(livenessDecisions(fresh, {})).toEqual([]);
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
        outcome: 'completed',
        sourceReceipt: 'u',
      })
    ).toEqual([]);
  });
});

describe('shared scheduling', () => {
  const schedulers = loadSchedulers(repoRoot);
  const bare = { ...schedulers, grandfathered: [] };
  const timer = overrides => ({
    id: 'gem:new-poller',
    status: 'live',
    host: 'gem',
    trigger: {
      kind: 'systemd-timer',
      source: 'x.timer',
      schedule: 'every 5 min',
    },
    ...overrides,
  });

  it('holds for the committed registry', () => {
    expect(validateScheduling(registry, schedulers)).toEqual([]);
  });

  it('fails a new timer that skips the shared scheduler or the event question', () => {
    const errors = validateScheduling({ entries: [timer()] }, bare);
    expect(errors.join('\n')).toMatch(/clock\.scheduler must be one of/);
    expect(errors.join('\n')).toMatch(/clock\.whyNotEvent/);
  });

  it('accepts a new timer that registers and says why no event exists', () => {
    const entry = timer({
      clock: {
        scheduler: 'gem:lanes-tick',
        whyNotEvent: 'The upstream provider sends no webhook for this state.',
      },
    });
    expect(validateScheduling({ entries: [entry] }, bare)).toEqual([]);
  });

  it('ratchets: a grandfathered id that complies or vanished must leave the list', () => {
    const entry = timer({
      clock: {
        scheduler: 'gem:lanes-tick',
        whyNotEvent: 'The upstream provider sends no webhook for this state.',
      },
    });
    const withList = { ...schedulers, grandfathered: [entry.id, 'gone:id'] };
    const errors = validateScheduling({ entries: [entry] }, withList);
    expect(errors.some(e => e.includes('complies now'))).toBe(true);
    expect(errors.some(e => e.includes('gone:id'))).toBe(true);
  });

  it('discovers wrangler crons and systemd timers so they cannot hide', () => {
    expect(
      parseWranglerCrons('[triggers]\ncrons = ["* * * * *", "17 5 * * *"]')
    ).toEqual(['* * * * *', '17 5 * * *']);
    const keys = [...discoverScheduledAutomations(repoRoot).keys()];
    expect(keys.some(key => key.startsWith('cloudflare-cron:workers/'))).toBe(
      true
    );
    expect(keys.some(key => key.startsWith('systemd-timer:'))).toBe(true);
  });

  it('derives runs per day from cron, interval and calendar phrases', () => {
    expect(runsPerDay('*/5 * * * *')).toBe(288);
    expect(runsPerDay('every 15 min')).toBe(96);
    expect(runsPerDay('OnCalendar *:00/5')).toBe(288);
    expect(runsPerDay('FREQ=MINUTELY;INTERVAL=30')).toBe(48);
    expect(runsPerDay('17 */6 * * *; 47 7 * * *')).toBe(5);
    expect(runsPerDay('continuous')).toBeNull();
  });
});

describe('post-handoff Summer receiver detection', () => {
  const now = Date.parse('2026-11-05T16:46:00Z');
  const at = new Date(now).toISOString();
  const id = 'summer:receiver-outcomes';
  const selected = {
    ...registry,
    entries: registry.entries.filter(row =>
      [id, 'summer:heartbeat'].includes(row.id)
    ),
  };
  async function observe(slot, status = 200) {
    return runLiveness({
      registry: selected,
      nowMs: now,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            status: 'up',
            availability: 'up',
            receiptFreshness: {
              heartbeat: { status: 'verified', observedAt: at },
              meshDelivery: slot,
            },
          }),
          { status }
        ),
    });
  }
  const receiver = report => report.results.find(row => row.id === id);

  it('registers the receiver scope alongside the existing hub alarm', () => {
    expect(selected.entries.map(row => row.id).sort()).toEqual(
      [id, 'summer:heartbeat'].sort()
    );
    expect(
      registry.entries.some(
        row => row.id === 'cloudflare:mesh-hub-stale-mail-alarm'
      )
    ).toBe(true);
    expect(
      registry.entries.some(row => row.id === 'summer:mesh-delivery-dwell')
    ).toBe(false);
    expect(selected.entries.find(row => row.id === id).critical).toBe(false);
  });

  it.each([
    ['failed', null, 'mesh-undelivered-over-10m:49+'],
    ['unknown', null, 'mesh-pending-unreadable'],
    ['partial', at, 'mesh-pending-partial'],
  ])(
    'retains %s producer evidence while the process heartbeat is healthy',
    async (status, observedAt, code) => {
      const { report } = await observe({
        status,
        observedAt,
        code,
        pending: null,
        oldestAgeMinutes: null,
      });
      expect(
        report.results.find(row => row.id === 'summer:heartbeat').status
      ).toBe('fresh');
      expect(receiver(report).status).not.toBe('fresh');
      expect(receiver(report).reason).toContain(`=${status}; ${code}`);
      expect(report.status).toBe('degraded');
      expect(livenessDecisions(report, {})).toEqual([]);
    }
  );

  it('does not turn an absent receiver slot into a healthy heartbeat', async () => {
    const { report } = await observe(undefined);
    expect(receiver(report)).toMatchObject({
      status: 'missing',
      reason: 'heartbeat-source-missing:receiptFreshness.meshDelivery.status',
    });
  });

  it('requires a timestamp even when the producer says verified', async () => {
    const { report } = await observe({ status: 'verified', observedAt: null });
    expect(receiver(report)).toMatchObject({
      status: 'missing',
      reason:
        'heartbeat-source-missing:receiptFreshness.meshDelivery.observedAt',
    });
  });

  it('keeps old verified evidence stale', async () => {
    const { report } = await observe({
      status: 'verified',
      observedAt: new Date(now - 31 * 60_000).toISOString(),
    });
    expect(receiver(report)).toMatchObject({ status: 'stale', ageMinutes: 31 });
  });

  it('accepts fresh verified receiver evidence without an outbound decision', async () => {
    const { report } = await observe({
      status: 'verified',
      observedAt: at,
      code: null,
      pending: 0,
    });
    expect(receiver(report)).toMatchObject({ status: 'fresh', reason: null });
    expect(report.status).toBe('healthy');
    expect(
      livenessDecisions(report, {
        'automation-liveness-summer-receiver-outcomes': 'red',
      })
    ).toEqual([]);
  });

  it('keeps an unreadable source unknown without a retry', async () => {
    const { report } = await observe(null, 503);
    expect(receiver(report)).toMatchObject({
      status: 'unknown',
      reason: 'json-http-503',
    });
  });

  it.each([{ private: 'content' }, 'private content\nmore', 'a'.repeat(161)])(
    'does not copy arbitrary diagnostic content into detector output (%j)',
    async code => {
      const { report } = await observe({
        status: 'failed',
        observedAt: null,
        code,
      });
      expect(receiver(report).reason).toBe(
        'heartbeat-not-ok:receiptFreshness.meshDelivery.status=failed'
      );
    }
  );
});
