import { describe, expect, it, vi } from 'vitest';
import {
  ingestSummerBottleneckSnapshot,
  rankSummerBottlenecks,
  reconcileMissedSummerBottleneckEvents,
  type SummerBottleneckDependencies,
  type SummerBottleneckRecord,
  type SummerBottleneckStore,
  verifySummerBottleneckReceipt,
} from '../agent/lib/summer-bottleneck-loop';

const NOW = new Date('2026-09-02T08:00:00.000Z');
const SOURCE = 'a'.repeat(40);
const KEY = 'synthetic-summer-receipt-signing-key';

function snapshot(
  overrides: {
    eventId?: string;
    sourceVersion?: string;
    closure?: Record<string, unknown>;
    queue?: Record<string, unknown>;
    release?: Record<string, unknown>;
    runner?: Record<string, unknown>;
    ciAudit?: Record<string, unknown>;
  } = {}
) {
  return {
    schema: 'jovie.eve.summer-bottleneck-snapshot/v1',
    eventId: overrides.eventId ?? 'evt_bottleneck_0001',
    observedAt: NOW.toISOString(),
    sourceVersion: overrides.sourceVersion ?? SOURCE,
    signals: {
      closure: {
        schema: 'jovie-closure-health/v1',
        observedAt: NOW.toISOString(),
        sourceRevision: SOURCE,
        status: 'healthy',
        blockedSince: null,
        openPullRequests: 12,
        ...overrides.closure,
      },
      queue: {
        schema: 'github-merge-queue-entry/v1',
        observedAt: NOW.toISOString(),
        sourceRevision: SOURCE,
        blockedSince: null,
        eligibleCleanPrs: 0,
        queuedPrs: 0,
        ...overrides.queue,
      },
      release: {
        schema: 'jovie-controller-snapshot/v1',
        observedAt: NOW.toISOString(),
        sourceRevision: SOURCE,
        blockedSince: '2026-09-02T07:00:00.000Z',
        mainSha: SOURCE,
        productionSha: 'b'.repeat(40),
        unverifiedMerges: 3,
        ...overrides.release,
      },
      runner: {
        schema: 'symphony-lease-guard-report/v1',
        observedAt: NOW.toISOString(),
        sourceRevision: SOURCE,
        blockedSince: null,
        capacityAvailable: 2,
        queuedWork: 0,
        ...overrides.runner,
      },
      ciAudit: {
        schema: 'jovie-ci-bottleneck-audit/v1',
        observedAt: NOW.toISOString(),
        sourceRevision: SOURCE,
        classes: [
          {
            id: 'merge-group-flake-baseline-ratchet',
            state: 'open',
            blockedSince: '2026-09-02T07:59:00.000Z',
            impact: 6,
            owner: 'ci-reliability',
            handle: 'audit:merge-group-flakes',
          },
          {
            id: 'controller-cascade-coalescing',
            state: 'open',
            blockedSince: '2026-09-02T07:59:00.000Z',
            impact: 5,
            owner: 'production-controller',
            handle: 'audit:controller-cascade',
          },
          {
            id: 'auto-enroll-self-cancel-churn',
            state: 'partial',
            blockedSince: '2026-09-02T07:59:00.000Z',
            impact: 4,
            owner: 'gem',
            handle: 'PR#16976',
          },
          {
            id: 'controller-check-run-pagination-cap',
            state: 'open',
            blockedSince: '2026-09-02T07:59:00.000Z',
            impact: 3,
            owner: 'production-controller',
            handle: 'audit:check-run-pagination',
          },
          {
            id: 'obsolete-unaffected-native-lanes',
            state: 'open',
            blockedSince: '2026-09-02T07:59:00.000Z',
            impact: 2,
            owner: 'JOV-5800',
            handle: 'PR#17005',
          },
          {
            id: 'affected-only-unit-selection',
            state: 'open',
            blockedSince: '2026-09-02T07:59:00.000Z',
            impact: 1,
            owner: 'ci-risk-classifier',
            handle: 'audit:affected-only-units',
          },
        ],
        ...overrides.ciAudit,
      },
    },
  };
}

function memoryStore(records = new Map<string, SummerBottleneckRecord>()) {
  const store: SummerBottleneckStore = {
    async create(pathname, record) {
      if (records.has(pathname)) return 'exists';
      records.set(pathname, record);
      return 'created';
    },
    async read(pathname) {
      return records.get(pathname) ?? null;
    },
    async list(prefix) {
      return [...records.entries()]
        .filter(([pathname]) => pathname.startsWith(prefix))
        .map(([pathname, record]) => ({ pathname, record }));
    },
  };
  return { records, store };
}

function harness(
  store = memoryStore(),
  overrides: Partial<SummerBottleneckDependencies> = {}
) {
  const dispatchToSymphony = vi.fn(async () => ({
    handle: 'symphony:task_0001',
  }));
  const observeSymphonyOutcome = vi.fn(async () => ({
    status: 'succeeded' as const,
    detail: 'release certification recovered',
  }));
  const dependencies: SummerBottleneckDependencies = {
    dispatchToSymphony,
    now: () => NOW,
    observeSymphonyOutcome,
    receiptSigningKey: KEY,
    store: store.store,
    ...overrides,
  };
  return { ...store, dependencies, dispatchToSymphony, observeSymphonyOutcome };
}

describe('Summer bottleneck loop', () => {
  it('deterministically ranks one bottleneck by blocked time, impact, then id', () => {
    const input = snapshot({
      closure: {
        status: 'red',
        blockedSince: '2026-09-02T07:30:00.000Z',
        openPullRequests: 100,
      },
      queue: {
        blockedSince: '2026-09-02T06:00:00.000Z',
        eligibleCleanPrs: 1,
        queuedPrs: 0,
      },
      runner: {
        blockedSince: '2026-09-02T07:30:00.000Z',
        capacityAvailable: 0,
        queuedWork: 1,
      },
    });

    expect(rankSummerBottlenecks(input, NOW).map(item => item.id)).toEqual([
      'native-queue-starvation',
      'release-certification-starvation',
      'closure-health-red',
      'runner-capacity-starvation',
      'merge-group-flake-baseline-ratchet',
      'controller-cascade-coalescing',
      'auto-enroll-self-cancel-churn',
      'controller-check-run-pagination-cap',
      'obsolete-unaffected-native-lanes',
      'affected-only-unit-selection',
    ]);
  });

  it('dispatches the in-envelope release bottleneck and signs a source-bound terminal receipt', async () => {
    const proof = harness();
    const receipt = await ingestSummerBottleneckSnapshot(
      snapshot(),
      proof.dependencies
    );

    expect(receipt).toMatchObject({
      schema: 'jovie.eve.summer-bottleneck-outcome/v1',
      decision: 'symphony-succeeded',
      owner: 'Summer',
      handle: 'symphony',
      selected: { id: 'release-certification-starvation' },
      source: {
        sourceVersion: SOURCE,
        snapshotDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
      symphony: { handle: 'symphony:task_0001' },
      terminal: true,
    });
    expect(receipt.ranking).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'merge-group-flake-baseline-ratchet',
          owner: 'ci-reliability',
          handle: 'audit:merge-group-flakes',
        }),
        expect.objectContaining({ id: 'controller-cascade-coalescing' }),
        expect.objectContaining({ id: 'auto-enroll-self-cancel-churn' }),
        expect.objectContaining({ id: 'controller-check-run-pagination-cap' }),
        expect.objectContaining({ id: 'obsolete-unaffected-native-lanes' }),
        expect.objectContaining({ id: 'affected-only-unit-selection' }),
      ])
    );
    expect(verifySummerBottleneckReceipt(receipt, KEY)).toBe(true);
    expect(proof.dispatchToSymphony).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: 'jovie-symphony-repair-task/v1',
        action: 'reconcile-release-certification-starvation',
        owner: 'symphony',
        safety: 'exact-source-ci-native-queue-production-gates-remain-required',
      }),
      { idempotencyKey: expect.stringMatching(/^[a-f0-9]{64}$/u) }
    );
  });

  it('is a cheap no-op on an unchanged later cadence', async () => {
    const proof = harness();
    await ingestSummerBottleneckSnapshot(snapshot(), proof.dependencies);
    const unchanged = await ingestSummerBottleneckSnapshot(
      snapshot({ eventId: 'evt_bottleneck_0002' }),
      proof.dependencies
    );

    expect(unchanged).toMatchObject({
      decision: 'unchanged-noop',
      terminal: true,
    });
    expect(proof.dispatchToSymphony).toHaveBeenCalledTimes(1);
    expect(proof.observeSymphonyOutcome).toHaveBeenCalledTimes(1);
  });

  it('holds and escalates an out-of-envelope top bottleneck without dispatch', async () => {
    const proof = harness();
    const receipt = await ingestSummerBottleneckSnapshot(
      snapshot({
        queue: {
          blockedSince: '2026-09-02T05:00:00.000Z',
          eligibleCleanPrs: 8,
          queuedPrs: 0,
        },
      }),
      proof.dependencies
    );

    expect(receipt).toMatchObject({
      decision: 'held-out-of-envelope',
      selected: { id: 'native-queue-starvation', inEnvelope: false },
      escalation: {
        owner: 'Summer',
        handle: 'ovie-founder-review',
      },
      terminal: true,
    });
    expect(proof.dispatchToSymphony).not.toHaveBeenCalled();
  });

  it('rejects a duplicate event before a second dispatch or observation', async () => {
    const proof = harness();
    await ingestSummerBottleneckSnapshot(snapshot(), proof.dependencies);
    const duplicate = await ingestSummerBottleneckSnapshot(
      snapshot(),
      proof.dependencies
    );

    expect(duplicate).toMatchObject({
      decision: 'duplicate-replay-rejected',
      terminal: true,
    });
    expect(proof.dispatchToSymphony).toHaveBeenCalledTimes(1);
    expect(proof.observeSymphonyOutcome).toHaveBeenCalledTimes(1);
  });

  it('rejects a conflicting record at the deterministic event key', async () => {
    const shared = memoryStore();
    const proof = harness(shared);
    await ingestSummerBottleneckSnapshot(snapshot(), proof.dependencies);
    const eventPath = [...shared.records.keys()].find(path =>
      path.includes('/events/')
    );
    expect(eventPath).toBeDefined();
    shared.records.set(eventPath!, { schema: 'forged-event' });

    await expect(
      ingestSummerBottleneckSnapshot(snapshot(), proof.dependencies)
    ).rejects.toThrow('bottleneck event conflict');
  });

  it('survives restart and observes a pending dispatch without dispatching twice', async () => {
    const shared = memoryStore();
    const first = harness(shared, {
      observeSymphonyOutcome: vi.fn(async () => ({
        status: 'pending' as const,
        detail: 'running',
      })),
    });
    const pending = await ingestSummerBottleneckSnapshot(
      snapshot(),
      first.dependencies
    );
    expect(pending).toMatchObject({ decision: 'pending-symphony' });

    const restarted = harness(shared);
    const reconciled = await reconcileMissedSummerBottleneckEvents(
      restarted.dependencies
    );

    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]).toMatchObject({ decision: 'symphony-succeeded' });
    expect(restarted.dispatchToSymphony).not.toHaveBeenCalled();
    expect(restarted.observeSymphonyOutcome).toHaveBeenCalledTimes(1);
  });

  it('keeps an observation transport failure nonterminal for heartbeat recovery', async () => {
    const proof = harness(memoryStore(), {
      observeSymphonyOutcome: vi.fn(async () => {
        throw new Error('outcome source unavailable');
      }),
    });
    const receipt = await ingestSummerBottleneckSnapshot(
      snapshot(),
      proof.dependencies
    );

    expect(receipt).toMatchObject({
      decision: 'pending-observation',
      terminal: false,
    });
    expect(verifySummerBottleneckReceipt(receipt, KEY)).toBe(true);
  });

  it('records a terminal failed Symphony outcome without widening authority', async () => {
    const proof = harness(memoryStore(), {
      observeSymphonyOutcome: vi.fn(async () => ({
        status: 'failed' as const,
        detail: 'exact-head gate remained red',
      })),
    });
    const receipt = await ingestSummerBottleneckSnapshot(
      snapshot(),
      proof.dependencies
    );

    expect(receipt).toMatchObject({
      decision: 'symphony-failed',
      terminal: true,
      symphony: { detail: 'exact-head gate remained red' },
    });
  });

  it('rejects an invalid Symphony handle before persisting dispatch', async () => {
    const proof = harness(memoryStore(), {
      dispatchToSymphony: vi.fn(async () => ({ handle: 'bad' })),
    });
    await expect(
      ingestSummerBottleneckSnapshot(snapshot(), proof.dependencies)
    ).rejects.toThrow('Symphony returned an invalid handle');
  });

  it('rejects a corrupted durable claim during restart recovery', async () => {
    const shared = memoryStore();
    const failed = harness(shared, {
      dispatchToSymphony: vi.fn(async () => {
        throw new Error('dispatch unavailable');
      }),
    });
    await expect(
      ingestSummerBottleneckSnapshot(snapshot(), failed.dependencies)
    ).rejects.toThrow('dispatch unavailable');
    const claimPath = [...shared.records.keys()].find(path =>
      path.includes('/claims/')
    );
    expect(claimPath).toBeDefined();
    shared.records.set(claimPath!, { fingerprint: 'corrupted' });

    await expect(
      reconcileMissedSummerBottleneckEvents(harness(shared).dependencies)
    ).rejects.toThrow('bottleneck claim conflict');
  });

  it('accepts an atomic dispatch-receipt race only when the stored receipt is valid', async () => {
    const shared = memoryStore();
    const baseCreate = shared.store.create.bind(shared.store);
    shared.store.create = async (pathname, record) => {
      if (pathname.includes('/dispatch/')) {
        shared.records.set(pathname, record);
        return 'exists';
      }
      return baseCreate(pathname, record);
    };
    const proof = harness(shared);

    const receipt = await ingestSummerBottleneckSnapshot(
      snapshot(),
      proof.dependencies
    );
    expect(receipt).toMatchObject({ decision: 'symphony-succeeded' });
    expect(proof.dispatchToSymphony).toHaveBeenCalledTimes(1);
  });

  it('rejects a forged durable dispatch receipt during restart recovery', async () => {
    const shared = memoryStore();
    const pending = harness(shared, {
      observeSymphonyOutcome: vi.fn(async () => ({
        status: 'pending' as const,
        detail: 'running',
      })),
    });
    await ingestSummerBottleneckSnapshot(snapshot(), pending.dependencies);
    const dispatchPath = [...shared.records.keys()].find(path =>
      path.includes('/dispatch/')
    );
    expect(dispatchPath).toBeDefined();
    shared.records.set(dispatchPath!, {
      fingerprint: 'forged',
      symphony: { handle: 'symphony:forged_0001' },
    });

    await expect(
      reconcileMissedSummerBottleneckEvents(harness(shared).dependencies)
    ).rejects.toThrow('dispatch receipt is invalid');
  });

  it('reconciles one missed event after a transient dispatch failure', async () => {
    const shared = memoryStore();
    const failed = harness(shared, {
      dispatchToSymphony: vi.fn(async () => {
        throw new Error('dispatch transport unavailable');
      }),
    });
    await expect(
      ingestSummerBottleneckSnapshot(snapshot(), failed.dependencies)
    ).rejects.toThrow('dispatch transport unavailable');

    const heartbeat = harness(shared);
    const first = await reconcileMissedSummerBottleneckEvents(
      heartbeat.dependencies
    );
    const second = await reconcileMissedSummerBottleneckEvents(
      heartbeat.dependencies
    );

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ decision: 'symphony-succeeded' });
    expect(second).toEqual([]);
    expect(heartbeat.dispatchToSymphony).toHaveBeenCalledTimes(1);
  });

  it('dispatches again on a later cadence only when source-bound state changes', async () => {
    const proof = harness();
    await ingestSummerBottleneckSnapshot(snapshot(), proof.dependencies);
    await ingestSummerBottleneckSnapshot(
      snapshot({
        eventId: 'evt_bottleneck_0003',
        sourceVersion: 'c'.repeat(40),
        release: {
          sourceRevision: 'c'.repeat(40),
          mainSha: 'c'.repeat(40),
        },
      }),
      proof.dependencies
    );

    expect(proof.dispatchToSymphony).toHaveBeenCalledTimes(2);
  });

  it('returns a signed healthy no-op when no metric is blocked', async () => {
    const proof = harness();
    const baseline = snapshot();
    const receipt = await ingestSummerBottleneckSnapshot(
      snapshot({
        release: {
          blockedSince: null,
          productionSha: SOURCE,
          unverifiedMerges: 0,
        },
        ciAudit: {
          classes: baseline.signals.ciAudit.classes.map(item => ({
            ...item,
            state: 'implemented',
          })),
        },
      }),
      proof.dependencies
    );

    expect(receipt).toMatchObject({ decision: 'healthy-noop', terminal: true });
    expect(verifySummerBottleneckReceipt(receipt, KEY)).toBe(true);
    expect(proof.dispatchToSymphony).not.toHaveBeenCalled();
  });

  it.each([
    [
      'closure',
      {
        closure: {
          status: 'red',
          blockedSince: '2026-09-02T04:00:00.000Z',
          openPullRequests: 1,
        },
      },
      'closure-health-red',
    ],
    [
      'runner',
      {
        runner: {
          blockedSince: '2026-09-02T04:00:00.000Z',
          capacityAvailable: 0,
          queuedWork: 1,
        },
      },
      'runner-capacity-starvation',
    ],
    [
      'named CI class',
      {
        ciAudit: {
          classes: snapshot().signals.ciAudit.classes.map((item, index) => ({
            ...item,
            blockedSince:
              index === 0 ? '2026-09-02T04:00:00.000Z' : item.blockedSince,
          })),
        },
      },
      'merge-group-flake-baseline-ratchet',
    ],
  ])('source-binds and holds the selected %s bottleneck', async (_name, change, expectedId) => {
    const proof = harness();
    const receipt = await ingestSummerBottleneckSnapshot(
      snapshot(change),
      proof.dependencies
    );
    expect(receipt).toMatchObject({
      decision: 'held-out-of-envelope',
      selected: { id: expectedId },
    });
    expect(proof.dispatchToSymphony).not.toHaveBeenCalled();
  });

  it('skips malformed and already-terminal events during heartbeat reconciliation', async () => {
    const shared = memoryStore();
    shared.records.set('summer-bottleneck/events/a.json', {
      schema: 'malformed',
    });
    const proof = harness(shared);
    await ingestSummerBottleneckSnapshot(snapshot(), proof.dependencies);

    await expect(
      reconcileMissedSummerBottleneckEvents(proof.dependencies)
    ).resolves.toEqual([]);
  });

  it('skips forged or path-rebound event records during heartbeat reconciliation', async () => {
    const shared = memoryStore();
    shared.records.set('summer-bottleneck/events/forged.json', {
      schema: 'jovie.eve.summer-bottleneck-event/v1',
      snapshot: snapshot({ eventId: 'evt_bottleneck_forged' }),
      signature: `v1=${'0'.repeat(64)}`,
    });
    const valid = harness(shared, {
      dispatchToSymphony: vi.fn(async () => {
        throw new Error('leave valid event nonterminal');
      }),
    });
    await expect(
      ingestSummerBottleneckSnapshot(
        snapshot({ eventId: 'evt_bottleneck_rebound' }),
        valid.dependencies
      )
    ).rejects.toThrow('leave valid event nonterminal');
    const validEvent = [...shared.records.entries()].find(
      ([path]) =>
        path.includes('/events/') &&
        path !== 'summer-bottleneck/events/forged.json'
    );
    expect(validEvent).toBeDefined();
    shared.records.delete(validEvent![0]);
    shared.records.set('summer-bottleneck/events/rebound.json', validEvent![1]);

    await expect(
      reconcileMissedSummerBottleneckEvents(harness(shared).dependencies)
    ).resolves.toEqual([]);
  });

  it('rejects invalid or forged receipt signatures', () => {
    expect(verifySummerBottleneckReceipt({}, KEY)).toBe(false);
    expect(
      verifySummerBottleneckReceipt({ signature: `v1=${'0'.repeat(64)}` }, KEY)
    ).toBe(false);
    expect(
      verifySummerBottleneckReceipt({ signature: `v1=${'0'.repeat(64)}` }, '')
    ).toBe(false);
  });

  it('fails closed without receipt signing authority or a valid clock', async () => {
    const unsigned = harness(memoryStore(), { receiptSigningKey: '' });
    await expect(
      ingestSummerBottleneckSnapshot(snapshot(), unsigned.dependencies)
    ).rejects.toThrow('receipt signing key is unavailable');

    const badClock = harness(memoryStore(), { now: () => new Date('invalid') });
    await expect(
      ingestSummerBottleneckSnapshot(snapshot(), badClock.dependencies)
    ).rejects.toThrow('current clock is invalid');
  });

  it.each([
    ['stale', { observedAt: '2026-09-02T07:44:59.000Z' }],
    ['future', { observedAt: '2026-09-02T08:01:01.000Z' }],
    [
      'stale CI audit',
      {
        signals: {
          ...snapshot().signals,
          ciAudit: {
            ...snapshot().signals.ciAudit,
            observedAt: '2026-09-02T07:44:59.000Z',
          },
        },
      },
    ],
    ['unbound', { sourceVersion: 'not-a-sha' }],
  ])('fails closed for a %s source snapshot', async (_name, change) => {
    const proof = harness();
    await expect(
      ingestSummerBottleneckSnapshot(
        { ...snapshot(), ...change },
        proof.dependencies
      )
    ).rejects.toThrow();
    expect(proof.dispatchToSymphony).not.toHaveBeenCalled();
  });
});
