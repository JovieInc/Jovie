import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyProductionMarkerEvidence } from '../../../.github/scripts/production-marker-state.mjs';
import {
  collectProductionGitRange,
  planProductionLaneRange,
  planProductionMarkerRecovery,
  resolveHistoricalLaneEvidence,
  runProductionLaneRange,
  validateLaneEvidenceReceipt,
} from '../production-lane-range.mjs';

const sha = character => character.repeat(40);
const testDir = dirname(fileURLToPath(import.meta.url));
const productionController = readFileSync(
  resolve(testDir, '../../../.github/workflows/production-controller.yml'),
  'utf8'
);

function receipt({
  headSha,
  runId = 101,
  runAttempt = 1,
  selectedLanes = ['web'],
  webPassed = true,
}) {
  return {
    provenance: {
      sha: headSha,
      runId: String(runId),
      runAttempt: String(runAttempt),
    },
    selectedLanes,
    aggregatePassed: true,
    admissions: {
      web: {
        selected: selectedLanes.includes('web'),
        passed: webPassed,
        results: webPassed ? ['success', 'success'] : ['failure'],
      },
    },
  };
}

describe('production lane range', () => {
  it('keeps a preceding web lane live when a rapid operations merge becomes current', () => {
    const deployedSha = sha('a');
    const webSha = sha('b');
    const currentSha = sha('c');

    const plan = planProductionLaneRange({
      deployedSha,
      currentSha,
      cumulativeChangedPaths: [
        'apps/web/lib/ingestion/catalog.ts',
        '.github/workflows/operations.yml',
      ],
      commitsNewestFirst: [
        {
          sha: currentSha,
          firstParent: webSha,
          changedPaths: ['.github/workflows/operations.yml'],
        },
        {
          sha: webSha,
          firstParent: deployedSha,
          changedPaths: ['apps/web/lib/ingestion/catalog.ts'],
        },
      ],
    });

    expect(plan).toMatchObject({
      deployedSha,
      currentSha,
      selectedLanes: ['web', 'operations'],
      runWeb: true,
      webEvidenceSha: webSha,
      commitCount: 2,
    });
  });

  it('uses the current head when the latest merge itself affects web', () => {
    const deployedSha = sha('a');
    const currentSha = sha('b');
    const plan = planProductionLaneRange({
      deployedSha,
      currentSha,
      cumulativeChangedPaths: ['apps/web/app/page.tsx'],
      commitsNewestFirst: [
        {
          sha: currentSha,
          firstParent: deployedSha,
          changedPaths: ['apps/web/app/page.tsx'],
        },
      ],
    });

    expect(plan.runWeb).toBe(true);
    expect(plan.webEvidenceSha).toBe(currentSha);
  });

  it('does not invent a web release for an operations-only range', () => {
    const deployedSha = sha('a');
    const currentSha = sha('b');
    const plan = planProductionLaneRange({
      deployedSha,
      currentSha,
      cumulativeChangedPaths: ['.github/workflows/operations.yml'],
      commitsNewestFirst: [
        {
          sha: currentSha,
          firstParent: deployedSha,
          changedPaths: ['.github/workflows/operations.yml'],
        },
      ],
    });

    expect(plan.selectedLanes).toEqual(['operations']);
    expect(plan.runWeb).toBe(false);
    expect(plan.webEvidenceSha).toBeNull();
  });

  it('retains the exact current Web receipt during marker recovery', () => {
    const currentSha = sha('c');
    const currentReceipt = receipt({ headSha: currentSha });
    const plan = planProductionMarkerRecovery({
      deployedSha: currentSha,
      currentSha,
      currentReceipt,
    });

    expect(plan).toMatchObject({
      basis: 'current-marker-recovery',
      deployedSha: currentSha,
      currentSha,
      selectedLanes: ['web'],
      runWeb: true,
      webEvidenceSha: currentSha,
    });

    expect(() =>
      planProductionMarkerRecovery({
        deployedSha: sha('b'),
        currentSha,
        currentReceipt,
      })
    ).toThrow('marker recovery requires production to serve current main');
  });

  it('fails closed when the supplied first-parent range is discontinuous', () => {
    expect(() =>
      planProductionLaneRange({
        deployedSha: sha('a'),
        currentSha: sha('c'),
        cumulativeChangedPaths: ['apps/web/app/page.tsx'],
        commitsNewestFirst: [
          {
            sha: sha('c'),
            firstParent: sha('b'),
            changedPaths: ['apps/web/app/page.tsx'],
          },
          {
            sha: sha('d'),
            firstParent: sha('a'),
            changedPaths: ['docs/release.md'],
          },
        ],
      })
    ).toThrow('first-parent range is not contiguous');
  });

  it('requires exact passing web admission on the historical evidence head', () => {
    const evidenceSha = sha('b');
    expect(
      validateLaneEvidenceReceipt({
        receipt: receipt({ headSha: evidenceSha }),
        expectedSha: evidenceSha,
        expectedRunId: 101,
        expectedRunAttempt: 1,
        lane: 'web',
      })
    ).toMatchObject({
      sha: evidenceSha,
      runId: 101,
      runAttempt: 1,
      lane: 'web',
    });

    expect(() =>
      validateLaneEvidenceReceipt({
        receipt: receipt({ headSha: evidenceSha, webPassed: false }),
        expectedSha: evidenceSha,
        expectedRunId: 101,
        expectedRunAttempt: 1,
        lane: 'web',
      })
    ).toThrow('web admission did not pass');

    expect(() =>
      validateLaneEvidenceReceipt({
        receipt: receipt({ headSha: sha('d') }),
        expectedSha: evidenceSha,
        expectedRunId: 101,
        expectedRunAttempt: 1,
        lane: 'web',
      })
    ).toThrow('receipt provenance does not match');
  });

  it('resolves one exact successful historical merge-group receipt', () => {
    const evidenceSha = sha('b');
    const repository = 'JovieInc/Jovie';
    const runId = 101;
    const runAttempt = 1;
    const runRecord = {
      id: runId,
      run_attempt: runAttempt,
      event: 'merge_group',
      head_sha: evidenceSha,
      head_branch: 'gh-readonly-queue/main/pr-1-base',
      path: '.github/workflows/ci.yml',
      head_repository: { full_name: repository },
      status: 'completed',
      conclusion: 'success',
    };
    const ghJsonImpl = endpoint => {
      if (endpoint.includes('event=merge_group')) {
        return { workflow_runs: [runRecord] };
      }
      if (endpoint.includes('event=push')) return { workflow_runs: [] };
      if (endpoint.includes('/jobs?')) {
        return {
          total_count: 1,
          jobs: [
            {
              name: 'PR Ready',
              run_id: runId,
              run_attempt: runAttempt,
              head_sha: evidenceSha,
              status: 'completed',
              conclusion: 'success',
            },
          ],
        };
      }
      if (endpoint.includes('/artifacts?')) {
        return {
          total_count: 1,
          artifacts: [
            {
              id: 202,
              name: `product-lane-final-${evidenceSha}-${runAttempt}`,
              expired: false,
            },
          ],
        };
      }
      throw new Error(`Unexpected fixture endpoint: ${endpoint}`);
    };

    expect(
      resolveHistoricalLaneEvidence({
        repository,
        sha: evidenceSha,
        lane: 'web',
        ghJsonImpl,
        downloadFinalReceiptImpl: () => receipt({ headSha: evidenceSha }),
      })
    ).toEqual({
      sha: evidenceSha,
      lane: 'web',
      event: 'merge_group',
      runId,
      runAttempt,
      artifactId: 202,
      artifactName: `product-lane-final-${evidenceSha}-${runAttempt}`,
    });
  });

  it('executes the repository-backed CLI path with exact current lane evidence', () => {
    const currentSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const deployedSha = execFileSync('git', ['rev-parse', 'HEAD^'], {
      encoding: 'utf8',
    }).trim();
    const gitRange = collectProductionGitRange(deployedSha, currentSha);
    expect(gitRange.commitsNewestFirst[0]).toMatchObject({
      sha: currentSha,
      firstParent: deployedSha,
    });
    const expectedPlan = planProductionLaneRange({
      deployedSha,
      currentSha,
      ...gitRange,
    });

    const root = mkdtempSync(join(tmpdir(), 'jovie-production-range-test-'));
    const jsonPath = join(root, 'range.json');
    const receiptPath = join(root, 'current-receipt.json');
    try {
      writeFileSync(
        receiptPath,
        `${JSON.stringify(
          receipt({
            headSha: currentSha,
            selectedLanes: expectedPlan.selectedLanes,
          })
        )}\n`
      );
      const result = runProductionLaneRange([
        '--repo',
        'JovieInc/Jovie',
        '--deployed-sha',
        deployedSha,
        '--current-sha',
        currentSha,
        '--current-receipt',
        receiptPath,
        '--json-out',
        jsonPath,
      ]);
      expect(result).toMatchObject({
        ...expectedPlan,
        webEvidence: expectedPlan.runWeb
          ? {
              sha: currentSha,
              lane: 'web',
              source: 'current-main-release-receipt',
            }
          : null,
      });
      expect(JSON.parse(readFileSync(jsonPath, 'utf8'))).toMatchObject({
        deployedSha,
        currentSha,
        selectedLanes: expectedPlan.selectedLanes,
        runWeb: expectedPlan.runWeb,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('wires cumulative routing to one exact verified production checkpoint', () => {
    expect(productionController).toContain('fetch-depth: 0');
    expect(productionController).toContain(
      'https://jov.ie/api/health/build-info'
    );
    expect(productionController).toContain('--sha "$deployed_sha"');
    expect(productionController).toContain(
      'node scripts/lib/production-lane-range.mjs'
    );
    expect(productionController).toContain('--mode "$lane_range_mode"');
    expect(productionController).toContain(
      'if $lanes == "none" then [] else ($lanes | split(",")) end'
    );
    expect(productionController).toContain(
      'production-lane-range-${{ steps.authorize.outputs.expected_sha }}'
    );
  });

  it('accepts only range-bound non-Web no-op markers as verified generations', () => {
    const markerSha = sha('a');
    const repository = 'JovieInc/Jovie';
    const workflowId = 123;
    const controllerRun = 456;
    const payload = {
      sha: markerSha,
      deploymentId: 'not-applicable',
      deploymentBaseSha: sha('b'),
      webEvidenceSha: 'none',
      selectedLanes: ['operations'],
      controllerRun: String(controllerRun),
      controllerAttempt: '1',
      authSmoke: 'not-applicable',
    };
    const marker = {
      artifact: {
        id: 11,
        name: `production-generation-verified-${markerSha}`,
        expired: false,
        workflowRunId: controllerRun,
      },
      payload,
      attemptRun: {
        id: controllerRun,
        run_attempt: 1,
        workflow_id: workflowId,
        path: '.github/workflows/production-controller.yml',
        head_sha: markerSha,
        head_branch: 'main',
        head_repository: { full_name: repository },
        event: 'workflow_run',
        status: 'completed',
        conclusion: 'success',
      },
      attemptJobs: [
        {
          id: 999,
          name: 'Production Verified',
          run_id: controllerRun,
          run_attempt: 1,
          head_sha: markerSha,
          head_branch: 'main',
          status: 'completed',
          conclusion: 'success',
        },
      ],
    };
    const evidence = {
      sha: markerSha,
      repo: repository,
      controllerWorkflowId: workflowId,
      markers: [marker],
      recoveryArtifacts: [],
    };

    expect(classifyProductionMarkerEvidence(evidence)).toMatchObject({
      state: 'verified',
      deploymentId: 'not-applicable',
    });

    const unbound = structuredClone(evidence);
    delete unbound.markers[0].payload.deploymentBaseSha;
    expect(classifyProductionMarkerEvidence(unbound)).toMatchObject({
      state: 'manual',
      reason: 'malformed_or_contradictory_marker',
    });
  });
});
