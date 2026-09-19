import { describe, expect, it, vi } from 'vitest';
import {
  assertRecoveryAdmission,
  buildCursorRecoveryOutbox,
  buildGemDarkExerciseReport,
  CURSOR_CLOUD_RECOVERY_ROUTE,
  createIsolatedRecoveryJob,
  disposeGemDarkRecovery,
  launchCursorRecoveryAgent,
  RecoveryAdmissionDeniedError,
  reconcileCursorRecoveryRun,
  requestCursorIsolatedRecovery,
  routeIsolatedRecoveryJob,
} from '../agent/lib/cursor-recovery';

describe('Summer Cursor recovery lane (E3/E4)', () => {
  const gemDarkContext = {
    gemDark: true,
    preauthorizedRecovery: false,
    liveOwnershipResolved: false,
    requestsLiveMutationOrTakeover: false,
  };

  it('routes isolated recovery to Cursor Cloud when Gem is dark (E3)', () => {
    const job = createIsolatedRecoveryJob({
      id: 'rec-1',
      objective: 'Prepare attestation publisher install packet',
      evidenceRefs: ['JOV-6163', 'PR#17725'],
    });
    const receipt = routeIsolatedRecoveryJob(job, gemDarkContext);
    expect(receipt.selectedRoute.id).toBe(CURSOR_CLOUD_RECOVERY_ROUTE.id);
    expect(receipt.selectedRoute.tuple.provider).toBe('cursor-cloud');
    expect(receipt.selectedRoute.tuple.provider).not.toBe('gem');
  });

  it('writes cursor-cloud outbox and never symphony/gem (runtime wiring contract)', () => {
    const job = createIsolatedRecoveryJob({
      id: 'rec-outbox',
      objective: 'Gem-dark isolated recovery',
      evidenceRefs: ['gem-liveness:dark'],
    });
    const outbox = buildCursorRecoveryOutbox({
      job,
      context: gemDarkContext,
      idempotencyKey: 'gem-dark-rec-outbox',
    });
    expect(outbox.destination).toBe('cursor-cloud');
    expect(outbox.destination).not.toBe('symphony');
    expect(outbox.route.selectedRoute.tuple.provider).toBe('cursor-cloud');
    expect(outbox.status).toBe('ready');
  });

  it('denies live takeover without ownership (E4)', () => {
    expect(() =>
      assertRecoveryAdmission({
        gemDark: true,
        preauthorizedRecovery: true,
        liveOwnershipResolved: false,
        requestsLiveMutationOrTakeover: true,
      })
    ).toThrow(RecoveryAdmissionDeniedError);
  });

  it('denies Cursor recovery when Gem is available without preauth grant', () => {
    expect(() =>
      assertRecoveryAdmission({
        gemDark: false,
        preauthorizedRecovery: false,
        liveOwnershipResolved: true,
        requestsLiveMutationOrTakeover: false,
      })
    ).toThrow(/recovery grant|Gem dark/i);
  });

  it('denies permission self-expansion (E4)', () => {
    const disposition = disposeGemDarkRecovery({
      ...gemDarkContext,
      requestsPermissionSelfExpansion: true,
    });
    expect(disposition).toMatchObject({
      status: 'deny',
      code: 'permission-self-expansion',
    });
    const report = buildGemDarkExerciseReport({ disposition });
    expect(report.permissionSelfExpansionDenied).toBe(true);
    expect(report.isolatedRecoveryAdmitted).toBe(false);
    expect(report.remainingHumanDecision).toMatch(
      /Blocked|authorize|restore Gem/i
    );
  });

  it('does not duplicate uncertain live jobs (E4)', () => {
    const disposition = disposeGemDarkRecovery({
      ...gemDarkContext,
      uncertainLiveJobIds: ['live-job-1'],
      requestsLiveMutationOrTakeover: true,
    });
    expect(disposition).toMatchObject({
      status: 'deny',
      code: 'uncertain-live-job-duplication',
    });
    const report = buildGemDarkExerciseReport({ disposition });
    expect(report.uncertainLiveJobDuplicated).toBe(false);
  });

  it('holds Gem-dependent live mutation with named gap (E4)', () => {
    const disposition = disposeGemDarkRecovery({
      ...gemDarkContext,
      liveOwnershipResolved: true,
      requestsGemDependentLiveMutation: true,
    });
    expect(disposition).toMatchObject({
      status: 'hold',
      namedGap: 'gem-dependent-live-mutation-requires-gem',
    });
    const report = buildGemDarkExerciseReport({ disposition });
    expect(report.gemDependentLiveMutationHeld).toBe(true);
    expect(report.namedGap).toBe('gem-dependent-live-mutation-requires-gem');
    expect(report.remainingHumanDecision).toMatch(/Gem restore|live-mutation/i);
    expect(report).not.toHaveProperty('nextActions');
  });

  it('admits isolated recovery while uncertain live jobs remain untouched (E4)', () => {
    const disposition = disposeGemDarkRecovery({
      ...gemDarkContext,
      uncertainLiveJobIds: ['live-job-1'],
      requestsLiveMutationOrTakeover: false,
    });
    expect(disposition.status).toBe('admit');
    const report = buildGemDarkExerciseReport({ disposition });
    expect(report.isolatedRecoveryAdmitted).toBe(true);
    expect(report.uncertainLiveJobDuplicated).toBe(false);
  });

  it('launches and reconciles to a terminal receipt with artifact (E3)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            agent: { id: 'agent_1' },
            run: { id: 'run_1', agentId: 'agent_1' },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'COMPLETED',
            target: { prUrl: 'https://github.com/JovieInc/Jovie/pull/99999' },
          }),
          { status: 200 }
        )
      );

    const launch = await launchCursorRecoveryAgent({
      cursorApiKey: 'test-key',
      prompt: 'prepare repair PR',
      repository: 'https://github.com/JovieInc/Jovie',
      fetchImpl,
    });
    expect(launch).toEqual({ agentId: 'agent_1', runId: 'run_1' });

    const receipt = await reconcileCursorRecoveryRun({
      cursorApiKey: 'test-key',
      agentId: launch.agentId,
      runId: launch.runId,
      jobId: 'rec-1',
      routeId: CURSOR_CLOUD_RECOVERY_ROUTE.id,
      timeoutMs: 5_000,
      fetchImpl,
      pollIntervalMs: 1,
    });
    expect(receipt.status).toBe('completed');
    expect(receipt.artifactUrl).toContain('pull/99999');
    expect(receipt.remainingHumanDecision).toMatch(/Review|approve/i);
  });

  it('requires launch+reconcile for end-to-end recovery request (E3/E4)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            agent: { id: 'agent_2' },
            run: { id: 'run_2', agentId: 'agent_2' },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'FINISHED',
            target: { url: 'https://cursor.com/agents/agent_2' },
          }),
          { status: 200 }
        )
      );

    const job = createIsolatedRecoveryJob({
      id: 'rec-2',
      objective: 'Diagnose Gem dark and prepare isolated repair',
      evidenceRefs: ['controller-liveness:dark'],
    });

    const result = await requestCursorIsolatedRecovery({
      job,
      context: gemDarkContext,
      cursorApiKey: 'test-key',
      repository: 'https://github.com/JovieInc/Jovie',
      timeoutMs: 5_000,
      fetchImpl,
      sleep: async () => undefined,
    });

    expect(result.route.selectedRoute.tuple.provider).toBe('cursor-cloud');
    expect(result.launch.agentId).toBe('agent_2');
    expect(result.receipt.status).toBe('completed');
    expect(result.receipt.runId).toBe('run_2');
  });
});
