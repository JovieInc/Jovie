import { describe, expect, it, vi } from 'vitest';
import type {
  SummerBottleneckRecord,
  SummerBottleneckStore,
} from '../agent/lib/summer-bottleneck-loop';
import {
  evaluateRunnerSourceAttestation,
  type GemDarkRecoveryDependencies,
  gemDarkAdmissionContext,
  loadRunnerSourceAttestationFromEnvironment,
  persistCursorRecoveryOutbox,
  RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS,
  resolveGemDarkTrigger,
  runGemDarkRecoveryCycle,
} from '../agent/lib/summer-gem-dark-recovery';

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

describe('Runner-source attestation → Gem-dark trigger (JOV-6163 bridge)', () => {
  const nowMs = Date.parse('2026-09-12T17:00:00.000Z');
  const freshObservedAt = '2026-09-12T16:55:00.000Z'; // 5 min old
  const staleObservedAt = '2026-09-12T16:49:00.000Z'; // 11 min old

  function freshReceipt(overrides: Record<string, unknown> = {}) {
    return {
      schema: 'gem-service-attestation/v1',
      sourceRevision: 'a'.repeat(40),
      observedAt: freshObservedAt,
      active: true,
      healthy: true,
      listener: { port: 4041, boundToService: true },
      ...overrides,
    };
  }

  it('accepts a fresh ≤600s attestation receipt', () => {
    const probe = evaluateRunnerSourceAttestation(freshReceipt(), nowMs);
    expect(probe).toMatchObject({
      status: 'fresh',
      sourceRevision: 'a'.repeat(40),
    });
  });

  it('rejects attestation older than 600s without weakening the gate', () => {
    const probe = evaluateRunnerSourceAttestation(
      freshReceipt({ observedAt: staleObservedAt }),
      nowMs
    );
    expect(probe).toEqual({ status: 'unavailable', reason: 'stale' });
    expect(nowMs - Date.parse(staleObservedAt)).toBeGreaterThan(
      RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS
    );
  });

  it('rejects exactly-at-boundary+1ms as stale (600s hard ceiling)', () => {
    const observedAt = new Date(
      nowMs - RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS - 1
    ).toISOString();
    const probe = evaluateRunnerSourceAttestation(
      freshReceipt({ observedAt }),
      nowMs
    );
    expect(probe).toEqual({ status: 'unavailable', reason: 'stale' });
  });

  it('triggers Gem-dark recovery when attestation is unavailable', async () => {
    const store = memoryStore();
    const trigger = resolveGemDarkTrigger({
      attestationReceipt: null,
      nowMs,
    });
    expect(trigger).toMatchObject({
      dark: true,
      reason: 'runner-source-attestation-unavailable',
    });

    const result = await runGemDarkRecoveryCycle(
      { store, isGemDark: () => trigger.dark },
      {
        objective: 'Prepare JOV-6163 publisher install packet',
        evidenceRefs: [
          'runner-source-attestation-unavailable',
          `gem-dark-trigger:${trigger.reason}`,
        ],
        idempotencyKey: 'attest-unavail-1',
      }
    );
    expect(result.status).toBe('outbox-ready');
    if (result.status !== 'outbox-ready') return;
    expect(result.outbox.destination).toBe('cursor-cloud');
    expect(result.outbox.route.selectedRoute.tuple.provider).not.toBe('gem');
  });

  it('does not enter Cursor recovery when attestation is fresh', () => {
    const trigger = resolveGemDarkTrigger({
      attestationReceipt: freshReceipt(),
      nowMs,
    });
    expect(trigger).toMatchObject({
      dark: false,
      reason: 'attestation-fresh',
    });
  });

  it('explicit SUMMER_GEM_DARK=live wins over missing attestation', () => {
    const trigger = resolveGemDarkTrigger({
      environment: { SUMMER_GEM_DARK: 'live' },
      attestationReceipt: null,
      nowMs,
    });
    expect(trigger).toMatchObject({ dark: false, reason: 'explicit-env-live' });
  });

  it('loadRunnerSourceAttestationFromEnvironment returns null for missing PATH', async () => {
    const receipt = await loadRunnerSourceAttestationFromEnvironment(
      {
        SUMMER_RUNNER_SOURCE_ATTESTATION_PATH:
          '/tmp/does-not-exist-attestation.json',
      },
      async () => {
        throw new Error('ENOENT');
      }
    );
    expect(receipt).toBeNull();
    const trigger = resolveGemDarkTrigger({
      attestationReceipt: receipt,
      nowMs,
    });
    expect(trigger).toMatchObject({
      dark: true,
      reason: 'runner-source-attestation-unavailable',
    });
  });

  it('PATH alone without loaded receipt does not spend Cursor (caller must load)', () => {
    const trigger = resolveGemDarkTrigger({
      environment: {
        SUMMER_RUNNER_SOURCE_ATTESTATION_PATH: '/tmp/attest.json',
      },
      nowMs,
    });
    expect(trigger).toMatchObject({
      dark: false,
      reason: 'unknown-fail-closed',
    });
  });

  it('inline JSON attestation drives live/dark without PATH', () => {
    const live = resolveGemDarkTrigger({
      environment: {
        SUMMER_RUNNER_SOURCE_ATTESTATION_JSON: JSON.stringify(freshReceipt()),
      },
      nowMs,
    });
    expect(live).toMatchObject({ dark: false, reason: 'attestation-fresh' });

    const dark = resolveGemDarkTrigger({
      environment: {
        SUMMER_RUNNER_SOURCE_ATTESTATION_JSON: JSON.stringify(
          freshReceipt({ observedAt: staleObservedAt })
        ),
      },
      nowMs,
    });
    expect(dark).toMatchObject({
      dark: true,
      reason: 'runner-source-attestation-unavailable',
    });
  });
});
