import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  checkAutomationProposal,
  discoverScheduledAutomations,
  loadRegistry,
  REGISTRY_SCHEMA,
  validateRegistry,
} from '../automation-registry.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const registry = loadRegistry(repoRoot);
describe('pre-create automation admission', () => {
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
});
