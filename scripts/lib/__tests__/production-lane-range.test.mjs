import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyProductionMarkerEvidence } from '../../../.github/scripts/production-marker-state.mjs';
import {
  classifyProductionBaseEvidence,
  collectProductionGitRange,
  PRODUCTION_BASE_EVIDENCE,
  planProductionLaneRange,
  planProductionMarkerRecovery,
  resolveHistoricalLaneEvidence,
  runProductionLaneRange,
  validateLaneEvidenceReceipt,
  WEB_BIND_REASONS,
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

function historicalEvidenceFixture({ events = ['merge_group', 'push'] } = {}) {
  const repository = 'JovieInc/Jovie';
  const evidenceSha = 'ce07c2cdcf5e80bf2ed59389b8186e193937bda3';
  const runs = events.map((event, index) => ({
    id: 37347371805 + index,
    run_attempt: 1,
    event,
    head_sha: evidenceSha,
    head_branch: event === 'push' ? 'main' : 'gh-readonly-queue/main/pr-1-base',
    path: '.github/workflows/ci.yml',
    head_repository: { full_name: repository },
    status: 'completed',
    conclusion: 'success',
  }));
  const listingRuns = [...runs];
  const listingOverrides = new Map();
  const artifacts = runs.map((run, index) => ({
    id: 11361322461 + index,
    name: `product-lane-final-${evidenceSha}-${run.run_attempt}`,
    expired: false,
  }));
  const receipts = runs.map((run, index) => ({
    ...receipt({ headSha: evidenceSha, runId: run.id }),
    authority: 'Summer',
    qualificationProfile: 'full',
    changedPaths: ['apps/web/app/page.tsx'],
    requiredGates: { web: { tests: 'Web unit shards and independent build' } },
    actualResults: {
      lanes: { web: ['success', 'success'] },
      receiptArtifact: artifacts[index].name,
      run: `https://github.com/${repository}/actions/runs/${run.id}`,
    },
  }));
  const jobs = runs.map(run => [
    {
      name: run.event === 'push' ? 'Main Release Ready' : 'PR Ready',
      run_id: run.id,
      run_attempt: run.run_attempt,
      head_sha: evidenceSha,
      status: 'completed',
      conclusion: 'success',
    },
  ]);
  const resolveEvidence = () =>
    resolveHistoricalLaneEvidence({
      repository,
      sha: evidenceSha,
      lane: 'web',
      ghJsonImpl(endpoint) {
        if (endpoint.includes('/workflows/ci.yml/runs?')) {
          const event = new URLSearchParams(endpoint.split('?')[1]).get(
            'event'
          );
          if (listingOverrides.has(event)) return listingOverrides.get(event);
          const matching = listingRuns.filter(run => run.event === event);
          return { total_count: matching.length, workflow_runs: matching };
        }
        const index = runs.findIndex(run =>
          endpoint.includes(`/runs/${run.id}/`)
        );
        if (index >= 0 && endpoint.includes('/jobs?')) {
          return { total_count: jobs[index].length, jobs: jobs[index] };
        }
        if (index >= 0 && endpoint.includes('/artifacts?')) {
          return { total_count: 1, artifacts: [artifacts[index]] };
        }
        throw new Error(`Unexpected fixture endpoint: ${endpoint}`);
      },
      downloadFinalReceiptImpl: (_repository, id) =>
        receipts[artifacts.findIndex(artifact => artifact.id === id)],
    });
  return {
    runs,
    listingRuns,
    listingOverrides,
    artifacts,
    receipts,
    jobs,
    resolveEvidence,
  };
}

describe('production lane range', () => {
  it('bootstraps only an older canonical live base with no marker', () => {
    expect(
      classifyProductionBaseEvidence({
        markerState: 'none',
        deployedSha: sha('a'),
        currentSha: sha('b'),
      })
    ).toBe(PRODUCTION_BASE_EVIDENCE.canonicalBootstrap);

    expect(() =>
      classifyProductionBaseEvidence({
        markerState: 'none',
        deployedSha: sha('a'),
        currentSha: sha('a'),
      })
    ).toThrow('production base evidence is not admissible');
  });

  it.each(['pending', 'manual', 'recovery_available', ''])(
    'rejects %s production marker state as a release base',
    markerState => {
      expect(() =>
        classifyProductionBaseEvidence({
          markerState,
          deployedSha: sha('a'),
          currentSha: sha('b'),
        })
      ).toThrow('production base evidence is not admissible');
    }
  );

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
      webBindReason: WEB_BIND_REASONS.selectedLane,
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
    expect(plan.webBindReason).toBe(WEB_BIND_REASONS.selectedLane);
  });

  it('does not invent a web lane for an operations-only range when live already equals current main', () => {
    const currentSha = sha('a');
    const plan = planProductionLaneRange({
      deployedSha: currentSha,
      currentSha,
      cumulativeChangedPaths: [],
      commitsNewestFirst: [],
    });

    expect(plan.selectedLanes).toEqual([]);
    expect(plan.runWeb).toBe(false);
    expect(plan.webEvidenceSha).toBeNull();
    expect(plan.webBindReason).toBe(WEB_BIND_REASONS.none);
  });

  it('forces Web/Promote for an operations-only range while live SHA ≠ current main', () => {
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
    expect(plan.runWeb).toBe(true);
    expect(plan.webEvidenceSha).toBeNull();
    expect(plan.webBindReason).toBe(WEB_BIND_REASONS.liveUnbound);
  });

  it('forces Web/Promote for SELECTED_LANES=ios while live SHA ≠ current main', () => {
    const deployedSha = sha('4');
    const currentSha = sha('5');
    const plan = planProductionLaneRange({
      deployedSha,
      currentSha,
      cumulativeChangedPaths: ['apps/ios/Jovie/DashboardView.swift'],
      commitsNewestFirst: [
        {
          sha: currentSha,
          firstParent: deployedSha,
          changedPaths: ['apps/ios/Jovie/DashboardView.swift'],
        },
      ],
    });

    expect(plan.selectedLanes).toEqual(['ios']);
    expect(plan.runWeb).toBe(true);
    expect(plan.webEvidenceSha).toBeNull();
    expect(plan.webBindReason).toBe(WEB_BIND_REASONS.liveUnbound);
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
      webBindReason: WEB_BIND_REASONS.selectedLane,
    });

    expect(() =>
      planProductionMarkerRecovery({
        deployedSha: sha('b'),
        currentSha,
        currentReceipt,
      })
    ).toThrow('marker recovery requires production to serve current main');
  });

  it('does not force Web during marker recovery when live already equals current main', () => {
    const currentSha = sha('c');
    const currentReceipt = receipt({
      headSha: currentSha,
      selectedLanes: ['ios'],
    });
    const plan = planProductionMarkerRecovery({
      deployedSha: currentSha,
      currentSha,
      currentReceipt,
    });

    expect(plan).toMatchObject({
      selectedLanes: ['ios'],
      runWeb: false,
      webEvidenceSha: null,
      webBindReason: WEB_BIND_REASONS.none,
    });
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
        return { total_count: 1, workflow_runs: [runRecord] };
      }
      if (endpoint.includes('event=push'))
        return { total_count: 0, workflow_runs: [] };
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

  it('accepts equivalent exact-head merge-group and push evidence without conflating their provenance', () => {
    const fixture = historicalEvidenceFixture();
    expect(fixture.resolveEvidence()).toMatchObject({
      event: 'merge_group',
      runId: fixture.runs[0].id,
      runAttempt: 1,
      artifactId: fixture.artifacts[0].id,
    });
    expect(fixture.receipts[0].provenance.runId).not.toBe(
      fixture.receipts[1].provenance.runId
    );
    expect(fixture.receipts[0].actualResults.run).not.toBe(
      fixture.receipts[1].actualResults.run
    );
  });

  it('selects deterministic evidence among equivalent producers regardless of listing order', () => {
    const fixture = historicalEvidenceFixture({
      events: ['merge_group', 'merge_group', 'push'],
    });
    fixture.listingRuns.reverse();
    expect(fixture.resolveEvidence().runId).toBe(fixture.runs[0].id);
  });

  it('retains valid push-only historical evidence', () => {
    const fixture = historicalEvidenceFixture({ events: ['push'] });
    expect(fixture.resolveEvidence()).toMatchObject({
      event: 'push',
      runId: fixture.runs[0].id,
    });
  });

  it('compares objects independently of JSON property order without mutating receipts', () => {
    const fixture = historicalEvidenceFixture();
    fixture.receipts[1] = Object.fromEntries(
      Object.entries(fixture.receipts[1]).reverse()
    );
    const before = structuredClone(fixture.receipts);
    expect(fixture.resolveEvidence().runId).toBe(fixture.runs[0].id);
    expect(fixture.receipts).toEqual(before);
  });

  it.each([
    [
      'qualification profile',
      value => {
        value.qualificationProfile = 'reduced';
      },
    ],
    [
      'authority',
      value => {
        value.authority = 'Other';
      },
    ],
    [
      'changed paths',
      value => {
        value.changedPaths.push('apps/web/app/other.tsx');
      },
    ],
    [
      'selected lanes',
      value => {
        value.selectedLanes.push('ios');
      },
    ],
    [
      'required gates',
      value => {
        value.requiredGates.web.tests = 'Different obligations';
      },
    ],
    [
      'admission results',
      value => {
        value.admissions.web.results.push('success');
      },
    ],
    [
      'actual lane results',
      value => {
        value.actualResults.lanes.web.push('success');
      },
    ],
    [
      'unknown future field',
      value => {
        value.futurePolicy = 'different';
      },
    ],
    [
      'missing actual results',
      value => {
        delete value.actualResults;
      },
    ],
  ])(
    'rejects conflicting %s even when both receipts pass the requested lane',
    (_name, mutate) => {
      const fixture = historicalEvidenceFixture();
      mutate(fixture.receipts[1]);
      expect(fixture.resolveEvidence).toThrow(
        'conflicting exact passing web receipts'
      );
    }
  );

  it.each([
    [
      'head',
      value => {
        value.provenance.sha = sha('d');
      },
    ],
    [
      'producer',
      value => {
        value.provenance.runId = '999';
      },
    ],
    [
      'attempt',
      value => {
        value.provenance.runAttempt = '2';
      },
    ],
    [
      'aggregate',
      value => {
        value.aggregatePassed = false;
      },
    ],
    [
      'selected lane',
      value => {
        value.selectedLanes = [];
      },
    ],
    [
      'admission',
      value => {
        value.admissions.web.passed = false;
      },
    ],
    [
      'failed result',
      value => {
        value.admissions.web.results = ['failure'];
      },
    ],
    [
      'producer URL',
      value => {
        value.actualResults.run =
          'https://github.com/other/repo/actions/runs/999';
      },
    ],
    [
      'artifact',
      value => {
        value.actualResults.receiptArtifact = 'other';
      },
    ],
    [
      'malformed results',
      value => {
        value.actualResults = null;
      },
    ],
  ])(
    'does not hide invalid %s behind another valid receipt',
    (_name, mutate) => {
      const fixture = historicalEvidenceFixture();
      mutate(fixture.receipts[1]);
      expect(fixture.resolveEvidence).toThrow();
    }
  );

  it.each([
    'path',
    'repository',
    'head',
    'branch',
    'conclusion',
    'gate',
    'expired artifact',
  ])('retains the trusted producer filter for %s', field => {
    const fixture = historicalEvidenceFixture({ events: ['push'] });
    if (field === 'path')
      fixture.runs[0].path = '.github/workflows/untrusted.yml';
    if (field === 'repository')
      fixture.runs[0].head_repository.full_name = 'other/repo';
    if (field === 'head') fixture.runs[0].head_sha = sha('d');
    if (field === 'branch') fixture.runs[0].head_branch = 'untrusted';
    if (field === 'conclusion') fixture.runs[0].conclusion = 'failure';
    if (field === 'gate') fixture.jobs[0][0].conclusion = 'failure';
    if (field === 'expired artifact') fixture.artifacts[0].expired = true;
    expect(fixture.resolveEvidence).toThrow('found 0');
  });

  it('rejects duplicate producer records rather than treating them as independent evidence', () => {
    const fixture = historicalEvidenceFixture({ events: ['merge_group'] });
    fixture.listingRuns.push(fixture.runs[0]);
    expect(fixture.resolveEvidence).toThrow(
      'duplicate historical evidence producer'
    );
  });

  it.each([
    [
      'incomplete',
      runs => ({ total_count: runs.length + 1, workflow_runs: runs }),
    ],
    ['missing count', runs => ({ workflow_runs: runs })],
    ['noninteger count', runs => ({ total_count: '1', workflow_runs: runs })],
    ['missing runs', () => ({ total_count: 0 })],
    ['malformed runs', () => ({ total_count: 1, workflow_runs: {} })],
    ['null listing', () => null],
  ])(
    'rejects an %s run listing even after another producer has passed',
    (_name, payload) => {
      const fixture = historicalEvidenceFixture();
      fixture.listingOverrides.set('push', payload([fixture.runs[1]]));
      expect(fixture.resolveEvidence).toThrow(
        'incomplete exact CI runs listing'
      );
    }
  );

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
    const githubOutputPath = join(root, 'github-output.txt');
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
        '--deployed-marker-state',
        'verified',
        '--json-out',
        jsonPath,
        '--github-output',
        githubOutputPath,
      ]);
      const expectedWebEvidence =
        String(expectedPlan.webBindReason) === WEB_BIND_REASONS.liveUnbound
          ? {
              sha: currentSha,
              lane: 'web',
              source: 'live-unbound-bind',
              selectedLanes: expectedPlan.selectedLanes,
            }
          : expectedPlan.runWeb
            ? {
                sha: currentSha,
                lane: 'web',
                source: 'current-main-release-receipt',
              }
            : null;
      expect(result).toMatchObject({
        ...expectedPlan,
        webEvidence: expectedWebEvidence,
      });
      expect(JSON.parse(readFileSync(jsonPath, 'utf8'))).toMatchObject({
        deployedSha,
        currentSha,
        selectedLanes: expectedPlan.selectedLanes,
        runWeb: expectedPlan.runWeb,
        webBindReason: expectedPlan.webBindReason,
      });
      expect(readFileSync(githubOutputPath, 'utf8')).toContain(
        `run_web=${expectedPlan.runWeb}`
      );
      expect(readFileSync(githubOutputPath, 'utf8')).toContain(
        `web_bind_reason=${expectedPlan.webBindReason}`
      );
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
    expect(productionController).toContain(
      '[ "$web_bind_reason" = "live_unbound" ]'
    );
    expect(productionController).toContain('forcing Web/Promote');
    expect(productionController).toContain('--mode "$lane_range_mode"');
    expect(productionController).toContain(
      '--deployed-marker-state "${deployed_marker_state:-verified}"'
    );
    expect(productionController).toContain(
      'Bootstrapping the release range from exact canonical live SHA'
    );
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
