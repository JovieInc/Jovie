/**
 * Strict failure-case acceptance narrative for the Summer bounded-operator goal:
 * Gem down → governed dispatch selects authorized alternate → useful recovery →
 * ownership preserved → remaining human decision reported.
 *
 * The primary path is request-outcome → router launch via
 * `dispatchSummerGovernedRequest` (not an ad-hoc recovery call). Writes a durable
 * receipt under /opt/cursor/artifacts when assertions pass.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  buildGemDarkExerciseReport,
  disposeGemDarkRecovery,
} from '../agent/lib/cursor-recovery';
import type { DecisionJob } from '../agent/lib/governor-route';
import type {
  SummerBottleneckRecord,
  SummerBottleneckStore,
} from '../agent/lib/summer-bottleneck-loop';
import {
  evaluateRunnerSourceAttestation,
  RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS,
  runGemDarkRecoveryCycle,
} from '../agent/lib/summer-gem-dark-recovery';
import { dispatchSummerGovernedRequest } from '../agent/lib/summer-governed-dispatch';

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

function acceptanceDecisionJob(
  overrides: Partial<DecisionJob> = {}
): DecisionJob {
  return {
    kind: 'decision',
    id: 'acceptance-gem-down-1',
    jobClass: 'ambiguous-product-reasoning',
    riskTier: 'medium',
    objective:
      'Gem-down acceptance: prepare isolated JOV-6163 recovery artifacts',
    requiredCapabilities: ['reasoning', 'product'],
    certificationPredicate: 'source-bound-signed-rate-limited',
    authority: 'automation',
    evidenceRefs: ['acceptance:gem-down', 'jov-6163'],
    ...overrides,
  };
}

function freshReceipt(nowMs: number) {
  return {
    schema: 'gem-service-attestation/v1',
    sourceRevision: 'a'.repeat(40),
    observedAt: new Date(nowMs - 45_000).toISOString(),
    active: true,
    healthy: true,
    listener: { port: 4041, boundToService: true },
  };
}

describe('Summer bounded-operator acceptance (Gem-down narrative)', () => {
  it('proves Gem-down → governed Cursor alternate → recovery → ownership → human decision', {
    timeout: 20_000,
  }, async () => {
    const nowMs = Date.parse('2026-09-12T17:00:00.000Z');
    const store = memoryStore();

    // 1) Gem down / attestation unavailable (stale >600s, gate not weakened)
    const staleObservedAt = new Date(
      nowMs - RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS - 1
    ).toISOString();
    const staleReceipt = {
      schema: 'gem-service-attestation/v1',
      sourceRevision: 'b'.repeat(40),
      observedAt: staleObservedAt,
      active: true,
      healthy: true,
      listener: { port: 4041, boundToService: true },
    };
    const staleProbe = evaluateRunnerSourceAttestation(staleReceipt, nowMs);
    expect(staleProbe).toEqual({ status: 'unavailable', reason: 'stale' });

    // 2) Governed dispatch: request outcome → router launch (primary path)
    const gemDownDispatch = dispatchSummerGovernedRequest({
      decisionJob: acceptanceDecisionJob(),
      attestationReceipt: staleReceipt,
      nowMs,
    });
    expect(gemDownDispatch.outcome).toBe('cursor-recovery-request');
    if (gemDownDispatch.outcome !== 'cursor-recovery-request') return;
    expect(gemDownDispatch.trigger).toMatchObject({
      dark: true,
      reason: 'runner-source-attestation-unavailable',
    });
    expect(gemDownDispatch.route.selectedRoute.tuple.provider).toBe(
      'cursor-cloud'
    );
    expect(gemDownDispatch.route.selectedRoute.tuple.provider).not.toBe('gem');
    expect(gemDownDispatch.route.selectedRoute.tuple.provider).not.toBe(
      'symphony'
    );
    expect(gemDownDispatch.recoveryJobId).toContain('cursor-recovery:');

    // Hold when no probe is configured — no accidental Cursor spend
    const holdDispatch = dispatchSummerGovernedRequest({
      decisionJob: acceptanceDecisionJob({ id: 'acceptance-hold' }),
      nowMs,
    });
    expect(holdDispatch.outcome).toBe('hold');
    if (holdDispatch.outcome === 'hold') {
      expect(holdDispatch.trigger.reason).toBe('unknown-fail-closed');
      expect(holdDispatch.remainingHumanDecision).toMatch(
        /SUMMER_RUNNER_SOURCE_ATTESTATION|SUMMER_GEM_DARK/i
      );
    }

    // Fresh attestation keeps Symphony authoritative (not Cursor recovery)
    const symphonyDispatch = dispatchSummerGovernedRequest({
      decisionJob: acceptanceDecisionJob({ id: 'acceptance-fresh' }),
      attestationReceipt: freshReceipt(nowMs),
      nowMs,
    });
    expect(symphonyDispatch.outcome).toBe('symphony-route');
    if (symphonyDispatch.outcome === 'symphony-route') {
      expect(symphonyDispatch.trigger.reason).toBe('attestation-fresh');
      expect(symphonyDispatch.route.selectedRoute.tuple.provider).not.toBe(
        'cursor-cloud'
      );
    }

    // 3) Useful recovery: durable Cursor outbox launched from governed outcome
    const recovery = await runGemDarkRecoveryCycle(
      { store, isGemDark: () => true },
      {
        objective: gemDownDispatch.trigger.reason
          ? `Gem-down acceptance via governed dispatch (${gemDownDispatch.trigger.reason})`
          : 'Gem-down acceptance via governed dispatch',
        evidenceRefs: [
          'acceptance:gem-down',
          'runner-source-attestation-unavailable',
          `governed-dispatch:${gemDownDispatch.outcome}`,
          `recovery-job:${gemDownDispatch.recoveryJobId}`,
          `gem-dark-trigger:${gemDownDispatch.trigger.reason}`,
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
        'governed-dispatch-authorized-alternate',
        'useful-recovery',
        'ownership-preserved',
        'remaining-human-decision-reported',
      ],
      steps: {
        gemDown: {
          attestation: staleProbe,
        },
        governedDispatch: {
          gemDown: {
            outcome: gemDownDispatch.outcome,
            trigger: gemDownDispatch.trigger.reason,
            provider: gemDownDispatch.route.selectedRoute.tuple.provider,
            recoveryJobId: gemDownDispatch.recoveryJobId,
          },
          holdWithoutProbe: {
            outcome: holdDispatch.outcome,
            trigger: holdDispatch.trigger.reason,
          },
          freshKeepsSymphony: {
            outcome: symphonyDispatch.outcome,
            trigger: symphonyDispatch.trigger.reason,
          },
        },
        usefulRecovery: {
          status: recovery.status,
          outboxPath: recovery.outboxPath,
          destination: recovery.outbox.destination,
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
        recoveryNeverRoutedToGem: true,
        holdPreventsAccidentalCursorSpend: holdDispatch.outcome === 'hold',
      },
      e1External: true,
      e1Note:
        'Gem install of PR #17725 attestation publisher + two ≤600s observations still required',
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
