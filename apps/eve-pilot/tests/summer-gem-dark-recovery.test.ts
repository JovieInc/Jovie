import { describe, expect, it, vi } from 'vitest';
import {
  gemDarkAdmissionContext,
  persistCursorRecoveryOutbox,
  runGemDarkRecoveryCycle,
  type GemDarkRecoveryDependencies,
} from '../agent/lib/summer-gem-dark-recovery';
import type {
  SummerBottleneckRecord,
  SummerBottleneckStore,
} from '../agent/lib/summer-bottleneck-loop';

function memoryStore(): SummerBottleneckStore & {
  readonly records: Map<string, SummerBottleneckRecord>;
} {
  const records = new Map<string, SummerBottleneckRecord>();
  return {
    records,
    async create(pathname, record) {
      if (records.has(pathname)) return 'exists';
      records.set(pathname, record);
      return 'created';
    },
    async read(pathname) {
      return records.get(pathname) ?? null;
    },
    async list() {
      return {
        entries: [],
        hasMore: false,
        scanned: 0,
      };
    },
    async write(pathname, record) {
      records.set(pathname, record);
    },
  };
}

describe('Summer Gem-dark recovery wiring', () => {
  it('skips when Gem is live (symphony path remains authoritative)', async () => {
    const store = memoryStore();
    const result = await runGemDarkRecoveryCycle(
      { store, isGemDark: () => false },
      {
        objective: 'should not run',
        evidenceRefs: ['x'],
        idempotencyKey: 'skip-1',
      }
    );
    expect(result).toEqual({ status: 'skipped', reason: 'gem-live' });
    expect(store.records.size).toBe(0);
  });

  it('persists cursor-cloud outbox when Gem is dark (not symphony)', async () => {
    const store = memoryStore();
    const deps: GemDarkRecoveryDependencies = {
      store,
      isGemDark: () => true,
    };
    const result = await runGemDarkRecoveryCycle(deps, {
      objective: 'Prepare JOV-6163 install packet off-Gem',
      evidenceRefs: ['runner-source-attestation-unavailable'],
      idempotencyKey: 'gem-dark-wire-1',
    });

    expect(result.status).toBe('outbox-ready');
    if (result.status !== 'outbox-ready') return;
    expect(result.outbox.destination).toBe('cursor-cloud');
    expect(result.outbox.destination).not.toBe('symphony');
    expect(result.outbox.route.selectedRoute.tuple.provider).toBe(
      'cursor-cloud'
    );
    expect(result.outbox.route.selectedRoute.tuple.provider).not.toBe('gem');
    expect(result.outboxPath).toContain('cursor-recovery-outbox');
    expect(result.report.isolatedRecoveryAdmitted).toBe(true);
    expect(store.records.has(result.outboxPath)).toBe(true);
  });

  it('denies permission self-expansion without writing outbox (E4)', async () => {
    const store = memoryStore();
    const result = await runGemDarkRecoveryCycle(
      { store, isGemDark: () => true },
      {
        objective: 'expand permissions',
        evidenceRefs: ['x'],
        idempotencyKey: 'deny-expand',
        admission: { requestsPermissionSelfExpansion: true },
      }
    );
    expect(result.status).toBe('denied');
    if (result.status !== 'denied') return;
    expect(result.report.permissionSelfExpansionDenied).toBe(true);
    expect(store.records.size).toBe(0);
  });

  it('holds gem-dependent live mutation with named gap only (E4)', async () => {
    const store = memoryStore();
    const result = await runGemDarkRecoveryCycle(
      { store, isGemDark: () => true },
      {
        objective: 'restart gem service',
        evidenceRefs: ['x'],
        idempotencyKey: 'hold-live',
        admission: {
          liveOwnershipResolved: true,
          requestsGemDependentLiveMutation: true,
        },
      }
    );
    expect(result.status).toBe('held');
    if (result.status !== 'held') return;
    expect(result.report.gemDependentLiveMutationHeld).toBe(true);
    expect(result.report.namedGap).toBe(
      'gem-dependent-live-mutation-requires-gem'
    );
    expect(result.report.remainingHumanDecision).toMatch(
      /Gem restore|live-mutation|runbook/i
    );
    expect(store.records.size).toBe(0);
  });

  it('outbox persist is idempotent and rejects conflicting payloads', async () => {
    const store = memoryStore();
    const first = await runGemDarkRecoveryCycle(
      { store, isGemDark: () => true },
      {
        objective: 'same key',
        evidenceRefs: ['a'],
        idempotencyKey: 'idem-1',
        admission: gemDarkAdmissionContext(),
      }
    );
    expect(first.status).toBe('outbox-ready');
    if (first.status !== 'outbox-ready') return;

    const again = await persistCursorRecoveryOutbox(store, first.outbox);
    expect(again.created).toBe(false);

    await expect(
      persistCursorRecoveryOutbox(store, {
        ...first.outbox,
        admissionReason: 'tampered',
      })
    ).rejects.toThrow(/conflict/i);
  });

  it('launches+reconciles when launch requested and key present', async () => {
    const store = memoryStore();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            agent: { id: 'agent_wire' },
            run: { id: 'run_wire', agentId: 'agent_wire' },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'COMPLETED',
            target: { prUrl: 'https://github.com/JovieInc/Jovie/pull/1' },
          }),
          { status: 200 }
        )
      );

    const result = await runGemDarkRecoveryCycle(
      {
        store,
        isGemDark: () => true,
        cursorApiKey: 'test-key',
        repository: 'https://github.com/JovieInc/Jovie',
        fetchImpl,
        sleep: async () => undefined,
      },
      {
        objective: 'end-to-end gem-dark recovery',
        evidenceRefs: ['gem-dark'],
        idempotencyKey: 'launch-1',
        launch: true,
        timeoutMs: 5_000,
      }
    );

    expect(result.status).toBe('outbox-ready');
    if (result.status !== 'outbox-ready') return;
    expect(result.receipt?.status).toBe('completed');
    expect(result.report.remainingHumanDecision).toMatch(/Review|approve/i);
  });
});
