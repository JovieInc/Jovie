import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyProducerCoalescence,
  classifyProductionMarkerEvidence,
  normalizeProductionJobs,
  selectNewerControllerRun,
} from '../../../../../.github/scripts/production-marker-state.mjs';

const processRunner = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  spawnSync: processRunner,
  default: { spawnSync: processRunner },
}));

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
  const normalRerunMarker = () => ({
    ...recoveryMarker('completed', 'success'),
    artifact: { ...primaryMarker('completed', 'success').artifact },
  });

  it.each([
    'success',
    'pending',
    'api-unavailable',
    'wrong-archive',
    'incomplete-jobs',
  ])('executes the production reader CLI with %s retry evidence', async failureMode => {
    const marker = normalRerunMarker();
    if (failureMode === 'pending') {
      marker.attemptRun.status = 'in_progress';
      marker.attemptRun.conclusion = null;
      marker.attemptJobs[0].status = 'in_progress';
      marker.attemptJobs[0].conclusion = null;
    }
    const calls: string[] = [];
    processRunner.mockImplementation((command: string, args: string[]) => {
      const endpoint = args[1];
      calls.push(`${command} ${args.join(' ')}`);
      let output: string | Buffer;
      if (failureMode === 'api-unavailable')
        return { status: 1, stderr: 'producer unavailable' };
      if (command === 'unzip') {
        output =
          args[0] === '-Z1'
            ? failureMode === 'wrong-archive'
              ? 'unexpected.json\n'
              : 'production-generation-verified.json\n'
            : JSON.stringify(marker.payload);
      } else if (command === 'gh' && args[0] === 'api') {
        if (endpoint.endsWith('/zip')) output = Buffer.from('archive');
        else if (endpoint.includes('/artifacts?'))
          output = JSON.stringify({
            total_count: endpoint.includes(
              `name=production-generation-verified-${sha}&`
            )
              ? 1
              : 0,
            artifacts: endpoint.includes(
              `name=production-generation-verified-${sha}&`
            )
              ? [{ ...marker.artifact, workflow_run: { id: controllerRun } }]
              : [],
          });
        else if (endpoint.endsWith('/attempts/2'))
          output = JSON.stringify(marker.attemptRun);
        else if (endpoint.endsWith('/attempts/2/jobs?per_page=100'))
          output = JSON.stringify({
            total_count: failureMode === 'incomplete-jobs' ? 2 : 1,
            jobs: marker.attemptJobs,
          });
        else throw new Error(`unexpected endpoint ${endpoint}`);
      } else throw new Error(`unexpected command ${command}`);
      return { status: 0, stdout: output, stderr: '' };
    });
    const argv = process.argv;
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    try {
      process.argv = [
        process.execPath,
        resolve(
          testDir,
          '../../../../../.github/scripts/production-marker-state.mjs'
        ),
        '--sha',
        sha,
        '--repo',
        repo,
        '--controller-workflow-id',
        String(workflowId),
      ];
      vi.resetModules();
      await import(
        '../../../../../.github/scripts/production-marker-state.mjs'
      );
      const result = JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      expect(result).toMatchObject(
        failureMode === 'success' || failureMode === 'pending'
          ? {
              state: failureMode === 'success' ? 'verified' : 'pending',
              controllerAttempt: 2,
              controllerRun,
            }
          : { state: 'manual', reason: 'evidence_api_error' }
      );
      if (failureMode === 'success' || failureMode === 'pending') {
        expect(calls.filter(call => call.includes('/artifacts?'))).toHaveLength(
          6
        );
      }
      expect(
        calls.every(
          call => call.startsWith('gh api repos/') || call.startsWith('unzip ')
        )
      ).toBe(true);
      expect(
        calls.some(call => /--method| -X |enqueue|\/statuses/.test(call))
      ).toBe(false);
    } finally {
      process.argv = argv;
      output.mockRestore();
      processRunner.mockReset();
    }
  });

  it('accepts the normal marker from a successful full retry at exact attempt 2', () => {
    expect(
      classifyProductionMarkerEvidence(
        evidence({
          markers: [normalRerunMarker()],
        })
      )
    ).toMatchObject({
      state: 'verified',
      controllerRun,
      controllerAttempt: 2,
      reason: 'exact_attempt_verified',
      deploymentId: 'dpl_recovery123',
    });
  });

  it.each([
    'failure',
    'cancelled',
    'timed_out',
    'skipped',
  ])('does not grant another recovery or verification to a %s full retry', conclusion => {
    const marker = normalRerunMarker();
    marker.attemptRun.conclusion = conclusion;
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'normal_rerun_not_verified',
    });
  });

  it('reports an active full retry as pending at its actual attempt', () => {
    const marker = normalRerunMarker();
    marker.attemptRun.status = 'in_progress';
    marker.attemptRun.conclusion = null;
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'pending',
      controllerAttempt: 2,
    });
  });

  it.each([
    'head',
    'run',
    'attempt',
    'job',
    'expired',
    'name',
    'repository',
    'workflow',
  ])('rejects contradictory %s evidence for a normally named retry marker', field => {
    const marker = normalRerunMarker();
    if (field === 'head') marker.payload.sha = 'b'.repeat(40);
    if (field === 'run') marker.payload.controllerRun = '789';
    if (field === 'attempt') marker.payload.controllerAttempt = '3';
    if (field === 'job') marker.attemptJobs[0].run_attempt = 1;
    if (field === 'expired') marker.artifact.expired = true;
    if (field === 'name') marker.artifact.name = 'forged-marker';
    if (field === 'repository')
      marker.attemptRun.head_repository.full_name = 'other/repo';
    if (field === 'workflow')
      marker.attemptRun.path = '.github/workflows/untrusted.yml';
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] })).state
    ).toBe('manual');
  });

  it('rejects a second primary marker and a recovery lease beside the normal retry', () => {
    expect(
      classifyProductionMarkerEvidence(
        evidence({
          markers: [primaryMarker('completed', 'success'), normalRerunMarker()],
        })
      )
    ).toMatchObject({ state: 'manual', reason: 'duplicate_primary_marker' });
    expect(
      classifyProductionMarkerEvidence(
        evidence({
          markers: [normalRerunMarker()],
          recoveryArtifacts: [recoveryLease().artifact],
        })
      )
    ).toMatchObject({
      state: 'manual',
      reason: 'recovery_evidence_after_verified_primary',
    });
  });

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

describe('recovered production marker state', () => {
  it('binds the post-write exception to exactly one live recovery workflow step', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../../../../../.github/scripts/production-marker-state.mjs'
      ),
      'utf8'
    );
    const dispatchName = source.match(/const dispatchName = '([^']+)'/)?.[1];
    const workflow = readFileSync(
      resolve(
        testDir,
        '../../../../../.github/workflows/production-marker-recovery.yml'
      ),
      'utf8'
    );
    expect(dispatchName).toBeTruthy();
    expect(
      [...workflow.matchAll(/^\s+- name: (.+)$/gm)].filter(
        match => match[1] === dispatchName
      )
    ).toHaveLength(1);
  });

  const recoveryRunId = 789;

  function markerRecoveryRun(
    status: string,
    conclusion: string | null,
    event = 'workflow_dispatch'
  ) {
    return {
      id: recoveryRunId,
      run_attempt: 1,
      workflow_id: workflowId + 1,
      path: '.github/workflows/production-marker-recovery.yml',
      // workflow_run jobs execute from the then-current default branch. The
      // recovered generation is authenticated by the payload-bound source
      // controller, not this downstream checkout SHA.
      head_sha: 'c'.repeat(40),
      head_branch: 'main',
      head_repository: { full_name: repo },
      event,
      status,
      conclusion,
    };
  }

  function recoveredMarker() {
    return {
      artifact: {
        id: 21,
        name: `production-generation-verified-${sha}`,
        expired: false,
        workflowRunId: recoveryRunId,
      },
      payload: {
        sha,
        deploymentId: 'dpl_recovered123',
        controllerRun: String(recoveryRunId),
        controllerAttempt: '1',
        recoveredFromControllerRun: String(controllerRun),
        recoveredFromControllerAttempt: '1',
      },
      attemptRun: markerRecoveryRun('completed', 'success'),
      attemptJobs: [],
      originalRun: run(1, 'completed', 'failure'),
      originalJobs: [
        job(
          'Production Release / Centralized production rollback',
          1,
          'completed',
          'skipped'
        ),
      ],
    };
  }

  function convergedMarkers() {
    const recovered = recoveredMarker();
    recovered.attemptRun.event = 'workflow_run';
    const retry = recoveryMarker('completed', 'success');
    retry.artifact.name = recovered.artifact.name;
    retry.payload.deploymentId = recovered.payload.deploymentId;
    return { recovered, retry };
  }

  it.each([
    [1, false],
    [1, true],
    [2, false],
    [2, true],
  ] as const)('accepts independently verified recovery attempt %s and retry (reverse=%s)', (recoveryAttempt, reverse) => {
    const { recovered, retry } = convergedMarkers();
    recovered.payload.controllerAttempt = String(recoveryAttempt);
    recovered.attemptRun.run_attempt = recoveryAttempt;
    const markers = reverse ? [retry, recovered] : [recovered, retry];
    expect(
      classifyProductionMarkerEvidence(evidence({ markers }))
    ).toMatchObject({
      state: 'verified',
      reason: 'exact_recovery_and_retry_verified',
      controllerRun,
      controllerAttempt: 2,
      deploymentId: recovered.payload.deploymentId,
    });
  });

  it.each([
    'deployment',
    'source-run',
    'source-attempt',
    'successful-source',
    'expired',
    'rollback',
    'active-retry',
    'failed-retry',
    'missing-verified-job',
    'wrong-sha',
    'foreign-recovery',
    'duplicate-retry',
    'duplicate-recovery',
    'lease',
    'third-marker',
    'artifact-id',
  ])('refuses contradictory converged marker evidence: %s', fault => {
    const { recovered, retry } = convergedMarkers();
    let markers = [recovered, retry];
    if (fault === 'deployment') retry.payload.deploymentId = 'dpl_other';
    if (fault === 'source-run') {
      recovered.payload.recoveredFromControllerRun = '999';
      recovered.originalRun.id = 999;
      recovered.originalJobs[0].run_id = 999;
    }
    if (fault === 'source-attempt') {
      recovered.payload.recoveredFromControllerAttempt = '2';
      recovered.originalRun.run_attempt = 2;
      recovered.originalJobs[0].run_attempt = 2;
    }
    if (fault === 'successful-source')
      recovered.originalRun.conclusion = 'success';
    if (fault === 'expired') recovered.artifact.expired = true;
    if (fault === 'rollback') recovered.originalJobs[0].conclusion = 'success';
    if (fault === 'active-retry') {
      retry.attemptRun.status = 'in_progress';
      retry.attemptRun.conclusion = null;
    }
    if (fault === 'failed-retry') retry.attemptRun.conclusion = 'failure';
    if (fault === 'missing-verified-job') retry.attemptJobs = [];
    if (fault === 'wrong-sha') retry.payload.sha = 'f'.repeat(40);
    if (fault === 'foreign-recovery')
      recovered.attemptRun.head_repository.full_name = 'foreign/repo';
    if (fault === 'duplicate-retry') markers = [retry, retry];
    if (fault === 'duplicate-recovery') markers = [recovered, recovered];
    if (fault === 'third-marker') markers.push(retry);
    if (fault === 'artifact-id') retry.artifact.id = recovered.artifact.id;
    expect(
      classifyProductionMarkerEvidence(
        evidence({
          markers,
          recoveryArtifacts:
            fault === 'lease' ? [recoveryLease().artifact] : [],
        })
      ).state
    ).toBe('manual');
  });

  it.each([
    'stable',
    'reordered',
    'new-marker',
    'new-recovery-marker',
    'new-lease',
    'expired',
    'removed',
    'changed-run',
  ])('validates final artifact snapshot through the real CLI reader: %s', async change => {
    const { recovered, retry } = convergedMarkers();
    const markers = [recovered, retry];
    const listingReads = new Map<string, number>();
    let downloaded: { payload: unknown } = retry;
    const calls: string[] = [];
    processRunner.mockImplementation((command: string, args: string[]) => {
      const endpoint = args[1];
      calls.push(`${command} ${args.join(' ')}`);
      let output: string | Buffer;
      if (command === 'unzip')
        output =
          args[0] === '-Z1'
            ? 'production-generation-verified.json\n'
            : JSON.stringify(downloaded.payload);
      else if (endpoint.endsWith('/zip')) {
        downloaded = markers.find(m =>
          endpoint.includes(`/artifacts/${m.artifact.id}/`)
        )!;
        output = Buffer.from('archive');
      } else if (endpoint.includes('/artifacts?')) {
        const read = (listingReads.get(endpoint) ?? 0) + 1;
        listingReads.set(endpoint, read);
        const normalName = endpoint.includes(
          `name=production-generation-verified-${sha}&`
        );
        const listing = normalName
          ? markers.map(m => ({
              ...m.artifact,
              workflow_run: { id: m.artifact.workflowRunId },
            }))
          : [];
        if (read > 1 && normalName) {
          if (change === 'reordered') listing.reverse();
          if (change === 'new-marker') listing.push({ ...listing[0], id: 900 });
          if (change === 'expired') listing[0].expired = true;
          if (change === 'removed') listing.pop();
          if (change === 'changed-run') listing[0].workflow_run.id = 999;
        }
        if (
          read > 1 &&
          change === 'new-recovery-marker' &&
          endpoint.includes(
            `name=production-generation-verified-recovery-${sha}&`
          )
        ) {
          const artifact = recoveryMarker('completed', 'success').artifact;
          listing.push({
            ...artifact,
            workflow_run: { id: artifact.workflowRunId },
          });
        }
        if (
          read > 1 &&
          change === 'new-lease' &&
          endpoint.includes(`name=production-generation-recovery-${sha}&`)
        ) {
          const lease = recoveryLease().artifact;
          listing.push({ ...lease, workflow_run: { id: lease.workflowRunId } });
        }
        output = JSON.stringify({
          total_count: listing.length,
          artifacts: listing,
        });
      } else {
        const original = endpoint.includes(`/${controllerRun}/attempts/1`);
        const marker = endpoint.includes(`/${recoveryRunId}/`)
          ? recovered
          : retry;
        output = JSON.stringify(
          endpoint.includes('/jobs?')
            ? {
                total_count: original
                  ? recovered.originalJobs.length
                  : marker.attemptJobs.length,
                jobs: original ? recovered.originalJobs : marker.attemptJobs,
              }
            : original
              ? recovered.originalRun
              : marker.attemptRun
        );
      }
      return { status: 0, stdout: output, stderr: '' };
    });
    const argv = process.argv;
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    try {
      process.argv = [
        process.execPath,
        resolve(
          testDir,
          '../../../../../.github/scripts/production-marker-state.mjs'
        ),
        '--sha',
        sha,
        '--repo',
        repo,
        '--controller-workflow-id',
        String(workflowId),
      ];
      vi.resetModules();
      await import(
        '../../../../../.github/scripts/production-marker-state.mjs'
      );
      expect(JSON.parse(String(output.mock.calls.at(-1)?.[0]))).toMatchObject(
        change === 'stable' || change === 'reordered'
          ? {
              state: 'verified',
              reason: 'exact_recovery_and_retry_verified',
              controllerRun,
              controllerAttempt: 2,
            }
          : { state: 'manual', reason: 'artifact_snapshot_changed' }
      );
      expect(calls.filter(c => c.endsWith('/zip'))).toHaveLength(2);
      expect(calls.some(c => /--method| -X |enqueue|\/statuses/.test(c))).toBe(
        false
      );
    } finally {
      process.argv = argv;
      output.mockRestore();
      processRunner.mockReset();
    }
  });

  it('verifies a bounded recovered marker with exact source evidence', () => {
    const result = classifyProductionMarkerEvidence(
      evidence({ markers: [recoveredMarker()], latestRun: undefined })
    );

    expect(result).toMatchObject({
      state: 'verified',
      reason: 'exact_recovered_generation_verified',
      controllerRun: recoveryRunId,
      controllerAttempt: 1,
      deploymentId: 'dpl_recovered123',
    });
  });

  it('verifies event recovery when the default branch advanced after promotion', () => {
    const marker = recoveredMarker();
    marker.attemptRun = markerRecoveryRun(
      'completed',
      'success',
      'workflow_run'
    );

    expect(
      classifyProductionMarkerEvidence(
        evidence({ markers: [marker], latestRun: undefined })
      )
    ).toMatchObject({
      state: 'verified',
      reason: 'exact_recovered_generation_verified',
      controllerRun: recoveryRunId,
      controllerAttempt: 1,
    });
  });

  it('rejects event recovery bound to a different source generation', () => {
    const marker = recoveredMarker();
    marker.attemptRun = markerRecoveryRun(
      'completed',
      'success',
      'workflow_run'
    );
    marker.originalRun = {
      ...run(1, 'completed', 'failure'),
      head_sha: 'd'.repeat(40),
    };

    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'contradictory_recovery_source_run',
    });
  });

  it('rejects unsupported recovery events', () => {
    const marker = recoveredMarker();
    marker.attemptRun = markerRecoveryRun('completed', 'success', 'push');

    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'contradictory_marker_attempt',
    });
  });

  it('fails closed when the recovered source run was rolled back', () => {
    const marker = recoveredMarker();
    marker.originalJobs = [
      job(
        'Production Release / Centralized production rollback',
        1,
        'completed',
        'success'
      ),
    ];
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'unsafe_or_contradictory_rollback',
    });
  });

  it('fails closed when the recovery run did not complete successfully', () => {
    const marker = recoveredMarker();
    marker.attemptRun = markerRecoveryRun('completed', 'failure');
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'contradictory_marker_attempt',
    });
  });

  it('preserves exact runtime proof when only the post-write fleet dispatch failed', () => {
    const marker = recoveredMarker();
    marker.attemptRun = markerRecoveryRun('completed', 'failure');
    const successfulSteps = [
      'Validate bounded recovery request',
      'Verify canonical ownership and exact runtime probes',
      'Re-probe production Better Auth OAuth runtime',
      'Preserve recovered verified-generation marker',
      'Upload recovered verified-generation marker',
      'Confirm uploaded recovered marker bytes',
    ];
    marker.attemptJobs = [
      {
        id: 71,
        run_id: recoveryRunId,
        run_attempt: 1,
        name: 'Recover exact verified-generation marker',
        head_sha: 'c'.repeat(40),
        head_branch: 'main',
        status: 'completed',
        conclusion: 'failure',
        steps: [
          ...successfulSteps.map((name, index) => ({
            number: index + 1,
            name,
            status: 'completed',
            conclusion: 'success',
          })),
          {
            number: successfulSteps.length + 1,
            name: 'Dispatch fresh fleet and desktop reconciliation',
            status: 'completed',
            conclusion: 'failure',
          },
        ],
      },
    ];

    expect(
      classifyProductionMarkerEvidence(
        evidence({ markers: [marker], latestRun: undefined })
      )
    ).toMatchObject({
      state: 'verified',
      reason: 'exact_recovered_generation_verified',
      controllerRun: recoveryRunId,
    });
  });

  it('fails closed when the source run is not the exact controller attempt', () => {
    const marker = recoveredMarker();
    marker.originalRun = {
      ...run(1, 'completed', 'failure'),
      head_sha: 'd'.repeat(40),
    };
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'contradictory_recovery_source_run',
    });
  });

  it('fails closed when recovery provenance fields are missing', () => {
    const marker = recoveredMarker();
    delete (marker.payload as Record<string, unknown>)
      .recoveredFromControllerAttempt;
    expect(
      classifyProductionMarkerEvidence(evidence({ markers: [marker] }))
    ).toMatchObject({
      state: 'manual',
      reason: 'malformed_or_contradictory_marker',
    });
  });

  it('rejects rerun-lease evidence alongside a recovered verified marker', () => {
    const lease = recoveryLease();
    expect(
      classifyProductionMarkerEvidence(
        evidence({
          markers: [recoveredMarker()],
          recoveryArtifacts: [lease.artifact],
          recoveryPayload: lease.payload,
          recoveryAttemptRun: run(2, 'completed', 'success'),
        })
      )
    ).toMatchObject({
      state: 'manual',
      reason: 'recovery_evidence_after_verified_primary',
    });
  });
});

describe('producer coalescence classification', () => {
  const coalescedJobs = () => [
    job(
      'Production Release / Check current main before release',
      1,
      'completed',
      'success'
    ),
    job(
      'Production Release / Promote to Production',
      1,
      'completed',
      'skipped'
    ),
    job('Production Verified', 1, 'completed', 'success'),
    job(
      'Production Release / Centralized production rollback',
      1,
      'completed',
      'skipped'
    ),
  ];

  it('recognizes the exact intentionally-superseded producer shape', () => {
    expect(
      classifyProducerCoalescence(
        run(1, 'completed', 'success'),
        coalescedJobs()
      )
    ).toBe(true);
  });

  it('refuses a producer that actually promoted', () => {
    const jobs = coalescedJobs();
    jobs[1] = job(
      'Production Release / Promote to Production',
      1,
      'completed',
      'success'
    );
    expect(
      classifyProducerCoalescence(run(1, 'completed', 'success'), jobs)
    ).toBe(false);
  });

  it('refuses a producer whose rollback executed', () => {
    const jobs = coalescedJobs();
    jobs[3] = job(
      'Production Release / Centralized production rollback',
      1,
      'completed',
      'success'
    );
    expect(
      classifyProducerCoalescence(run(1, 'completed', 'success'), jobs)
    ).toBe(false);
  });

  it('refuses a failed or non-controller producer run', () => {
    expect(
      classifyProducerCoalescence(
        run(1, 'completed', 'failure'),
        coalescedJobs()
      )
    ).toBe(false);
    const foreign = { ...run(1, 'completed', 'success'), path: 'other.yml' };
    expect(classifyProducerCoalescence(foreign, coalescedJobs())).toBe(false);
  });

  it('refuses missing or duplicated verified evidence', () => {
    expect(
      classifyProducerCoalescence(run(1, 'completed', 'success'), [])
    ).toBe(false);
    const duplicated = [
      ...coalescedJobs(),
      job('Production Verified', 1, 'completed', 'success'),
    ];
    expect(
      classifyProducerCoalescence(run(1, 'completed', 'success'), duplicated)
    ).toBe(false);
    expect(
      classifyProducerCoalescence(run(1, 'completed', 'success'), null)
    ).toBe(false);
  });
});

describe('newer controller supersession', () => {
  const context = {
    sha,
    repo,
    controllerRun,
    controllerWorkflowId: workflowId,
  };
  const producer = {
    ...run(1, 'completed', 'success'),
    created_at: '2026-09-10T02:16:03Z',
  };
  const candidate = (id: number, createdAt: string, overrides = {}) => ({
    ...run(1, 'completed', 'success'),
    id,
    head_sha: 'b'.repeat(40),
    created_at: createdAt,
    ...overrides,
  });

  it('selects the newest main controller run after the producer', () => {
    const newer = candidate(789, '2026-09-10T02:23:47Z');
    const oldest = candidate(790, '2026-09-10T02:20:00Z');
    expect(
      selectNewerControllerRun(producer, [oldest, newer], context)
    ).toEqual({
      run: 789,
      sha: 'b'.repeat(40),
      createdAt: '2026-09-10T02:23:47Z',
    });
  });

  it('supersedes on an in-flight newer run, not only a successful one', () => {
    const inFlight = candidate(789, '2026-09-10T02:23:47Z', {
      status: 'in_progress',
      conclusion: null,
    });
    expect(
      selectNewerControllerRun(producer, [inFlight], context)
    ).toMatchObject({ run: 789 });
    const failed = candidate(790, '2026-09-10T02:24:00Z', {
      conclusion: 'failure',
    });
    const cancelled = candidate(791, '2026-09-10T02:25:00Z', {
      conclusion: 'cancelled',
    });
    expect(
      selectNewerControllerRun(producer, [failed, cancelled], context)
    ).toMatchObject({ run: 791 });
  });

  it('never supersedes on a startup failure or a same-sha retry', () => {
    const startupFailure = candidate(789, '2026-09-10T02:23:47Z', {
      conclusion: 'startup_failure',
    });
    expect(
      selectNewerControllerRun(producer, [startupFailure], context)
    ).toBeNull();
    const sameSha = candidate(790, '2026-09-10T02:23:47Z', {
      head_sha: sha,
    });
    expect(selectNewerControllerRun(producer, [sameSha], context)).toBeNull();
  });

  it('returns null when nothing newer exists', () => {
    expect(
      selectNewerControllerRun(
        producer,
        [candidate(789, '2026-09-10T02:00:00Z')],
        context
      )
    ).toBeNull();
    expect(selectNewerControllerRun(producer, [], context)).toBeNull();
    expect(selectNewerControllerRun(producer, null, context)).toBeNull();
  });

  it('ignores the producer itself and foreign runs', () => {
    expect(
      selectNewerControllerRun(
        producer,
        [candidate(controllerRun, '2026-09-10T03:00:00Z')],
        context
      )
    ).toBeNull();
    const otherBranch = candidate(790, '2026-09-10T03:00:00Z', {
      head_branch: 'fix/x',
    });
    const otherWorkflow = candidate(791, '2026-09-10T03:00:00Z', {
      path: '.github/workflows/ci.yml',
    });
    const malformedSha = candidate(792, '2026-09-10T03:00:00Z', {
      head_sha: 'not-a-sha',
    });
    expect(
      selectNewerControllerRun(
        producer,
        [otherBranch, otherWorkflow, malformedSha],
        context
      )
    ).toBeNull();
  });

  it('fails closed on malformed producer evidence', () => {
    expect(
      selectNewerControllerRun(
        null,
        [candidate(789, '2026-09-10T03:00:00Z')],
        context
      )
    ).toBeNull();
    const noTimestamp = { ...producer, created_at: undefined };
    expect(
      selectNewerControllerRun(
        noTimestamp,
        [candidate(789, '2026-09-10T03:00:00Z')],
        context
      )
    ).toBeNull();
    const foreignProducer = { ...producer, head_branch: 'fix/x' };
    expect(
      selectNewerControllerRun(
        foreignProducer,
        [candidate(789, '2026-09-10T03:00:00Z')],
        context
      )
    ).toBeNull();
  });
});

describe('producer activation evidence CLI', () => {
  const producerCreatedAt = '2026-09-10T02:16:03Z';
  const coalescedJobs = [
    job(
      'Production Release / Check current main before release',
      1,
      'completed',
      'success'
    ),
    job(
      'Production Release / Promote to Production',
      1,
      'completed',
      'skipped'
    ),
    job('Production Verified', 1, 'completed', 'success'),
    job(
      'Production Release / Centralized production rollback',
      1,
      'completed',
      'skipped'
    ),
  ];

  async function runCliWithProducerEvidence(supersede: boolean) {
    const calls: string[] = [];
    processRunner.mockImplementation((command: string, args: string[]) => {
      const endpoint = args[1];
      calls.push(`${command} ${args.join(' ')}`);
      let output: string;
      if (command === 'gh' && args[0] === 'api') {
        if (endpoint.includes('/artifacts?')) {
          output = JSON.stringify({ total_count: 0, artifacts: [] });
        } else if (
          endpoint === `repos/${repo}/actions/runs/${controllerRun}/attempts/1`
        ) {
          output = JSON.stringify({
            ...run(1, 'completed', 'success'),
            created_at: producerCreatedAt,
          });
        } else if (
          endpoint ===
          `repos/${repo}/actions/runs/${controllerRun}/attempts/1/jobs?per_page=100`
        ) {
          output = JSON.stringify({
            total_count: coalescedJobs.length,
            jobs: coalescedJobs,
          });
        } else if (
          endpoint ===
          `repos/${repo}/actions/workflows/${workflowId}/runs?branch=main&per_page=30`
        ) {
          output = JSON.stringify({
            total_count: supersede ? 1 : 0,
            workflow_runs: supersede
              ? [
                  {
                    ...run(1, 'in_progress', null),
                    id: 789,
                    head_sha: 'b'.repeat(40),
                    created_at: '2026-09-10T02:23:47Z',
                  },
                ]
              : [],
          });
        } else {
          throw new Error(`unexpected endpoint ${endpoint}`);
        }
      } else {
        throw new Error(`unexpected command ${command}`);
      }
      return { status: 0, stdout: output, stderr: '' };
    });
    const argv = process.argv;
    const output = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    try {
      process.argv = [
        process.execPath,
        resolve(
          testDir,
          '../../../../../.github/scripts/production-marker-state.mjs'
        ),
        '--sha',
        sha,
        '--repo',
        repo,
        '--controller-workflow-id',
        String(workflowId),
        '--producer-run-id',
        String(controllerRun),
        '--producer-attempt',
        '1',
      ];
      vi.resetModules();
      await import(
        '../../../../../.github/scripts/production-marker-state.mjs'
      );
      return {
        result: JSON.parse(String(output.mock.calls.at(-1)?.[0])),
        calls,
      };
    } finally {
      process.argv = argv;
      output.mockRestore();
      processRunner.mockReset();
    }
  }

  it('marks a coalesced producer superseded by a newer in-flight run', async () => {
    const { result } = await runCliWithProducerEvidence(true);
    expect(result).toMatchObject({
      state: 'none',
      reason: 'no_marker',
      coalesced: true,
      supersededBy: {
        run: 789,
        sha: 'b'.repeat(40),
        createdAt: '2026-09-10T02:23:47Z',
      },
    });
  });

  it('marks coalescence without supersession evidence when nothing newer succeeded', async () => {
    const { result, calls } = await runCliWithProducerEvidence(false);
    expect(result).toMatchObject({
      state: 'none',
      reason: 'no_marker',
      coalesced: true,
    });
    expect(result.supersededBy).toBeUndefined();
    expect(
      calls.every(
        call => call.startsWith('gh api repos/') || call.startsWith('unzip ')
      )
    ).toBe(true);
  });
});
