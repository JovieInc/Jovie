import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkAutomationProposal,
  checkRegistryCoverage,
  discoverScheduledAutomations,
  evaluateEntry,
  livenessDecisions,
  livenessFingerprint,
  loadRegistry,
  parseLanesClocks,
  REGISTRY_PATH,
  REGISTRY_SCHEMA,
  registryCommand,
  runStageEvents,
  validateRegistry,
} from '../automation-registry.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const registry = loadRegistry(repoRoot);
const NOW = Date.parse('2026-10-20T19:35:00Z');
const iso = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString();
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

describe('pre-create automation admission', () => {
  const roots = [];
  afterEach(() => {
    for (const root of roots.splice(0))
      rmSync(root, { recursive: true, force: true });
  });
  const proposed = (overrides = {}) => ({
    id: 'test:receipt-reconcile',
    status: 'live',
    owner: 'test-owner',
    runsAs: 'test-runner',
    host: 'test-host',
    purpose: 'Reconcile provider receipts for the test project.',
    identity: { purpose: 'reconcile-receipts', scope: 'test:production' },
    trigger: {
      kind: 'eve-schedule',
      repo: 'Test/Project',
      source: 'schedules/receipts.ts',
    },
    metric: 'receipt age',
    receipt: { kind: 'host-local', location: 'test-receipts.json' },
    maxStalenessMinutes: 60,
    killSwitch: 'disable the test definition',
    ...overrides,
  });
  const inventory = entries => ({ schema: REGISTRY_SCHEMA, entries });
  const incumbent = proposed({
    id: 'test:incumbent',
    purpose: 'Reconcile provider receipts for another project.',
    identity: { purpose: 'reconcile-receipts', scope: 'other:production' },
    trigger: {
      kind: 'eve-schedule',
      repo: 'Test/Other',
      source: 'schedules/receipts.ts',
    },
  });
  const fixture = () => {
    const root = mkdtempSync(join(tmpdir(), 'automation-admission-'));
    roots.push(root);
    mkdirSync(join(root, 'canon'));
    mkdirSync(join(root, '.github/workflows'), { recursive: true });
    writeFileSync(
      join(root, REGISTRY_PATH),
      `${JSON.stringify({ schema: REGISTRY_SCHEMA })}\n${JSON.stringify(incumbent)}\n`
    );
    const file = join(root, 'proposal.json');
    writeFileSync(file, JSON.stringify(proposed()));
    return { root, file, args: ['can-create', '--proposal', file] };
  };

  it('rejects a renamed execution in the registry itself', () => {
    const heartbeat = registry.entries.find(
      entry => entry.id === 'summer:heartbeat'
    );
    expect(
      validateRegistry(
        inventory([
          heartbeat,
          { ...heartbeat, id: 'summer:renamed-regression' },
        ])
      ).join('\n')
    ).toMatch(/same execution source/);
  });

  it('rejects a renamed Summer heartbeat despite different ownership, host and cadence', () => {
    const heartbeat = registry.entries.find(
      entry => entry.id === 'summer:heartbeat'
    );
    const clone = {
      ...heartbeat,
      id: 'summer:renamed',
      owner: 'other-owner',
      host: 'other-host',
      identity: { purpose: 'receipt-catchup', scope: 'summer:production' },
      trigger: { ...heartbeat.trigger, schedule: 'daily' },
    };
    expect(checkAutomationProposal(registry, clone).join('\n')).toMatch(
      /summer:heartbeat.*owner summer.*same execution source/
    );
    expect(validateRegistry(inventory([heartbeat, clone])).join('\n')).toMatch(
      /same execution source/
    );
  });

  it('cannot evade execution identity by removing a repository or adding one to a lanes clock', () => {
    const beat = registry.entries.find(
      entry => entry.id === 'summer:heartbeat'
    );
    const clone = {
      ...beat,
      id: 'summer:namespace-evader',
      purpose: 'A renamed backstop.',
      identity: { purpose: 'new-backstop', scope: 'summer:production' },
      trigger: { ...beat.trigger, repo: undefined },
    };
    expect(checkAutomationProposal(registry, clone).join('\n')).toMatch(
      /trigger.repo is required/
    );
    expect(
      validateRegistry(inventory([...registry.entries, clone])).join('\n')
    ).toMatch(/ambiguous provider scope/);
    const clock = registry.entries.find(
      entry => entry.id === 'lanes-clock:continuity'
    );
    const alias = {
      ...clock,
      id: 'test:clock-alias',
      purpose: 'Renamed continuity.',
      identity: { purpose: 'check-continuity', scope: 'jovie:production' },
      trigger: { ...clock.trigger, repo: 'JovieInc/Jovie' },
    };
    expect(checkAutomationProposal(registry, alias).join('\n')).toMatch(
      /same execution source/
    );
    expect(
      checkAutomationProposal(registry, {
        ...alias,
        trigger: { ...alias.trigger, clock: `${clock.trigger.clock} ` },
      }).join('\n')
    ).toMatch(/canonical clock name/);
  });

  it('checks a pending workflow proposal against discovered clock claims without requiring a new schedule', () => {
    const discovered = discoverScheduledAutomations(repoRoot);
    const pending = proposed({
      trigger: {
        kind: 'lanes-clock',
        repo: 'JovieInc/Jovie',
        source: '.github/workflows/production-continuity.yml',
      },
    });
    expect(
      checkAutomationProposal(registry, pending, discovered).join('\n')
    ).toMatch(/registered twice/);
    const fresh = proposed({
      trigger: {
        kind: 'github-event',
        repo: 'JovieInc/Jovie',
        source: '.github/workflows/new-receipts.yml',
      },
    });
    expect(checkAutomationProposal(registry, fresh, discovered)).toEqual([]);
    expect(
      checkAutomationProposal(
        registry,
        { ...fresh, trigger: { ...fresh.trigger, kind: 'github-cron' } },
        discovered
      )
    ).toEqual([]);
    const unnamed = proposed({
      trigger: {
        kind: 'lanes-clock',
        source: 'scripts/lanes/continuity_clock.py',
      },
    });
    expect(
      checkAutomationProposal(registry, unnamed, discovered).join('\n')
    ).toMatch(/needs trigger.clock/);
    const invalidGroup = proposed({
      trigger: {
        kind: 'lanes-clock',
        source: 'not-a-workflow',
        clocks: ['a', 'b'],
        groupReason: 'A shared recovery path.',
      },
    });
    expect(
      checkAutomationProposal(registry, invalidGroup, discovered).join('\n')
    ).toMatch(/workflow-sourced lanes-clock/);
  });

  it('rejects equivalent declared identities even with different prose, source, owner and host', () => {
    const first = proposed();
    const second = proposed({
      id: 'test:renamed',
      owner: 'other-owner',
      host: 'other-host',
      purpose: 'A paraphrased description.',
      identity: { purpose: ' RECONCILE-RECEIPTS ', scope: ' TEST:PRODUCTION ' },
      trigger: { kind: 'eve-schedule', source: 'another.ts' },
    });
    expect(
      checkAutomationProposal(inventory([first]), second).join('\n')
    ).toMatch(/same purpose\/scope identity/);
    expect(validateRegistry(inventory([first, second])).join('\n')).toMatch(
      /same purpose\/scope identity/
    );
  });

  it('allows the same purpose in explicit different scopes and distinct execution resources', () => {
    const first = proposed();
    const second = proposed({
      id: 'test:staging',
      identity: { purpose: 'reconcile-receipts', scope: 'test:staging' },
      trigger: { ...first.trigger, source: 'schedules/staging.ts' },
    });
    expect(checkAutomationProposal(inventory([first]), second)).toEqual([]);
    expect(validateRegistry(inventory([first, second]))).toEqual([]);
  });

  it('fails closed when legacy scope cannot distinguish otherwise equal purposes', () => {
    const legacy = proposed({ identity: undefined });
    const second = proposed({
      id: 'test:new',
      trigger: { kind: 'eve-schedule', source: 'different.ts' },
    });
    expect(
      checkAutomationProposal(inventory([legacy]), second).join('\n')
    ).toMatch(/ambiguous legacy scope/);
  });

  it.each([
    undefined,
    null,
    {},
    [],
    { purpose: '', scope: 'test:production' },
    { purpose: 'reconcile-receipts', scope: '*' },
    { purpose: 'unknown-purpose', scope: 'test:production' },
  ])('rejects absent or meaningless proposal identity %j', identity => {
    expect(
      checkAutomationProposal(
        inventory([incumbent]),
        proposed({ identity })
      ).join('\n')
    ).toMatch(/identity\./);
  });

  it.each([
    null,
    undefined,
    {},
    [],
    { schema: 'wrong', entries: [] },
    { schema: REGISTRY_SCHEMA, entries: [] },
    {
      schema: REGISTRY_SCHEMA,
      entries: [incumbent],
      parseErrors: ['line 2: invalid JSON'],
    },
    { schema: REGISTRY_SCHEMA, entries: [incumbent], parseErrors: {} },
  ])('fails closed on invalid or empty inventories %j', value => {
    expect(checkAutomationProposal(value, proposed()).length).toBeGreaterThan(
      0
    );
  });

  it.each([null, [], {}, { status: 'retired' }])(
    'rejects incomplete or non-live proposals %j',
    value => {
      expect(
        checkAutomationProposal(inventory([incumbent]), value).length
      ).toBeGreaterThan(0);
    }
  );

  it('preserves one event/backstop row and rejects separate identities for its workflow', () => {
    const paired = proposed({
      trigger: {
        kind: 'github-event',
        repo: 'Test/Project',
        source: '.github/workflows/receipts.yml',
        also: 'daily clock backstop',
      },
    });
    expect(checkAutomationProposal(inventory([incumbent]), paired)).toEqual([]);
    const split = proposed({
      id: 'test:backstop',
      purpose: 'A backstop for receipts.',
      identity: { purpose: 'receipt-backstop', scope: 'test:production' },
      trigger: {
        ...paired.trigger,
        kind: 'github-cron',
        source: './.github/workflows/receipts.yml',
      },
    });
    expect(validateRegistry(inventory([paired, split])).join('\n')).toMatch(
      /same execution source/
    );
  });

  it('distinguishes Vercel endpoints, named lanes clocks, and derived observers sharing code', () => {
    const entries = [
      proposed({
        id: 'test:vercel-a',
        purpose: 'First endpoint.',
        identity: undefined,
        trigger: {
          kind: 'vercel-cron',
          repo: 'Test/Project',
          source: 'vercel.json',
          path: '/api/a',
        },
      }),
      proposed({
        id: 'test:vercel-b',
        purpose: 'Second endpoint.',
        identity: undefined,
        trigger: {
          kind: 'vercel-cron',
          repo: 'Test/Project',
          source: 'vercel.json',
          path: '/api/b',
        },
      }),
      proposed({
        id: 'test:clock-a',
        purpose: 'First clock.',
        identity: undefined,
        trigger: {
          kind: 'lanes-clock',
          source: 'continuity_clock.py',
          clock: 'a',
        },
      }),
      proposed({
        id: 'test:clock-b',
        purpose: 'Second clock.',
        identity: undefined,
        trigger: {
          kind: 'lanes-clock',
          source: 'continuity_clock.py',
          clock: 'b',
        },
      }),
      ...registry.entries.filter(
        entry =>
          entry.trigger.source === '.github/workflows/production-controller.yml'
      ),
    ];
    expect(validateRegistry(inventory(entries))).toEqual([]);
  });

  it('rejects ambiguous execution input and preserves retired identities without blocking unrelated work', () => {
    const missingPath = proposed({
      trigger: {
        kind: 'vercel-cron',
        repo: 'Test/Project',
        source: 'vercel.json',
      },
    });
    expect(
      checkAutomationProposal(inventory([incumbent]), missingPath).join('\n')
    ).toMatch(/execution identity is ambiguous/);
    const retired = proposed({
      status: 'retired',
      retiredAt: '2026-10-20',
      archive: 'archive/receipts.json',
    });
    const before = JSON.stringify(retired);
    expect(
      checkAutomationProposal(inventory([retired]), proposed()).join('\n')
    ).toMatch(/retired identity/);
    expect(
      checkAutomationProposal(
        inventory([retired]),
        proposed({ id: 'test:renamed' })
      ).join('\n')
    ).toMatch(/retired identity/);
    expect(checkAutomationProposal(inventory([retired]), incumbent)).toEqual(
      []
    );
    expect(
      validateRegistry(
        inventory([retired, proposed({ id: 'test:legacy-live' })])
      )
    ).toEqual([]);
    expect(JSON.stringify(retired)).toBe(before);
  });

  it('rejects the second sequential or composed proposal; simultaneous preflights are not reservations', () => {
    const first = proposed();
    const second = proposed({
      id: 'test:competing',
      trigger: { ...first.trigger, source: 'schedules/competing.ts' },
    });
    const initial = inventory([incumbent]);
    expect(checkAutomationProposal(initial, first)).toEqual([]);
    expect(checkAutomationProposal(initial, second)).toEqual([]);
    expect(
      checkAutomationProposal(inventory([incumbent, first]), second).join('\n')
    ).toMatch(/same purpose\/scope identity/);
    expect(
      validateRegistry(inventory([incumbent, first, second])).join('\n')
    ).toMatch(/same purpose\/scope identity/);
  });

  it('uses the CLI with the canonical registry and returns a snapshot digest without writing', () => {
    const { root, file } = fixture();
    const before = readFileSync(join(repoRoot, REGISTRY_PATH), 'utf8');
    const result = spawnSync(
      process.execPath,
      [
        join(repoRoot, 'scripts/lib/automation-registry.mjs'),
        'can-create',
        '--proposal',
        file,
      ],
      { cwd: root, encoding: 'utf8' }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      registry: REGISTRY_PATH,
      registrySha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      boundary: expect.stringContaining('no reservation'),
    });
    expect(readFileSync(join(repoRoot, REGISTRY_PATH), 'utf8')).toBe(before);
    writeFileSync(
      file,
      JSON.stringify({
        ...registry.entries.find(entry => entry.id === 'summer:heartbeat'),
        id: 'summer:duplicate',
        identity: { purpose: 'heartbeat-backstop', scope: 'summer:production' },
      })
    );
    const denied = spawnSync(
      process.execPath,
      [
        join(repoRoot, 'scripts/lib/automation-registry.mjs'),
        'can-create',
        '--proposal',
        file,
      ],
      { encoding: 'utf8' }
    );
    expect(denied.status).toBe(1);
    expect(JSON.parse(denied.stdout).errors.join('\n')).toMatch(
      /summer:heartbeat/
    );
  });

  it('fails closed for missing files, malformed JSON, incomplete source evidence and invalid arguments', () => {
    const { root, file, args } = fixture();
    expect(registryCommand(args, root).ok).toBe(true);
    for (const bad of [
      [],
      ['can-create'],
      [...args, '--allow'],
      ['check', '--proposal', file],
    ])
      expect(registryCommand(bad, root).ok).toBe(false);
    writeFileSync(file, '{');
    expect(registryCommand(args, root).ok).toBe(false);
    writeFileSync(file, JSON.stringify(proposed()));
    writeFileSync(join(root, 'vercel.json'), '{');
    expect(registryCommand(args, root).ok).toBe(false);
    writeFileSync(join(root, 'vercel.json'), JSON.stringify({ crons: [{}] }));
    expect(registryCommand(args, root).ok).toBe(false);
    rmSync(join(root, 'vercel.json'));
    rmSync(join(root, '.github'), { recursive: true });
    expect(registryCommand(args, root).ok).toBe(false);
    writeFileSync(join(root, REGISTRY_PATH), 'not json');
    expect(registryCommand(args, root).ok).toBe(false);
    rmSync(join(root, REGISTRY_PATH));
    expect(registryCommand(args, root).errors.join('\n')).toMatch(
      /unreadable admission evidence/
    );
    rmSync(file);
    expect(registryCommand(args, repoRoot).ok).toBe(false);
  });

  it('fails closed when two source clocks claim one discovery name', () => {
    const { root, args } = fixture();
    mkdirSync(join(root, 'scripts/lanes'), { recursive: true });
    writeFileSync(
      join(root, 'scripts/lanes/continuity_clock.py'),
      '    Clock("sameName", "one.yml", "one", 60, "one.json"),\n    Clock("sameName", "two.yml", "two", 60, "two.json"),\n'
    );
    expect(registryCommand(args, root).errors.join('\n')).toMatch(
      /duplicate clock name/
    );
  });

  it('requires explicit grouping for multiple clocks and rejects overlapping or stale claims', () => {
    const pending = proposed({
      trigger: { kind: 'lanes-clock', source: '.github/workflows/sweep.yml' },
    });
    const discovered = new Map([
      ['lanes-clock:eventRepair', { workflow: 'sweep.yml' }],
      ['lanes-clock:backstop', { workflow: 'sweep.yml' }],
    ]);
    expect(
      checkRegistryCoverage(inventory([pending]), discovered).join('\n')
    ).toMatch(/ambiguous workflow coverage/);
    const grouped = {
      ...pending,
      trigger: {
        ...pending.trigger,
        clocks: ['eventRepair', 'backstop'],
        groupReason: 'Two missed-event recovery paths share one bounded sweep.',
      },
    };
    expect(validateRegistry(inventory([grouped]))).toEqual([]);
    expect(checkRegistryCoverage(inventory([grouped]), discovered)).toEqual([]);
    const explicit = proposed({
      id: 'test:second-claim',
      trigger: {
        kind: 'lanes-clock',
        source: 'continuity_clock.py',
        clock: 'backstop',
      },
    });
    for (const entries of [
      [grouped, explicit],
      [explicit, grouped],
    ])
      expect(
        checkRegistryCoverage(inventory(entries), discovered).join('\n')
      ).toMatch(/registered twice/);
    expect(
      checkRegistryCoverage(
        inventory([grouped]),
        new Map([['lanes-clock:eventRepair', { workflow: 'sweep.yml' }]])
      ).join('\n')
    ).toMatch(/declared clock backstop is missing/);
    expect(
      checkRegistryCoverage(
        inventory([grouped]),
        new Map([['lanes-clock:eventRepair', { workflow: 'other.yml' }]])
      ).join('\n')
    ).toMatch(/different workflow/);
    expect(
      validateRegistry(
        inventory([
          {
            ...grouped,
            trigger: { ...grouped.trigger, clocks: ['backstop', 'backstop'] },
          },
        ])
      ).join('\n')
    ).toMatch(/distinct clock names/);
    expect(
      validateRegistry(
        inventory([
          { ...grouped, trigger: { ...grouped.trigger, groupReason: '' } },
        ])
      ).join('\n')
    ).toMatch(/groupReason/);
  });
});
