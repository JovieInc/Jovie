import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  assertLiveProductionBind,
  classifyLiveProductionBind,
  deferToInFlightSupersede,
  LIVE_BIND_REASONS,
  PRODUCTION_BUILD_INFO_URL,
  SUPERSEDE_DEFER_REASONS,
} from '../../../../../.github/scripts/assert-live-production-bind.mjs';
import {
  classifyInFlightProductionControllerHold,
  IN_FLIGHT_CONTROLLER_STATUSES,
} from '../../../../../.github/scripts/hold-screenshot-mq-during-controller.mjs';
import {
  planProductionLaneRange,
  WEB_BIND_REASONS,
} from '../../../../../scripts/lib/production-lane-range.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const skipSuccessUnboundFixturePath = resolve(
  testDir,
  'fixtures/skip-success-unbound.json'
);
const inFlightPcFixturePath = resolve(
  testDir,
  'fixtures/in-flight-pc-screenshot-hold.json'
);
const liveBindScriptPath = resolve(
  repoRoot,
  '.github/scripts/assert-live-production-bind.mjs'
);
const screenshotHoldScriptPath = resolve(
  repoRoot,
  '.github/scripts/hold-screenshot-mq-during-controller.mjs'
);
const productionControllerPath = resolve(
  repoRoot,
  '.github/workflows/production-controller.yml'
);
const productionControllerHealthPath = resolve(
  repoRoot,
  '.github/workflows/production-controller-health.yml'
);
const screenshotsWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/screenshots.yml'
);

const LIVE_SHA = 'dbcf7874da481aea6707d38fb9de32b5fa58de44';
const MAIN_SHA = '4c44a9489de7cbfbea3506ac1ddcca753f80500c';

const EXPECTED_SHA = 'a'.repeat(40);
const INTERMEDIATE_SHA = 'b'.repeat(40);
const supersedeContext = {
  mainSha: MAIN_SHA,
  liveSha: LIVE_SHA,
  expectedSha: EXPECTED_SHA,
  repo: 'JovieInc/Jovie',
  excludeRunId: '100',
  token: '',
};

function controllerRun(id: number, sha: string, status = 'pending') {
  return {
    id,
    // workflow_run head_sha identifies the policy checkout, not the release.
    head_sha: MAIN_SHA,
    head_branch: 'main',
    event: 'workflow_run',
    display_title: `Production Controller ${sha} from CI 123 attempt 1`,
    status,
  };
}

function supersedeFetch(
  runs: ReturnType<typeof controllerRun>[],
  comparisons: Record<string, string> = {}
) {
  return vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input));
    const comparison = url.pathname.split('/compare/')[1];
    return {
      ok: true,
      json: async () =>
        comparison
          ? { status: comparisons[comparison] ?? 'ahead' }
          : { workflow_runs: runs },
    } as Response;
  });
}

function getJobBlock(workflow: string, jobKey: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line === `  ${jobKey}:`);
  expect(start, `Missing workflow job: ${jobKey}`).toBeGreaterThanOrEqual(0);
  const block: string[] = [];
  for (let index = start; index < lines.length; index++) {
    const line = lines[index]!;
    if (index > start && /^  [a-zA-Z0-9_-]+:/.test(line)) break;
    block.push(line);
  }
  return block.join('\n');
}

function getStepBlock(job: string, stepName: string): string {
  const lines = job.split('\n');
  const start = lines.findIndex(line => line.trim() === `- name: ${stepName}`);
  expect(start, `Missing workflow step: ${stepName}`).toBeGreaterThanOrEqual(0);
  const block: string[] = [];
  for (let index = start; index < lines.length; index++) {
    const line = lines[index]!;
    if (index > start && line.startsWith('      - name: ')) break;
    if (index > start && /^[a-zA-Z0-9_-]+:/.test(line)) break;
    block.push(line);
  }
  return block.join('\n');
}

describe('skip-promote false-green detector (JOV-5458)', () => {
  it('classifies skip-success-unbound when live commitSha ≠ origin/main', () => {
    const fixture = JSON.parse(
      readFileSync(skipSuccessUnboundFixturePath, 'utf8')
    ) as {
      mainSha: string;
      live: { commitSha: string };
    };

    const result = classifyLiveProductionBind({
      liveSha: fixture.live.commitSha,
      mainSha: fixture.mainSha,
    });

    expect(fixture.live.commitSha).toBe(LIVE_SHA);
    expect(fixture.mainSha).toBe(MAIN_SHA);
    expect(result).toEqual({
      bound: false,
      reason: LIVE_BIND_REASONS.skipSuccessUnbound,
      liveSha: LIVE_SHA,
      mainSha: MAIN_SHA,
    });
  });

  it('classifies live bound when jov.ie commitSha equals origin/main', () => {
    expect(
      classifyLiveProductionBind({ liveSha: MAIN_SHA, mainSha: MAIN_SHA })
    ).toEqual({
      bound: true,
      reason: LIVE_BIND_REASONS.liveBoundToMain,
      liveSha: MAIN_SHA,
      mainSha: MAIN_SHA,
    });
  });

  it('fails closed when live build-info is unreadable', async () => {
    const result = await assertLiveProductionBind({
      fetchImpl: async () =>
        ({
          ok: false,
          status: 503,
          json: async () => ({}),
        }) as Response,
      mainSha: MAIN_SHA,
    });

    expect(result.bound).toBe(false);
    expect(result.reason).toBe(LIVE_BIND_REASONS.liveBuildInfoUnreadable);
  });

  it('reads commitSha from the canonical live build-info URL', async () => {
    let requested: string | undefined;
    const result = await assertLiveProductionBind({
      fetchImpl: async url => {
        requested = String(url);
        return {
          ok: true,
          json: async () => ({ commitSha: LIVE_SHA }),
        } as Response;
      },
      mainSha: MAIN_SHA,
    });

    expect(requested).toBe(PRODUCTION_BUILD_INFO_URL);
    expect(result.reason).toBe(LIVE_BIND_REASONS.skipSuccessUnbound);
  });

  it('CLI exits red for the skip-success-unbound fixture', () => {
    const ran = spawnSync(
      process.execPath,
      [liveBindScriptPath, '--fixture', skipSuccessUnboundFixturePath],
      { encoding: 'utf8' }
    );

    expect(ran.status).toBe(1);
    expect(ran.stderr).toContain('live jov.ie commitSha');
    expect(ran.stderr).toContain(LIVE_SHA);
    expect(ran.stderr).toContain(MAIN_SHA);
    expect(ran.stderr).toContain('skip_success_unbound');
  });

  it('defers to an in-flight generation for exact main', async () => {
    const fetchImpl = supersedeFetch([
      controllerRun(101, MAIN_SHA, 'in_progress'),
      controllerRun(100, EXPECTED_SHA, 'in_progress'),
    ]);
    const result = await deferToInFlightSupersede({
      ...supersedeContext,
      fetchImpl,
    });

    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      '/actions/workflows/production-controller.yml/runs'
    );
    expect(result).toEqual({
      deferred: true,
      reason: SUPERSEDE_DEFER_REASONS.supersedingRunInFlight,
      runIds: [101],
    });
  });

  it.each(['queued', 'pending', 'in_progress', 'waiting', 'requested'])(
    'defers to a newer intermediate release while main advances (%s, JOV-8175)',
    async status => {
      const run = controllerRun(101, INTERMEDIATE_SHA, status);
      run.head_sha = EXPECTED_SHA;
      const fetchImpl = supersedeFetch([run]);
      expect(
        await deferToInFlightSupersede({ ...supersedeContext, fetchImpl })
      ).toEqual({
        deferred: true,
        reason: SUPERSEDE_DEFER_REASONS.supersedingRunInFlight,
        runIds: [101],
      });
      const urls = fetchImpl.mock.calls.map(([url]) => String(url));
      expect(urls).toContain(
        `https://api.github.com/repos/JovieInc/Jovie/compare/${LIVE_SHA}...${MAIN_SHA}`
      );
      expect(urls).toContain(
        `https://api.github.com/repos/JovieInc/Jovie/compare/${EXPECTED_SHA}...${INTERMEDIATE_SHA}`
      );
      expect(urls).toContain(
        `https://api.github.com/repos/JovieInc/Jovie/compare/${INTERMEDIATE_SHA}...${MAIN_SHA}`
      );
    }
  );

  it.each([
    controllerRun(101, MAIN_SHA, 'completed'),
    controllerRun(100, MAIN_SHA),
    controllerRun(99, MAIN_SHA),
    controllerRun(101, EXPECTED_SHA),
    { ...controllerRun(101, MAIN_SHA), head_branch: 'feature' },
    { ...controllerRun(101, MAIN_SHA), event: 'pull_request' },
    { ...controllerRun(101, MAIN_SHA), display_title: 'malformed' },
  ])('does not defer to a completed, older or unrelated run: %j', async run => {
    expect(
      await deferToInFlightSupersede({
        ...supersedeContext,
        fetchImpl: supersedeFetch([run]),
      })
    ).toEqual({
      deferred: false,
      reason: SUPERSEDE_DEFER_REASONS.noSupersedingRunInFlight,
    });
  });

  it.each([
    [`${LIVE_SHA}...${MAIN_SHA}`, 'diverged'],
    [`${EXPECTED_SHA}...${INTERMEDIATE_SHA}`, 'behind'],
    [`${INTERMEDIATE_SHA}...${MAIN_SHA}`, 'diverged'],
    [`${INTERMEDIATE_SHA}...${MAIN_SHA}`, 'unknown'],
  ])(
    'fails closed without forward main lineage: %s = %s',
    async (range, status) => {
      expect(
        await deferToInFlightSupersede({
          ...supersedeContext,
          fetchImpl: supersedeFetch([controllerRun(101, INTERMEDIATE_SHA)], {
            [range]: status,
          }),
        })
      ).toMatchObject({ deferred: false });
    }
  );

  it('does not mistake current-main policy code for a newer release', async () => {
    expect(
      await deferToInFlightSupersede({
        ...supersedeContext,
        fetchImpl: supersedeFetch([controllerRun(101, EXPECTED_SHA)]),
      })
    ).toMatchObject({ deferred: false });
  });

  it('stays fail-closed when the in-flight check cannot run', async () => {
    expect(
      await deferToInFlightSupersede({
        ...supersedeContext,
        fetchImpl: async () => {
          throw new Error('network down');
        },
      })
    ).toMatchObject({
      deferred: false,
      reason: SUPERSEDE_DEFER_REASONS.inFlightCheckFailed,
    });

    expect(
      await deferToInFlightSupersede({
        ...supersedeContext,
        mainSha: 'not-a-sha',
      })
    ).toEqual({
      deferred: false,
      reason: SUPERSEDE_DEFER_REASONS.inFlightCheckUnavailable,
    });
  });

  it('fails closed on HTTP errors and malformed run evidence', async () => {
    for (const response of [
      new Response(null, { status: 403 }),
      Response.json({ workflow_runs: null }),
    ]) {
      expect(
        await deferToInFlightSupersede({
          ...supersedeContext,
          fetchImpl: async () => response,
        })
      ).toMatchObject({
        deferred: false,
        reason: SUPERSEDE_DEFER_REASONS.inFlightCheckFailed,
      });
    }
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          workflow_runs: [controllerRun(101, INTERMEDIATE_SHA)],
        }),
      })
      .mockRejectedValueOnce(new Error('compare unavailable'));
    expect(
      await deferToInFlightSupersede({ ...supersedeContext, fetchImpl })
    ).toMatchObject({
      deferred: false,
      reason: SUPERSEDE_DEFER_REASONS.inFlightCheckFailed,
    });
  });

  it('CLI passes live identity and expected generation into non-mutating deferral', () => {
    const preload = `globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        workflow_runs: [${JSON.stringify(controllerRun(101, INTERMEDIATE_SHA))}],
        status: 'ahead'
      })
    });`;
    const ran = spawnSync(
      process.execPath,
      [
        '--import',
        `data:text/javascript,${encodeURIComponent(preload)}`,
        liveBindScriptPath,
        '--main-sha',
        MAIN_SHA,
        '--live-sha',
        LIVE_SHA,
        '--allow-in-flight-supersede',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          EXPECTED_SHA,
          GITHUB_REPOSITORY: 'JovieInc/Jovie',
          GITHUB_RUN_ID: '100',
        },
      }
    );
    expect(ran.status, ran.stderr).toBe(0);
    const receipt = JSON.parse(ran.stdout.trim().split('\n').at(-1)!);
    expect(receipt).toMatchObject({ bound: false, deferred: true });
    expect(receipt.deferral.runIds).toEqual([101]);
  });

  it('holds screenshot merge-queue while Production Controller is in-flight', () => {
    const fixture = JSON.parse(readFileSync(inFlightPcFixturePath, 'utf8')) as {
      workflow_runs: Array<{ id: number; status: string }>;
    };
    const result = classifyInFlightProductionControllerHold(fixture);

    expect(IN_FLIGHT_CONTROLLER_STATUSES).toContain('in_progress');
    expect(result).toEqual({
      hold: true,
      reason: 'in_flight_production_controller',
      inFlightCount: 1,
      runIds: [33318960335],
    });
  });

  it('does not hold screenshot merge-queue when no controller run is in-flight', () => {
    const result = classifyInFlightProductionControllerHold({
      total_count: 1,
      workflow_runs: [
        {
          id: 1,
          path: '.github/workflows/production-controller.yml',
          status: 'completed',
        },
      ],
    });

    expect(result).toEqual({
      hold: false,
      reason: 'no_in_flight_production_controller',
      inFlightCount: 0,
      runIds: [],
    });
  });

  it('CLI reports hold for the in-flight Production Controller fixture', () => {
    const ran = spawnSync(
      process.execPath,
      [screenshotHoldScriptPath, '--fixture', inFlightPcFixturePath],
      { encoding: 'utf8' }
    );

    expect(ran.status).toBe(0);
    expect(JSON.parse(ran.stdout)).toMatchObject({
      hold: true,
      reason: 'in_flight_production_controller',
      runIds: [33318960335],
    });
  });

  it('Production Verified cannot skip-succeed without a live bind proof', () => {
    const workflow = readFileSync(productionControllerPath, 'utf8');
    const authorize = getStepBlock(
      getJobBlock(workflow, 'authorize-production'),
      'Cross-prove exact successful push CI'
    );
    const verified = getJobBlock(workflow, 'production-verified');
    const current = getStepBlock(
      verified,
      'Resolve current main before final verification'
    );
    const finalize = getStepBlock(
      verified,
      'Finalize exact current release generation'
    );

    expect(authorize).toContain(
      'marker_deployment_id="$(jq -r \'.deploymentId // ""\' <<<"$marker_state_json")"'
    );
    expect(authorize).toContain(
      'if [ "$marker_deployment_id" = "not-applicable" ]; then'
    );
    expect(authorize).toContain(
      'node .github/scripts/assert-live-production-bind.mjs --main-sha "$EXPECTED_SHA"'
    );
    expect(
      authorize.indexOf(
        'node .github/scripts/assert-live-production-bind.mjs --main-sha "$EXPECTED_SHA"'
      )
    ).toBeLessThan(authorize.indexOf('echo "already_verified=true"'));
    expect(current).toContain('https://jov.ie/api/health/build-info');
    expect(current).toContain(
      'RUN_WEB: ${{ needs.authorize-production.outputs.run_web }}'
    );
    expect(current).toContain(
      'node .github/scripts/assert-live-production-bind.mjs --main-sha "$current_sha"'
    );
    expect(current).toContain(
      'node .github/scripts/assert-live-production-bind.mjs --main-sha "$current_sha" --allow-in-flight-supersede'
    );
    expect(current).toContain('[ "$RUN_WEB" != true ]');
    expect(current.indexOf('[ "$RUN_WEB" != true ]')).toBeLessThan(
      current.indexOf(
        'node .github/scripts/assert-live-production-bind.mjs --main-sha "$current_sha"'
      )
    );
    expect(current).not.toContain('neutral with no notification');
    expect(finalize).toContain(
      'node .github/scripts/assert-live-production-bind.mjs --main-sha "$boundary_sha"'
    );
    expect(finalize).toContain('[ "$RUN_WEB" != true ]');
    expect(finalize.indexOf('[ "$RUN_WEB" != true ]')).toBeLessThan(
      finalize.indexOf(
        'node .github/scripts/assert-live-production-bind.mjs --main-sha "$boundary_sha"'
      )
    );
    expect(
      finalize.indexOf(
        'node .github/scripts/assert-live-production-bind.mjs --main-sha "$boundary_sha"'
      )
    ).toBeLessThan(
      finalize.indexOf('> "$RUNNER_TEMP/production-generation-verified.json"')
    );
    expect(finalize).not.toContain('neutral with no notification');
  });

  it('Production Controller Health stays red until live bind on superseded or skip-success', () => {
    const health = readFileSync(productionControllerHealthPath, 'utf8');
    const evaluate = getStepBlock(
      health,
      'Evaluate exact current production controller'
    );

    expect(evaluate).toContain('recovery_reason=policy_generation_superseded');
    expect(evaluate).toContain('trap - EXIT');
    expect(
      (
        evaluate.match(
          /node \.github\/scripts\/assert-live-production-bind\.mjs --main-sha "\$current_sha"/g
        ) ?? []
      ).length
    ).toBe(2);
    expect(evaluate.indexOf('trap - EXIT')).toBeLessThan(
      evaluate.indexOf('assert-live-production-bind.mjs')
    );
    expect(evaluate.indexOf('assert-live-production-bind.mjs')).toBeLessThan(
      evaluate.indexOf('waiting for marker visibility (30m grace)')
    );
  });

  it('screenshot bot does not add merge-queue', () => {
    const workflow = readFileSync(screenshotsWorkflowPath, 'utf8');
    const generate = getJobBlock(workflow, 'generate');
    const publisher = getJobBlock(workflow, 'publish');
    const publish = getStepBlock(publisher, 'Create or update screenshot PR');

    expect(generate).toContain('actions: read');
    expect(generate).not.toContain('JOVIE_BOT_PRIVATE_KEY');
    expect(generate).not.toContain('Create or update screenshot PR');
    expect(publisher).toContain('continue-on-error: true');
    expect(publish).toContain('GH_ACTIONS_TOKEN: ${{ github.token }}');
    expect(publish).toContain('runs?status=in_progress&per_page=100');
    expect(publish).toContain(
      'node .github/scripts/hold-screenshot-mq-during-controller.mjs'
    );
    expect(publish).toContain(
      'Holding merge-queue enrollment; Production Controller is in-flight.'
    );
    expect(publish).not.toContain('gh pr edit --add-label "merge-queue"');
  });

  it('forces Web/Promote for SELECTED_LANES=ios while live SHA ≠ origin/main', () => {
    const liveSha = LIVE_SHA;
    const mainSha = MAIN_SHA;
    const plan = planProductionLaneRange({
      deployedSha: liveSha,
      currentSha: mainSha,
      cumulativeChangedPaths: ['apps/ios/Jovie/AppState.swift'],
      commitsNewestFirst: [
        {
          sha: mainSha,
          firstParent: liveSha,
          changedPaths: ['apps/ios/Jovie/AppState.swift'],
        },
      ],
    });
    const releaseCaller = getJobBlock(
      readFileSync(productionControllerPath, 'utf8'),
      'production-release'
    );
    const authorize = getStepBlock(
      getJobBlock(
        readFileSync(productionControllerPath, 'utf8'),
        'authorize-production'
      ),
      'Cross-prove exact successful push CI'
    );

    expect(plan.selectedLanes).toEqual(['ios']);
    expect(plan.runWeb).toBe(true);
    expect(plan.webBindReason).toBe(WEB_BIND_REASONS.liveUnbound);
    expect(plan.webEvidenceSha).toBeNull();
    expect(releaseCaller).toContain(
      "needs.authorize-production.outputs.run_web == 'true'"
    );
    expect(releaseCaller).not.toContain('selected_lanes');
    expect(authorize).toContain('[ "$web_bind_reason" = "live_unbound" ]');
    expect(authorize).toContain('forcing Web/Promote');
    expect(authorize).toContain(
      'node .github/scripts/assert-live-production-bind.mjs --main-sha "$EXPECTED_SHA"'
    );
  });
});
