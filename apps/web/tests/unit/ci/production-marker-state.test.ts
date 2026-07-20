import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classifyProductionMarkerEvidence,
  normalizeProductionJobs,
} from '../../../../../.github/scripts/production-marker-state.mjs';

const sha = 'a'.repeat(40);
const repo = 'jovylabs/jovie';
const workflowId = 123;
const controllerRun = 456;
const testDir = dirname(fileURLToPath(import.meta.url));
const liveFixturePath = resolve(
  testDir,
  'fixtures/production-controller-run-live-shape.json'
);

function run(attempt: number, status: string, conclusion: string | null) {
  return {
    id: controllerRun,
    run_attempt: attempt,
    workflow_id: workflowId,
    path: '.github/workflows/production-controller.yml',
    head_sha: sha,
    head_branch: 'main',
    head_repository: { full_name: repo },
    event: 'workflow_run',
    status,
    conclusion,
  };
}

function job(
  name: string,
  attempt: number,
  status: string,
  conclusion: string | null
) {
  return {
    id: attempt * 1000 + name.length,
    name,
    run_id: controllerRun,
    run_attempt: attempt,
    head_sha: sha,
    head_branch: 'main',
    status,
    conclusion,
  };
}

function primaryMarker(
  status: string,
  conclusion: string | null,
  rollback = job(
    'Production Release / Centralized production rollback',
    1,
    'completed',
    'skipped'
  )
) {
  return {
    artifact: {
      id: 11,
      name: `production-generation-verified-${sha}`,
      expired: false,
      workflowRunId: controllerRun,
    },
    payload: {
      sha,
      deploymentId: 'dpl_primary123',
      controllerRun: String(controllerRun),
      controllerAttempt: '1',
    },
    attemptRun: run(1, status, conclusion),
    attemptJobs: [
      job(
        'Production Verified',
        1,
        status === 'completed' ? 'completed' : status,
        conclusion === 'success' ? 'success' : conclusion
      ),
      rollback,
    ],
  };
}

function recoveryMarker(status: string, conclusion: string | null) {
  return {
    artifact: {
      id: 12,
      name: `production-generation-verified-recovery-${sha}`,
      expired: false,
      workflowRunId: controllerRun,
    },
    payload: {
      sha,
      deploymentId: 'dpl_recovery123',
      controllerRun: String(controllerRun),
      controllerAttempt: '2',
    },
    attemptRun: run(2, status, conclusion),
    attemptJobs: [job('Production Verified', 2, status, conclusion)],
  };
}

function recoveryLease() {
  return {
    artifact: {
      id: 13,
      name: `production-generation-recovery-${sha}`,
      expired: false,
      workflowRunId: controllerRun,
    },
    payload: {
      sha,
      controllerRun: String(controllerRun),
      controllerAttempt: '2',
    },
  };
}

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    sha,
    repo,
    controllerWorkflowId: workflowId,
    markers: [primaryMarker('completed', 'cancelled')],
    recoveryArtifacts: [],
    latestRun: run(1, 'completed', 'cancelled'),
    ...overrides,
  };
}

describe('production marker attempt state', () => {
  it('classifies the recorded live REST attempt and exact job display names', () => {
    const fixture = JSON.parse(readFileSync(liveFixturePath, 'utf8'));
    const liveRun = fixture.run;
    const allJobs = normalizeProductionJobs(fixture.exact_attempt_jobs);
    const relevantJobs = allJobs.filter((entry: { name: string }) =>
      [
        'Production Release / Centralized production rollback',
        'Production Verified',
      ].includes(entry.name)
    );
    const result = classifyProductionMarkerEvidence({
      sha: liveRun.head_sha,
      repo: liveRun.head_repository.full_name,
      controllerWorkflowId: fixture.workflow.id,
      markers: [
        {
          artifact: {
            id: 999,
            name: `production-generation-verified-${liveRun.head_sha}`,
            expired: false,
            workflowRunId: liveRun.id,
          },
          payload: {
            sha: liveRun.head_sha,
            deploymentId: 'dpl_recorded123',
            controllerRun: String(liveRun.id),
            controllerAttempt: String(liveRun.run_attempt),
          },
          attemptRun: liveRun,
          attemptJobs: allJobs,
        },
      ],
      recoveryArtifacts: [],
      latestRun: liveRun,
    });

    expect(allJobs).toHaveLength(17);
    expect(relevantJobs.map((entry: { name: string }) => entry.name)).toEqual([
      'Production Release / Centralized production rollback',
      'Production Verified',
    ]);
    expect(result).toMatchObject({
      state: 'recovery_available',
      reason: 'one_interrupted_marker_safe_to_rerun',
    });
  });

  it('fails closed on incomplete or malformed exact-attempt job listings', () => {
    const fixture = JSON.parse(readFileSync(liveFixturePath, 'utf8'));
    expect(() =>
      normalizeProductionJobs({
        ...fixture.exact_attempt_jobs,
        total_count: fixture.exact_attempt_jobs.total_count + 1,
      })
    ).toThrow('Incomplete exact-attempt jobs listing');

    const malformed = structuredClone(fixture.exact_attempt_jobs);
    delete malformed.jobs[0].id;
    expect(() => normalizeProductionJobs(malformed)).toThrow(
      'Incomplete exact-attempt jobs listing'
    );
  });

  it('keeps a successful attempt-1 marker authoritative while latest attempt 2 is active', () => {
    const result = classifyProductionMarkerEvidence(
      evidence({
        markers: [primaryMarker('completed', 'success')],
        latestRun: run(2, 'in_progress', null),
      })
    );

    expect(result).toMatchObject({
      state: 'verified',
      controllerAttempt: 1,
    });
  });

  it('authorizes one full rerun only for one safe interrupted primary marker', () => {
    expect(classifyProductionMarkerEvidence(evidence())).toMatchObject({
      state: 'recovery_available',
      reason: 'one_interrupted_marker_safe_to_rerun',
      controllerAttempt: 1,
    });

    expect(
      classifyProductionMarkerEvidence(
        evidence({
          latestRun: run(2, 'in_progress', null),
          actor: { runId: controllerRun, attempt: 2 },
        })
      )
    ).toMatchObject({
      state: 'recovery_available',
      reason: 'current_recovery_attempt_requires_lease',
    });
  });

  it('treats an exhausted lease as manual and an active leased attempt as pending', () => {
    const lease = recoveryLease();
    expect(
      classifyProductionMarkerEvidence(
        evidence({
          recoveryArtifacts: [lease.artifact],
          recoveryPayload: lease.payload,
          recoveryAttemptRun: run(2, 'completed', 'failure'),
        })
      )
    ).toMatchObject({ state: 'manual', reason: 'recovery_lease_consumed' });

    expect(
      classifyProductionMarkerEvidence(
        evidence({
          recoveryArtifacts: [lease.artifact],
          recoveryPayload: lease.payload,
          recoveryAttemptRun: run(2, 'in_progress', null),
        })
      )
    ).toMatchObject({ state: 'pending', controllerAttempt: 2 });
  });

  it.each([
    ['missing', []],
    [
      'duplicate',
      [
        job(
          'Production Release / Centralized production rollback',
          1,
          'completed',
          'skipped'
        ),
        job(
          'Other / Centralized production rollback',
          1,
          'completed',
          'skipped'
        ),
      ],
    ],
    [
      'wrong attempt',
      [
        {
          ...job(
            'Production Release / Centralized production rollback',
            1,
            'completed',
            'skipped'
          ),
          run_attempt: 2,
        },
      ],
    ],
    [
      'wrong run',
      [
        {
          ...job(
            'Production Release / Centralized production rollback',
            1,
            'completed',
            'skipped'
          ),
          run_id: controllerRun + 1,
        },
      ],
    ],
    [
      'wrong head',
      [
        {
          ...job(
            'Production Release / Centralized production rollback',
            1,
            'completed',
            'skipped'
          ),
          head_sha: 'b'.repeat(40),
        },
      ],
    ],
    [
      'queued',
      [
        job(
          'Production Release / Centralized production rollback',
          1,
          'queued',
          null
        ),
      ],
    ],
    [
      'not skipped',
      [
        job(
          'Production Release / Centralized production rollback',
          1,
          'completed',
          'success'
        ),
      ],
    ],
  ])('fails closed for %s rollback evidence', (_name, rollbacks) => {
    const marker = primaryMarker('completed', 'cancelled');
    marker.attemptJobs = [
      job('Production Verified', 1, 'completed', 'cancelled'),
      ...rollbacks,
    ];
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'unsafe_or_contradictory_rollback',
    });
  });

  it('rejects marker payload, artifact, run, and attempt mismatches', () => {
    const marker = primaryMarker('completed', 'cancelled');
    marker.payload.controllerRun = String(controllerRun + 1);
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({ state: 'manual' });

    const wrongAttempt = primaryMarker('completed', 'cancelled');
    wrongAttempt.payload.controllerAttempt = '2';
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [wrongAttempt] }))
    ).toMatchObject({ state: 'manual' });

    const wrongArtifact = primaryMarker('completed', 'cancelled');
    wrongArtifact.artifact.workflowRunId = controllerRun + 1;
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [wrongArtifact] }))
    ).toMatchObject({ state: 'manual' });

    const missingJobId = primaryMarker('completed', 'cancelled');
    delete (missingJobId.attemptJobs[0] as { id?: number }).id;
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [missingJobId] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'contradictory_verified_job',
    });
  });

  it('preserves immutable primary evidence and verifies a distinct leased recovery marker', () => {
    const lease = recoveryLease();
    const result = classifyProductionMarkerEvidence(
      evidence({
        markers: [
          primaryMarker('completed', 'cancelled'),
          recoveryMarker('completed', 'success'),
        ],
        recoveryArtifacts: [lease.artifact],
        recoveryPayload: lease.payload,
        recoveryAttemptRun: run(2, 'completed', 'success'),
      })
    );
    expect(result).toMatchObject({
      state: 'verified',
      reason: 'exact_recovery_attempt_verified',
      controllerAttempt: 2,
    });
  });

  it('rejects any recovery evidence after a successful primary marker', () => {
    const lease = recoveryLease();
    expect(
      classifyProductionMarkerEvidence(
        evidence({
          markers: [primaryMarker('completed', 'success')],
          recoveryArtifacts: [lease.artifact],
          recoveryPayload: lease.payload,
          recoveryAttemptRun: run(2, 'in_progress', null),
        })
      )
    ).toMatchObject({
      state: 'manual',
      reason: 'recovery_evidence_after_verified_primary',
    });

    expect(
      classifyProductionMarkerEvidence(
        evidence({
          markers: [
            primaryMarker('completed', 'success'),
            recoveryMarker('in_progress', null),
          ],
        })
      )
    ).toMatchObject({ state: 'manual' });
  });
});
