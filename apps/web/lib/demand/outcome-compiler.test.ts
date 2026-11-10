import { describe, expect, it } from 'vitest';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import {
  DEMAND_ALLOCATION_KEY,
  governDemandAllocation,
} from './allocation-governor';
import { applyOutcomeDrafts } from './outcome-allocation';
import {
  capabilityGapId,
  compilePresenceOutcome,
  supplierDigest,
} from './outcome-compiler';
import {
  type CapabilityDraft,
  type CapabilitySupplier,
  type CompileOutcomeCommand,
  PRESENCE_CURRENT_CONTRACT,
} from './outcome-contract';

const NOW = new Date('2026-10-21T00:00:00.000Z');
const BEFORE = '2026-10-20T23:00:00.000Z';
const AFTER = '2026-10-22T00:00:00.000Z';
const scope = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  subjectId: '22222222-2222-4222-8222-222222222222',
};
const otherScope = {
  ...scope,
  tenantId: '33333333-3333-4333-8333-333333333333',
};
const primitive = { id: 'profile.bio', version: 1, kind: 'fact' } as const;
const metrics = {
  informationGain: 0.8,
  correctness: 0.99,
  coverage: 0.9,
  successfulActionRate: null,
  falseMatchRate: 0.01,
  freshnessSeconds: 60,
  latencyMs: 500,
  fullyLoadedCostCents: 2,
};
function supplier(
  id = 'connected',
  overrides: Partial<CapabilitySupplier> = {}
): CapabilitySupplier {
  return {
    scope,
    primitive,
    id,
    version: 'tested-v1',
    route: 'connected_api',
    status: 'candidate',
    authorizationRef: 'account:authorized-read',
    privacy: 'approved',
    terms: 'approved',
    policyRef: 'policy:read-only',
    reviewedAt: BEFORE,
    validUntil: AFTER,
    expected: metrics,
    trialCostCents: 1,
    ...overrides,
  };
}
function command(
  overrides: Partial<CompileOutcomeCommand> = {}
): CompileOutcomeCommand {
  return {
    op: 'compile_outcome',
    scope,
    outcome: 'presence.profile-current/v1',
    demand: [
      {
        id: 'demand-1',
        observedAt: BEFORE,
        evidenceRef: 'request:authenticated',
        provenance: { kind: 'external-customer', sourceKey: 'requester-1' },
      },
    ],
    facts: [],
    suppliers: [
      supplier(),
      supplier('public', { route: 'first_party_public', trialCostCents: 3 }),
    ],
    trials: [],
    budget: {
      maxTrialCostCents: 5,
      maxConcurrentTrials: 1,
      valuePerUsefulOutcomeCents: 100,
      minCorrectness: 0.95,
      maxFalseMatchRate: 0.05,
      minCoverage: 0.5,
      maxFreshnessSeconds: 86400,
      maxLatencyMs: 2000,
    },
    ...overrides,
  };
}
const bio = (drafts: CapabilityDraft[]) =>
  drafts.find(item => item.primitive.id === primitive.id)!;
function trial(
  source: CapabilitySupplier,
  overrides: Partial<CompileOutcomeCommand['trials'][number]> = {}
): CompileOutcomeCommand['trials'][number] {
  return {
    id: 'trial-1',
    supplierDigest: supplierDigest(source),
    startedAt: BEFORE,
    completedAt: NOW.toISOString(),
    evidenceRefs: ['trial:bounded-canary'],
    realized: metrics,
    ...overrides,
  };
}
function fact(
  overrides: Partial<CompileOutcomeCommand['facts'][number]> = {}
): CompileOutcomeCommand['facts'][number] {
  return {
    scope,
    primitive,
    sourceRef: 'jovie:canonical:profile',
    supplierDigest: null,
    evidenceRef: 'observation:canonical',
    observedAt: BEFORE,
    validUntil: AFTER,
    state: 'known',
    reason: null,
    territory: null,
    match: 'verified',
    ...overrides,
  };
}
function harness() {
  const records = new Map<string, unknown>();
  const backend: CertificationRecordBackend = {
    get: async key => records.get(key) ?? null,
    setIfAbsent: async (key, value) => {
      if (records.has(key)) return false;
      records.set(key, value);
      return true;
    },
    compareAndSet: async (key, expected, next) => {
      if (records.get(key) !== expected) return false;
      records.set(key, next);
      return true;
    },
  };
  const send = (value: unknown) =>
    governDemandAllocation({
      backend,
      command: value,
      now: NOW,
      gate: {
        status: 'green',
        evaluatedAt: NOW.toISOString(),
        ref: 'cone:verified',
      },
    });
  return { records, backend, send };
}

describe('outcome → primitive → replaceable source', () => {
  it('compiles explicit fact/action requirements without a supplier list, including a non-music creator', () => {
    const drafts = compilePresenceOutcome(command({ suppliers: [] }), NOW);
    expect(drafts.map(item => item.primitive)).toEqual(
      PRESENCE_CURRENT_CONTRACT.requirements
    );
    expect(drafts.some(item => item.primitive.kind === 'action')).toBe(true);
    expect(
      drafts.every(
        item =>
          item.enabled === false &&
          item.state === 'unknown' &&
          item.decision.kind === 'no_action'
      )
    ).toBe(true);
  });
  it('reuses canonical evidence before supplier selection and reconciles an existing gap', () => {
    expect(
      bio(compilePresenceOutcome(command({ facts: [fact()] }), NOW))
    ).toBeUndefined();
    const previous = compilePresenceOutcome(command(), NOW);
    const current = bio(
      compilePresenceOutcome(command({ facts: [fact()] }), NOW, previous)
    );
    expect(current).toMatchObject({
      state: 'known',
      decision: { kind: 'reuse' },
      enabled: false,
    });
    expect(capabilityGapId(scope, primitive)).toBe(
      capabilityGapId(scope, { kind: 'fact', version: 1, id: 'profile.bio' })
    );
  });
  it('keeps multiple routes in one gap and picks the cheapest permitted experiment', () => {
    const current = bio(compilePresenceOutcome(command(), NOW));
    expect(current.suppliers).toHaveLength(2);
    expect(current.decision).toMatchObject({
      kind: 'trial',
      supplierDigest: supplierDigest(supplier()),
    });
    expect(current.suppliers[0].expected).toEqual(metrics);
  });
  it('bounds total proposed trials and cost across primitives', () => {
    const sources = PRESENCE_CURRENT_CONTRACT.requirements.map(
      (requirement, index) =>
        supplier(`supplier-${index}`, {
          primitive: requirement,
          expected: { ...metrics, successfulActionRate: 0.99 },
          trialCostCents: 3,
        })
    );
    const input = command({
      suppliers: sources,
      budget: { ...command().budget, maxConcurrentTrials: 3 },
    });
    expect(
      compilePresenceOutcome(input, NOW).filter(
        item => item.decision.kind === 'trial'
      )
    ).toHaveLength(1);
    expect(
      compilePresenceOutcome(
        { ...input, budget: { ...input.budget, maxConcurrentTrials: 0 } },
        NOW
      ).every(item => item.decision.kind === 'no_action')
    ).toBe(true);
  });
  it.each([
    { privacy: 'denied' },
    { terms: 'unknown' },
    { authorizationRef: null },
    { status: 'revoked' },
    { status: 'retired' },
    { reviewedAt: AFTER },
    { validUntil: BEFORE },
    { expected: { ...metrics, informationGain: 0 } },
    { expected: { ...metrics, fullyLoadedCostCents: 1000 } },
    { expected: { ...metrics, correctness: 0.5 } },
    { expected: { ...metrics, coverage: 0.1 } },
    { expected: { ...metrics, falseMatchRate: 0.5 } },
    { expected: { ...metrics, freshnessSeconds: 999999 } },
    { expected: { ...metrics, latencyMs: 999999 } },
    { trialCostCents: 100 },
  ] satisfies Partial<CapabilitySupplier>[])(
    'rejects an ineligible route: %j',
    overrides => {
      const current = bio(
        compilePresenceOutcome(
          command({ suppliers: [supplier('blocked', overrides)] }),
          NOW
        )
      );
      expect(current.decision.kind).toBe('no_action');
      expect(current.state).toBe('unknown');
    }
  );
  it('requires measured successful-action evidence for action suppliers', () => {
    const source = supplier('correction', {
      primitive: { id: 'profile.correction', version: 1, kind: 'action' },
    });
    const drafts = compilePresenceOutcome(
      command({ suppliers: [source] }),
      NOW
    );
    expect(
      drafts.find(item => item.primitive.kind === 'action')?.decision.kind
    ).toBe('no_action');
  });
  it('trials and promotes a newly discovered supplier under the same contract, then replaces it', () => {
    const first = supplier();
    const initial = compilePresenceOutcome(command(), NOW);
    const measured = compilePresenceOutcome(
      command({ trials: [trial(first)] }),
      NOW,
      initial
    );
    expect(bio(measured)).toMatchObject({
      enabled: false,
      decision: { kind: 'promote', supplierDigest: supplierDigest(first) },
      state: 'unknown',
    });
    expect(bio(measured).trials[0].realized).toEqual(metrics);
    const replacement = supplier('replacement', { route: 'authorized_portal' });
    const replaced = bio(
      compilePresenceOutcome(
        command({
          suppliers: [replacement],
          trials: [trial(replacement, { id: 'trial-2' })],
        }),
        NOW,
        measured
      )
    );
    expect(replaced.primitive).toEqual(primitive);
    expect(replaced.decision.supplierDigest).toBe(supplierDigest(replacement));
    expect(replaced.trials).toHaveLength(2);
    expect(
      bio(compilePresenceOutcome(command({ suppliers: [] }), NOW, [replaced]))
        .decision.kind
    ).toBe('no_action');
  });
  it('rejects or retires an unhelpful source and uses the latest realized evidence', () => {
    const source = supplier();
    const bad = trial(source, {
      id: 'trial-2',
      realized: { ...metrics, informationGain: 0, successfulActionRate: 0 },
    });
    const current = bio(
      compilePresenceOutcome(
        command({
          suppliers: [source],
          trials: [trial(source, { completedAt: BEFORE }), bad],
        }),
        NOW
      )
    );
    expect(current.decision.kind).toBe('no_action');
    expect(current.trials).toHaveLength(2);
  });
  it('does not promote stale trials or trials bound to a different tested version/policy', () => {
    const source = supplier();
    const changed = supplier('connected', { version: 'v2' });
    expect(
      bio(
        compilePresenceOutcome(
          command({ suppliers: [changed], trials: [trial(source)] }),
          NOW
        )
      ).decision.kind
    ).toBe('trial');
    expect(
      bio(
        compilePresenceOutcome(
          command({
            suppliers: [source],
            trials: [
              trial(source, {
                startedAt: '2026-10-01T00:00:00.000Z',
                completedAt: '2026-10-02T00:00:00.000Z',
              }),
            ],
          }),
          NOW
        )
      ).decision.kind
    ).toBe('no_action');
  });
  it.each([
    { state: 'revoked' },
    { state: 'partial', match: 'unverified' },
    { validUntil: BEFORE },
    { observedAt: AFTER },
    { observedAt: '2026-10-01T00:00:00.000Z' },
    { sourceRef: 'unverified-public-text' },
  ] satisfies Partial<CompileOutcomeCommand['facts'][number]>[])(
    'keeps invalid evidence unknown: %j',
    overrides => {
      expect(
        bio(compilePresenceOutcome(command({ facts: [fact(overrides)] }), NOW))
          .state
      ).toBe('unknown');
    }
  );
  it('retains license-blocked observations without guessing recording/lyrics/territory facts', () => {
    const blocked = fact({
      state: 'blocked',
      sourceRef: 'anghami:artist/1754494/album/1031120864',
      reason: 'blocked/license-rights',
      match: 'unverified',
      territory: null,
    });
    const current = bio(
      compilePresenceOutcome(command({ facts: [blocked], suppliers: [] }), NOW)
    );
    expect(current).toMatchObject({
      state: 'unknown',
      decision: { kind: 'no_action' },
      facts: [blocked],
    });
    expect(
      bio(
        compilePresenceOutcome(
          command({ facts: [fact({ state: 'partial' })] }),
          NOW
        )
      ).state
    ).toBe('partial');
  });
  it('invalidates dependent facts when a supplier is revoked or its policy changes', () => {
    const source = supplier();
    const observed = fact({
      sourceRef: 'provider:observation',
      supplierDigest: supplierDigest(source),
    });
    expect(
      bio(
        compilePresenceOutcome(
          command({ facts: [observed], suppliers: [source] }),
          NOW
        )
      )
    ).toBeUndefined();
    expect(
      bio(
        compilePresenceOutcome(
          command({
            facts: [observed],
            suppliers: [{ ...source, status: 'revoked' }],
          }),
          NOW
        )
      ).state
    ).toBe('unknown');
  });
  it('isolates tenant, subject and primitive/version/kind, without accepting unrelated evidence', () => {
    const input = command({
      facts: [fact({ scope: otherScope })],
      suppliers: [
        supplier('foreign', { scope: otherScope }),
        supplier('wrong-kind', { primitive: { ...primitive, kind: 'action' } }),
      ],
    });
    const current = bio(compilePresenceOutcome(input, NOW));
    expect(current).toMatchObject({
      state: 'unknown',
      suppliers: [],
      facts: [],
      decision: { kind: 'no_action' },
    });
    expect(capabilityGapId(scope, primitive)).not.toBe(
      capabilityGapId(otherScope, primitive)
    );
    expect(capabilityGapId(scope, primitive)).not.toBe(
      capabilityGapId({ ...scope, subjectId: otherScope.tenantId }, primitive)
    );
  });
  it('fails closed on future demand, invalid clocks, duplicate suppliers, changed receipts and trial windows', () => {
    expect(() =>
      compilePresenceOutcome(
        command({ demand: [{ ...command().demand[0], observedAt: AFTER }] }),
        NOW
      )
    ).toThrow('future-demand-evidence');
    expect(() =>
      compilePresenceOutcome(command(), new Date('invalid'))
    ).toThrow('invalid-clock');
    expect(() =>
      compilePresenceOutcome(
        command({ suppliers: [supplier(), supplier()] }),
        NOW
      )
    ).toThrow('duplicate-capability-supplier');
    const previous = compilePresenceOutcome(command(), NOW);
    expect(() =>
      compilePresenceOutcome(
        command({
          demand: [{ ...command().demand[0], evidenceRef: 'changed' }],
        }),
        NOW,
        previous
      )
    ).toThrow('capability-receipt-conflict');
    expect(() =>
      compilePresenceOutcome(
        command({ trials: [trial(supplier(), { completedAt: AFTER })] }),
        NOW
      )
    ).toThrow('invalid-capability-trial-window');
    expect(() =>
      compilePresenceOutcome({ ...command(), rawSourceText: 'restricted' }, NOW)
    ).toThrow();
  });
});

it('prefers measured lower-cost routes and deterministically breaks supplier ties', () => {
  const costly = supplier('costly');
  const cheap = supplier('cheap');
  const tie = supplier('z-last');
  const input = command({
    suppliers: [costly, tie, cheap],
    trials: [
      trial(costly, {
        id: 'costly',
        realized: { ...metrics, fullyLoadedCostCents: 5 },
      }),
      trial(tie, { id: 'tie' }),
      trial(cheap, { id: 'cheap' }),
    ],
  });
  expect(bio(compilePresenceOutcome(input, NOW)).decision.supplierDigest).toBe(
    supplierDigest(cheap)
  );
});

describe('durable disabled capability drafts in the existing governor', () => {
  it('persists one gap per primitive, dedupes retries and attaches repeated demand without vendor tickets', async () => {
    const h = harness();
    const first = await h.send(command());
    const retried = await h.send(command());
    expect(retried).toEqual(first);
    expect(h.records.size).toBe(1);
    expect(h.records.has(DEMAND_ALLOCATION_KEY)).toBe(true);
    const repeated = await h.send(
      command({
        demand: [
          {
            id: 'demand-2',
            observedAt: BEFORE,
            evidenceRef: 'request:second',
            provenance: { kind: 'founder', sourceKey: 'founder' },
          },
        ],
      })
    );
    expect(repeated.rows).toHaveLength(
      PRESENCE_CURRENT_CONTRACT.requirements.length
    );
    expect(
      repeated.rows.every(
        row =>
          row.plan.capabilityDraft?.demand.length === 2 &&
          row.decisions.at(-1)?.state === 'held'
      )
    ).toBe(true);
    await expect(
      h.send({ op: 'claim', id: first.rows[0].plan.id, worker: 'worker' })
    ).rejects.toThrow('allocation-not-ready');
    const promoted = await h.send(command({ trials: [trial(supplier())] }));
    const row = promoted.rows.find(
      item => item.plan.capabilityDraft?.primitive.id === primitive.id
    )!;
    expect(row.plan.capabilityDraft?.decision.kind).toBe('promote');
    await expect(
      h.send({ op: 'claim', id: row.plan.id, worker: 'worker' })
    ).rejects.toThrow('allocation-not-ready');
  });
  it('merges concurrent repeated demand after a lost compare-and-set', async () => {
    const h = harness();
    await h.send(command());
    await Promise.all(
      ['2', '3'].map(id =>
        h.send(
          command({ demand: [{ ...command().demand[0], id: `demand-${id}` }] })
        )
      )
    );
    const final = await h.send({ op: 'reconcile' });
    expect(
      final.rows.every(row => row.plan.capabilityDraft?.demand.length === 3)
    ).toBe(true);
  });
  it('persists separate scopes and does not let another tenant resolve or mutate a gap', async () => {
    const h = harness();
    const first = await h.send(command());
    const second = await h.send(
      command({ scope: otherScope, suppliers: [], facts: [fact()] })
    );
    expect(second.rows).toHaveLength(first.rows.length * 2);
    expect(second.rows.slice(0, first.rows.length)).toEqual(first.rows);
    expect(
      second.rows
        .slice(first.rows.length)
        .every(row => row.plan.capabilityDraft?.state === 'unknown')
    ).toBe(true);
  });
  it('preserves founder provenance and rejects capacity or gap identity conflicts', async () => {
    const h = harness();
    const founder = command({
      demand: [
        {
          ...command().demand[0],
          provenance: { kind: 'founder', sourceKey: 'founder' },
        },
      ],
    });
    const ledger = await h.send(founder);
    expect(ledger.rows[0].plan.observations[0].provenance).toMatchObject({
      kind: 'founder',
    });
    const conflict = structuredClone(ledger);
    delete conflict.rows[0].plan.capabilityDraft;
    expect(() => applyOutcomeDrafts(conflict, founder, NOW)).toThrow(
      'capability-gap-conflict'
    );
    const full = {
      ...ledger,
      rows: Array.from({ length: 200 }, (_, index) => ({
        ...ledger.rows[0],
        plan: { ...ledger.rows[0].plan, id: `existing-${index}` },
      })),
    };
    expect(() =>
      applyOutcomeDrafts(full, command({ scope: otherScope }), NOW)
    ).toThrow('capability-capacity-full');
  });
  it('rejects persistence loss, CAS contention and conflicting receipts without success or partial writes', async () => {
    const h = harness();
    await h.send(command());
    const before = h.records.get(DEMAND_ALLOCATION_KEY);
    await expect(
      h.send(
        command({
          demand: [{ ...command().demand[0], evidenceRef: 'conflict' }],
        })
      )
    ).rejects.toThrow('capability-receipt-conflict');
    expect(h.records.get(DEMAND_ALLOCATION_KEY)).toBe(before);
    h.backend.compareAndSet = async () => false;
    await expect(h.send(command({ suppliers: [] }))).rejects.toThrow(
      'compare-and-set repeatedly'
    );
    h.backend.get = async () => {
      throw new Error('database unavailable');
    };
    await expect(h.send(command())).rejects.toThrow('database unavailable');
  });
});
