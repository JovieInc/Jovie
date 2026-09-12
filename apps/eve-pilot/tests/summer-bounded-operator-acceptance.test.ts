/**
 * Strict failure-case acceptance narrative for the Summer bounded-operator goal:
 * Gem down → authorized alternate route → useful recovery → ownership preserved
 * → remaining human decision reported.
 *
 * Writes a durable receipt under /opt/cursor/artifacts when assertions pass.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  buildGemDarkExerciseReport,
  disposeGemDarkRecovery,
} from '../agent/lib/cursor-recovery';
import type {
  SummerBottleneckRecord,
  SummerBottleneckStore,
} from '../agent/lib/summer-bottleneck-loop';
import {
  evaluateRunnerSourceAttestation,
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
      return { entries: [], hasMore: false, scanned: 0 };
    },
    async write(pathname, record) {
      records.set(pathname, record);
    },
  };
}

describe('Summer bounded-operator acceptance (Gem-down narrative)', () => {
  it('proves Gem-down → Cursor alternate → recovery → ownership → human decision', async () => {
    const nowMs = Date.parse('2026-09-12T17:00:00.000Z');
    const store = memoryStore();

    // 1) Gem down / attestation unavailable (stale >600s, gate not weakened)
    const staleObservedAt = new Date(
      nowMs - RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS - 1
    ).toISOString();
    const staleProbe = evaluateRunnerSourceAttestation(
      {
        schema: 'gem-service-attestation/v1',
        sourceRevision: 'b'.repeat(40),
        observedAt: staleObservedAt,
        active: true,
        healthy: true,
        listener: { port: 4041, boundToService: true },
      },
      nowMs
    );
    expect(staleProbe).toEqual({ status: 'unavailable', reason: 'stale' });

    const trigger = resolveGemDarkTrigger({
      attestationReceipt: null,
      nowMs,
    });
    expect(trigger).toMatchObject({
      dark: true,
      reason: 'runner-source-attestation-unavailable',
    });

    // 2) Authorized alternate route: Cursor cloud outbox (never gem/symphony)
    const recovery = await runGemDarkRecoveryCycle(
      { store, isGemDark: () => trigger.dark },
      {
        objective:
          'Gem-down acceptance: prepare isolated JOV-6163 recovery artifacts',
        evidenceRefs: [
          'acceptance:gem-down',
          'runner-source-attestation-unavailable',
          `gem-dark-trigger:${trigger.reason}`,
        ],
        idempotencyKey: 'acceptance-gem-down-1',
      }
    );
    expect(recovery.status).toBe('outbox-ready');
    if (recovery.status !== 'outbox-ready') return;
    expect(recovery.outbox.destination).toBe('cursor-cloud');
    expect(recovery.outbox.route.selectedRoute.tuple.provider).toBe(
      'cursor-cloud'
    );
    expect(recovery.outbox.route.selectedRoute.tuple.provider).not.toBe('gem');
    expect(recovery.report.isolatedRecoveryAdmitted).toBe(true);

    // 3) Useful recovery surface exists (durable outbox record)
    expect(store.records.has(recovery.outboxPath)).toBe(true);

    // 4) Ownership preserved — deny live takeover / self-expansion; hold gem-live mutation
    const takeoverDenied = disposeGemDarkRecovery({
      gemDark: true,
      preauthorizedRecovery: false,
      liveOwnershipResolved: false,
      requestsLiveMutationOrTakeover: true,
      uncertainLiveJobIds: ['live-owned-job-1'],
    });
    expect(takeoverDenied.status).toBe('deny');
    const takeoverReport = buildGemDarkExerciseReport({
      disposition: takeoverDenied,
    });
    expect(takeoverReport.uncertainLiveJobDuplicated).toBe(false);
    expect(takeoverReport.isolatedRecoveryAdmitted).toBe(false);

    const expansionDenied = await runGemDarkRecoveryCycle(
      { store: memoryStore(), isGemDark: () => true },
      {
        objective: 'expand permissions',
        evidenceRefs: ['acceptance:ownership'],
        idempotencyKey: 'acceptance-deny-expand',
        admission: { requestsPermissionSelfExpansion: true },
      }
    );
    expect(expansionDenied.status).toBe('denied');
    if (expansionDenied.status === 'denied') {
      expect(expansionDenied.report.permissionSelfExpansionDenied).toBe(true);
    }

    const liveHold = await runGemDarkRecoveryCycle(
      { store: memoryStore(), isGemDark: () => true },
      {
        objective: 'restart gem service',
        evidenceRefs: ['acceptance:ownership'],
        idempotencyKey: 'acceptance-hold-live',
        admission: {
          liveOwnershipResolved: true,
          requestsGemDependentLiveMutation: true,
        },
      }
    );
    expect(liveHold.status).toBe('held');
    if (liveHold.status === 'held') {
      expect(liveHold.report.namedGap).toBe(
        'gem-dependent-live-mutation-requires-gem'
      );
    }

    // 5) Remaining human decision reported (only)
    expect(recovery.report.remainingHumanDecision).toMatch(/Review|approve/i);
    expect(takeoverReport.remainingHumanDecision.length).toBeGreaterThan(0);
    if (liveHold.status === 'held') {
      expect(liveHold.report.remainingHumanDecision).toMatch(
        /Gem restore|live-mutation/i
      );
    }

    const receipt = {
      schema: 'jovie.summer.bounded-operator-acceptance/v1',
      observedAt: new Date().toISOString(),
      narrative: [
        'gem-down',
        'authorized-alternate-route',
        'useful-recovery',
        'ownership-preserved',
        'remaining-human-decision-reported',
      ],
      steps: {
        gemDown: {
          attestation: staleProbe,
          trigger,
        },
        authorizedAlternateRoute: {
          destination: recovery.outbox.destination,
          provider: recovery.outbox.route.selectedRoute.tuple.provider,
        },
        usefulRecovery: {
          status: recovery.status,
          outboxPath: recovery.outboxPath,
          isolatedRecoveryAdmitted: recovery.report.isolatedRecoveryAdmitted,
        },
        ownershipPreserved: {
          takeoverDenied: takeoverDenied.status,
          uncertainLiveJobDuplicated: takeoverReport.uncertainLiveJobDuplicated,
          permissionSelfExpansionDenied:
            expansionDenied.status === 'denied'
              ? expansionDenied.report.permissionSelfExpansionDenied
              : false,
          gemDependentLiveMutationHeld:
            liveHold.status === 'held'
              ? liveHold.report.gemDependentLiveMutationHeld
              : false,
          namedGap:
            liveHold.status === 'held' ? liveHold.report.namedGap : undefined,
        },
        remainingHumanDecision: {
          recovery: recovery.report.remainingHumanDecision,
          takeover: takeoverReport.remainingHumanDecision,
          liveHold:
            liveHold.status === 'held'
              ? liveHold.report.remainingHumanDecision
              : undefined,
        },
      },
      invariants: {
        attestationMaxAgeMs: RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS,
        weakened600sGate: false,
        privilegedGbrainWrite: false,
        symphonyHeal: false,
      },
      e1External: true,
      result: 'PASS',
    };

    await mkdir('/opt/cursor/artifacts', { recursive: true });
    await writeFile(
      '/opt/cursor/artifacts/summer-bounded-operator-acceptance-receipt.json',
      `${JSON.stringify(receipt, null, 2)}\n`,
      'utf8'
    );
  });
});
