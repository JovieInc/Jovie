import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const workflowPath = resolve(repoRoot, '.github/workflows/ci.yml');
const productionControllerWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/production-controller.yml'
);
const productionControllerRunLiveFixturePath = resolve(
  repoRoot,
  'apps/web/tests/unit/ci/fixtures/production-controller-run-live-shape.json'
);
const productionReleaseWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/production-release.yml'
);
const productionAliasVerifierPath = resolve(
  repoRoot,
  '.github/scripts/verify-production-alias.sh'
);
const productionPromotionControllerPath = resolve(
  repoRoot,
  '.github/scripts/promote-production-deployment.sh'
);
const vercelPrebuiltDeployPath = resolve(
  repoRoot,
  '.github/scripts/vercel-prebuilt-deploy.sh'
);
const visualA11yWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/visual-a11y.yml'
);
const iosWorkflowPath = resolve(repoRoot, '.github/workflows/ios-ci.yml');
const iosTestFlightWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/ios-testflight.yml'
);
const iosTestFlightEnvValidatorPath = resolve(
  repoRoot,
  'apps/ios/scripts/validate-testflight-env.sh'
);
const iosTestFlightArtifactValidatorPath = resolve(
  repoRoot,
  'apps/ios/scripts/validate-testflight-artifact.sh'
);
const fastlanePath = resolve(repoRoot, 'fastlane/Fastfile');
const ciFastLanesPath = resolve(repoRoot, 'scripts/ci-fast-lanes.mjs');
const canaryWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/canary-health-gate.yml'
);
const agentTickWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/agent-tick.yml'
);
const sentryGateWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/sentry-error-gate.yml'
);
const sentryGateActionPath = resolve(
  repoRoot,
  '.github/actions/sentry-error-gate/action.yml'
);
const costAnomalyWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/cost-anomaly-gate.yml'
);
const mainHealthWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/main-ci-health-monitor.yml'
);
const mainHealthActionPath = resolve(
  repoRoot,
  '.github/actions/eval-main-health/action.yml'
);
const productionControllerHealthPath = resolve(
  repoRoot,
  '.github/workflows/production-controller-health.yml'
);
const productionMarkerStatePath = resolve(
  repoRoot,
  '.github/scripts/production-marker-state.mjs'
);

function getStepBlock(workflow: string, stepName: string): string {
  const lines = workflow.split('\n');
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

function getShellRunBlocks(workflow: string): string[] {
  const lines = workflow.split('\n');
  const blocks: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const match = /^(\s*)run:\s*(.*)$/.exec(line);
    if (!match) continue;
    const indentation = match[1]!.length;
    const block = [match[2]!];
    while (index + 1 < lines.length) {
      const next = lines[index + 1]!;
      if (next.trim() && next.search(/\S/) <= indentation) break;
      block.push(next);
      index += 1;
    }
    blocks.push(block.join('\n'));
  }
  return blocks;
}

describe('source PR path-output reachability contract', () => {
  it('runs fast required gates for workflow-only changes without source unit or build work', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const pathJob = getJobBlock(workflow, 'ci-path-changes');
    const provenance = getJobBlock(workflow, 'main-queue-provenance');
    const provenanceHeader = provenance.slice(
      0,
      provenance.indexOf('    steps:')
    );
    const neutralProvenance = getStepBlock(
      provenance,
      'Emit neutral provenance for non-main events'
    );
    const mainCheckout = getStepBlock(provenance, 'Checkout exact main push');
    const mainProvenance = getStepBlock(
      provenance,
      'Resolve exact queue provenance once'
    );
    const detectStep = getStepBlock(
      pathJob,
      'Detect path changes for all job types'
    );
    const ciFast = getJobBlock(workflow, 'ci-fast');
    const migrationGuard = getJobBlock(workflow, 'drizzle-migration-guard');
    const prReady = getJobBlock(workflow, 'ci-pr-ready');
    const unitTests = getJobBlock(workflow, 'ci-unit-tests');
    const buildLayout = getJobBlock(workflow, 'ci-build-layout');

    expect(provenanceHeader).not.toMatch(/^    if:/m);
    expect(provenanceHeader).toContain('runs-on: ubuntu-latest');
    expect(neutralProvenance).toContain(
      "github.event_name != 'push' || github.ref != 'refs/heads/main'"
    );
    expect(neutralProvenance).toContain('echo "is_current=false"');
    expect(neutralProvenance).toContain('echo "queue_proven=false"');
    expect(neutralProvenance).toContain('echo "proof_run_id="');
    for (const mainOnlyStep of [mainCheckout, mainProvenance]) {
      expect(mainOnlyStep).toContain(
        "github.event_name == 'push' && github.ref == 'refs/heads/main'"
      );
    }
    for (const event of [
      {
        name: 'pull_request',
        ref: 'refs/pull/14484/merge',
        neutral: true,
        verifiesMain: false,
      },
      {
        name: 'merge_group',
        ref: 'refs/heads/gh-readonly-queue/main/pr-14484',
        neutral: true,
        verifiesMain: false,
      },
      {
        name: 'workflow_dispatch',
        ref: 'refs/heads/codex/manual',
        neutral: true,
        verifiesMain: false,
      },
      {
        name: 'push',
        ref: 'refs/heads/main',
        neutral: false,
        verifiesMain: true,
      },
    ]) {
      expect(
        event.name !== 'push' || event.ref !== 'refs/heads/main',
        `${event.name} neutral provenance`
      ).toBe(event.neutral);
      expect(
        event.name === 'push' && event.ref === 'refs/heads/main',
        `${event.name} exact main proof`
      ).toBe(event.verifiesMain);
      expect(event.neutral).not.toBe(event.verifiesMain);
    }
    expect(provenanceHeader).toContain(
      'steps.verified.outputs.is_current || steps.neutral.outputs.is_current'
    );
    expect(provenanceHeader).toContain(
      'steps.verified.outputs.queue_proven || steps.neutral.outputs.queue_proven'
    );
    expect(pathJob).toContain('needs: [main-queue-provenance]');

    expect(pathJob).not.toContain('skip: ${{');
    expect(detectStep).not.toContain('echo "skip=');
    expect(workflow).not.toContain('needs.ci-path-changes.outputs.skip');

    // `.github/**` is explicitly not docs-only. ci-fast additionally keys only
    // off the authoritative Path Changes conclusion, including docs-only PRs.
    expect(detectStep).toContain(
      'if ! echo "$CHANGED_FILES" | grep -q -E \'^\\.github/\''
    );
    expect(
      detectStep.lastIndexOf('echo "has_code_changes=true"')
    ).toBeGreaterThan(detectStep.indexOf('Only documentation files changed'));
    expect(ciFast).toContain("needs.ci-path-changes.result == 'success'");
    expect(ciFast).not.toContain('needs.ci-path-changes.outputs.');
    expect(migrationGuard).toContain(
      "needs.ci-path-changes.result == 'success'"
    );
    expect(migrationGuard).toContain("github.event_name == 'pull_request'");
    expect(prReady).toContain(
      "always() && github.event_name == 'pull_request'"
    );
    expect(prReady).toContain('ci-path-changes, ci-risk-classifier, ci-fast');
    expect(prReady).not.toContain('HAS_CODE_CHANGES');

    expect(unitTests).not.toContain("github.event_name == 'pull_request'");
    expect(buildLayout).not.toContain("github.event_name == 'pull_request'");

    // Cross-job control flow keys off GitHub's authoritative job conclusion.
    // Boolean-looking job outputs caused live source and merge-queue cascades
    // to skip even after the runner logged that every output had been set.
    for (const jobKey of [
      'ci-env-example-guard',
      'ci-fast',
      'ci-promptfoo-evals',
      'ci-golden-eval-set',
      'ci-knip',
      'neon-db',
      'drizzle-migration-guard',
      'ci-drizzle-check',
      'ci-integration-ready',
      'ci-build-layout',
      'ci-ios',
      'ci-build-public',
      'ci-layout-guard',
      'ci-mobile-overflow',
      'ci-lighthouse-pr',
      'ci-lighthouse-dashboard-pr',
      'ci-lighthouse-onboarding-pr',
      'ci-lighthouse-admin-pr',
      'ci-lighthouse-chat-pr',
      'ci-pr-neon-migrate',
      'ci-unit-tests',
      'ci-a11y',
      'ci-a11y-authed',
      'ci-e2e-smoke',
      'ci-golden-path',
      'ci-admin-smoke',
      'ci-e2e-migrate',
      'ci-e2e-tests',
      'ci-pr-vercel-preview',
      'ci-smoke-required',
    ]) {
      expect(getJobBlock(workflow, jobKey), jobKey).toContain(
        "needs.ci-path-changes.result == 'success'"
      );
    }
  });
});

describe('CI Neon connection artifact contract', () => {
  it('binds every producer and consumer to the current run attempt', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const artifactLines = workflow
      .split('\n')
      .filter(line => line.includes('name: neon-db-connection-'));

    expect(artifactLines.length).toBeGreaterThan(1);
    expect(artifactLines).toEqual(
      artifactLines.map(
        () =>
          '          name: neon-db-connection-${{ github.run_id }}-${{ github.run_attempt }}'
      )
    );
    expect(workflow).not.toMatch(
      /name: neon-db-connection-\$\{\{ github\.run_id \}\}\s*$/m
    );

    const neonJob = getJobBlock(workflow, 'neon-db');
    expect(neonJob).toContain('SUFFIX="${RUN_ID}-${RUN_ATTEMPT}"');
    expect(neonJob).toContain(
      'name: neon-db-connection-${{ github.run_id }}-${{ github.run_attempt }}'
    );
  });
});

describe('CI test-performance path gate', () => {
  it('routes exact performance inputs to a hosted manual lane', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const pathJob = getJobBlock(workflow, 'ci-path-changes');
    const detectStep = getStepBlock(
      pathJob,
      'Detect path changes for all job types'
    );
    const performanceJob = getJobBlock(workflow, 'ci-test-performance');

    expect(pathJob).toContain(
      "run_test_performance: ${{ steps.detect.outputs.run_test_performance || 'false' }}"
    );
    expect(detectStep).toContain(
      'for t in run_build run_test run_test_performance run_storybook_a11y run_ui_visual run_public_lighthouse'
    );
    expect(detectStep).toContain(
      'echo "run_test_performance=false" >> "$GITHUB_OUTPUT"'
    );

    const pattern = detectStep.match(/TEST_PERFORMANCE_PATTERN='([^']+)'/)?.[1];
    expect(pattern).toBe(
      '^apps/web/scripts/test-performance-(guard\\.ts|profiler(\\.test)?\\.ts)$'
    );
    for (const input of [
      'apps/web/scripts/test-performance-guard.ts',
      'apps/web/scripts/test-performance-profiler.ts',
      'apps/web/scripts/test-performance-profiler.test.ts',
    ]) {
      expect(
        spawnSync('grep', ['-q', '-E', pattern!], { input }).status,
        input
      ).toBe(0);
    }
    expect(
      spawnSync('grep', ['-q', '-E', pattern!], {
        input: 'apps/web/tests/unit/example.test.ts',
      }).status
    ).toBe(1);

    expect(detectStep).not.toContain('DEEP_CI_LABEL');
    const generalTestElse = detectStep.match(
      /TEST_PATTERN=[\s\S]*?else\n\s+RUN_TEST=false([\s\S]*?)\n\s+fi/
    )?.[1];
    expect(generalTestElse).not.toContain('run_test_performance');
    const forkGuard = detectStep.slice(
      detectStep.indexOf('if [[ "$IS_FORK" == "true" ]]')
    );
    expect(forkGuard).toContain(
      'echo "run_test_performance=false" >> "$GITHUB_OUTPUT"'
    );

    expect(performanceJob).toContain(
      "github.event_name == 'workflow_dispatch'"
    );
    expect(performanceJob).not.toContain("github.event_name == 'pull_request'");
    expect(performanceJob).toContain(
      "run_full_ci=${{ needs.ci-path-changes.outputs.run_test == 'true' || needs.ci-path-changes.outputs.run_test_performance == 'true' }}"
    );
  });
});

describe('CI Storybook accessibility path gate', () => {
  it('classifies relevant paths; the scheduled visual-a11y lane owns execution', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const pathJob = getJobBlock(workflow, 'ci-path-changes');
    const detectStep = getStepBlock(
      pathJob,
      'Detect path changes for all job types'
    );

    expect(pathJob).toContain(
      "run_storybook_a11y: ${{ steps.detect.outputs.run_storybook_a11y || 'false' }}"
    );
    // The duplicate manual ci-storybook-a11y job was removed (JOV-4326); the
    // scheduled visual-a11y.yml storybook-a11y lane is the single owner.
    expect(workflow).not.toContain('ci-storybook-a11y:');
    expect(detectStep).not.toContain('DEEP_CI_LABEL');

    const pattern = detectStep.match(/STORYBOOK_A11Y_PATTERN='([^']+)'/)?.[1];
    expect(pattern).toBeTruthy();
    for (const input of [
      'apps/web/.storybook/main.ts',
      'apps/web/app/globals.css',
      'apps/web/components/atoms/Button.tsx',
      'apps/web/styles/theme.css',
      'apps/web/tailwind.config.ts',
      'apps/web/postcss.config.mjs',
      'apps/web/vitest.config.storybook.mts',
      'apps/web/package.json',
      'packages/ui/src/Button.tsx',
      'pnpm-lock.yaml',
      '.github/workflows/visual-a11y.yml',
    ]) {
      expect(
        spawnSync('grep', ['-q', '-E', pattern!], { input }).status,
        input
      ).toBe(0);
    }
    expect(
      spawnSync('grep', ['-q', '-E', pattern!], {
        input: 'apps/web/lib/unrelated.ts',
      }).status
    ).toBe(1);

    const visualWorkflow = readFileSync(visualA11yWorkflowPath, 'utf8');
    expect(visualWorkflow).toMatch(/^  schedule:/m);
    expect(visualWorkflow).not.toMatch(/^  push:/m);
    expect(visualWorkflow).not.toMatch(/^  pull_request:/m);
    expect(visualWorkflow).not.toContain('vars.CI_FAST_RUNNER');
    const visualPathJob = getJobBlock(visualWorkflow, 'ci-visual-path-changes');
    const visualDetectStep = getStepBlock(
      visualPathJob,
      'Detect visual-relevant changes'
    );
    expect(visualDetectStep).toContain(
      '[ "${{ github.event_name }}" == "workflow_dispatch" ] || [ "${{ github.event_name }}" == "schedule" ]'
    );
    expect(visualDetectStep).toContain(
      'echo "has_visual_changes=true" >> "$GITHUB_OUTPUT"'
    );
    const visualPattern = visualDetectStep.match(
      /VISUAL_PATTERNS='([^']+)'/
    )?.[1];
    expect(visualPattern).toBeTruthy();
    for (const input of [
      'apps/web/.storybook/preview.tsx',
      'apps/web/app/globals.css',
      'apps/web/styles/theme.css',
      'apps/web/tailwind.config.ts',
      'apps/web/postcss.config.mjs',
      'apps/web/package.json',
      'packages/ui/src/Button.tsx',
      'pnpm-lock.yaml',
      '.github/workflows/visual-a11y.yml',
    ]) {
      expect(
        spawnSync('grep', ['-q', '-E', visualPattern!], { input }).status,
        input
      ).toBe(0);
    }
  });
});

function previewRobotsPolicyValid(
  workflow: string,
  robotsBody: string
): boolean {
  const step = getStepBlock(workflow, 'Canary health check');
  const start = step.indexOf('preview_robots_policy_valid() {');
  const end = step.indexOf(
    '\n\n          if [ "$robots_code" != "200" ]',
    start
  );
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const source = step
    .slice(start, end)
    .split('\n')
    .map(line => line.replace(/^ {10}/, ''))
    .join('\n');

  return (
    spawnSync('bash', ['-c', `${source}\npreview_robots_policy_valid`], {
      input: robotsBody,
      encoding: 'utf8',
    }).status === 0
  );
}

function runTestFlightMarkerBootstrapGate(
  authorizationJob: string,
  candidateCount: number,
  acceptedBaseline: string
) {
  const functionName = 'testflight_marker_history_allows_legacy_bootstrap';
  const start = authorizationJob.indexOf(`          ${functionName}() {`);
  const end = authorizationJob.indexOf('\n          }', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);

  const source = authorizationJob
    .slice(start, end + '\n          }'.length)
    .split('\n')
    .map(line => line.replace(/^ {10}/, ''))
    .join('\n');

  return spawnSync(
    'bash',
    [
      '-c',
      `${source}\n${functionName} "$1" "$2"`,
      'marker-gate',
      String(candidateCount),
      acceptedBaseline,
    ],
    { encoding: 'utf8' }
  );
}

describe('deploy workflow Vercel env resolution', () => {
  it('gives every main SHA CI evidence and a production-controller opportunity', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const controller = readFileSync(productionControllerWorkflowPath, 'utf8');
    const ciTrigger = workflow.slice(0, workflow.indexOf('\npermissions:'));
    const controllerTrigger = controller.slice(
      0,
      controller.indexOf('\npermissions:')
    );

    expect(ciTrigger).toContain('push:');
    expect(ciTrigger).toContain('branches: [main]');
    expect(ciTrigger).not.toContain('paths-ignore:');
    expect(controllerTrigger).toContain('workflow_run:');
    expect(controllerTrigger).toContain('workflows: [CI]');
    expect(controllerTrigger).toContain('types: [completed]');
    expect(controllerTrigger).toContain('branches: [main]');
    expect(controllerTrigger).not.toContain('paths-ignore:');
    expect(workflow).not.toContain('  production-release:');
    expect(workflow).not.toContain('  production-verified:');
  });

  it('authorizes TestFlight only after exact production proof without duplicating Xcode tests', () => {
    const testflight = readFileSync(iosTestFlightWorkflowPath, 'utf8');
    const envValidator = readFileSync(iosTestFlightEnvValidatorPath, 'utf8');
    const artifactValidator = readFileSync(
      iosTestFlightArtifactValidatorPath,
      'utf8'
    );
    const fastlane = readFileSync(fastlanePath, 'utf8');
    const trigger = testflight.slice(0, testflight.indexOf('\npermissions:'));
    const workflowHeader = testflight.slice(0, testflight.indexOf('\njobs:'));
    const authorization = getJobBlock(testflight, 'authorize-release');
    const beta = getJobBlock(testflight, 'beta');
    const uploadMarker = getJobBlock(testflight, 'record-upload');

    expect(trigger).toContain('workflow_dispatch:');
    expect(trigger).toContain('workflow_run:');
    expect(trigger).toContain('workflows: [Production Controller]');
    expect(trigger).toContain('types: [completed]');
    expect(trigger).toContain('branches: [main]');
    expect(trigger).not.toMatch(/^  push:/m);
    expect(workflowHeader).toContain('group: ios-testflight');
    expect(workflowHeader).toContain('cancel-in-progress: false');
    expect(workflowHeader).not.toContain('github.ref');

    expect(authorization).toContain(
      "github.event.workflow_run.conclusion == 'success'"
    );
    expect(authorization).toContain(
      '.path == ".github/workflows/production-controller.yml"'
    );
    expect(authorization).toContain(
      'actions/workflows/production-controller.yml'
    );
    expect(authorization).toContain('.name == "Production Controller"');
    expect(authorization).toContain(
      '(.workflow_id | tostring) == $workflow_id'
    );
    expect(authorization).toContain('test("^Production Controller " + $sha +');
    expect(authorization).not.toMatch(
      /\.event == "workflow_run" and\n\s+\.name == "Production Controller"/
    );
    expect(authorization).toContain('.name == "Production Verified"');
    expect(authorization).toContain('.head_sha == $sha');
    expect(authorization).toContain('.conclusion == "success"');
    expect(authorization).toContain('commits/main');
    expect(authorization).toContain('status=completed');
    expect(authorization).toContain(
      'production-generation-verified-$expected_sha'
    );
    expect(authorization).toContain('.controllerRun == $run');
    expect(
      authorization.indexOf('prove_existing_production_marker "$release_sha"')
    ).toBeLessThan(
      authorization.indexOf(
        'if [ "$EVENT_NAME" = "workflow_dispatch" ]; then\n            exit 0'
      )
    );
    expect(authorization).toContain(
      'actions/runs/$run_id/attempts/$attempt/jobs?per_page=100'
    );
    expect(authorization).toContain('.name == "Upload Internal TestFlight"');
    expect(authorization).toContain(
      'actions/artifacts?name=$marker_name&per_page=100'
    );
    expect(
      authorization.indexOf('marker_name="testflight-upload-verified"')
    ).toBeLessThan(
      authorization.indexOf(
        'actions/workflows/ios-testflight.yml/runs?branch=main&status=completed&per_page=100'
      )
    );
    const legacyHistory = authorization.slice(
      authorization.indexOf(
        'actions/workflows/ios-testflight.yml/runs?branch=main&status=completed&per_page=100'
      )
    );
    expect(legacyHistory).toContain(
      '(.workflow_id | tostring) == $workflow_id'
    );
    expect(legacyHistory).not.toContain(
      '.display_title == ("iOS TestFlight " + .head_sha)'
    );
    const completedRunSelection = legacyHistory.slice(
      0,
      legacyHistory.indexOf(
        '# The marker job can fail after App Store Connect has accepted beta'
      )
    );
    expect(completedRunSelection).toContain('.status == "completed"');
    expect(completedRunSelection).not.toContain('.conclusion == "success"');
    expect(legacyHistory).toContain('for attempt in $(seq 1 "$run_attempt")');
    expect(legacyHistory).toContain('run_has_upload=true');
    expect(authorization).toContain(
      'actions/runs/$run_id/attempts/$upload_attempt'
    );
    expect(authorization).toContain('(.id | tostring) == $job');
    expect(authorization).toContain('.uploadRunAttempt');
    expect(authorization).toContain('.uploadJob');
    expect(authorization).toContain(
      'No proven TestFlight upload baseline exists; treating this as the first verified release.'
    );
    expect(authorization).not.toContain(
      'No exact successful TestFlight upload was found in the bounded run history.'
    );
    expect(authorization).toContain('if [ "$beta_count" = "1" ]');
    expect(authorization).toContain('baseline_sha="$run_sha"');
    expect(authorization).toContain('break');
    expect(authorization).toContain('already_released=true');
    expect(authorization).toContain(
      'git merge-base --is-ancestor "$BASELINE_SHA" "$RELEASE_SHA"'
    );
    expect(authorization).toContain('.github/workflows/ios-ci.yml');
    expect(authorization).toContain('.github/workflows/ios-testflight.yml');
    expect(authorization).toContain(
      'git diff --name-only "$BASELINE_SHA" "$RELEASE_SHA" -- "${release_paths[@]}"'
    );
    expect(authorization).not.toContain('--diff-filter=d');
    expect(readFileSync(workflowPath, 'utf8')).toContain(
      '.github/workflows/ios-(ci|testflight)\\.yml'
    );
    expect(readFileSync(ciFastLanesPath, 'utf8')).toContain(
      "'.github/workflows/ios-testflight.yml'"
    );

    expect(beta).toContain('needs: [authorize-release]');
    expect(beta).toContain(
      "needs.authorize-release.outputs.should_release == 'true'"
    );
    expect(beta).toContain(
      'ref: ${{ needs.authorize-release.outputs.release_sha }}'
    );
    expect(beta).toContain('bundle exec fastlane ios beta');
    expect(beta).not.toContain('bundle exec fastlane ios ios_tests');
    expect(beta).not.toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
    expect(beta).toContain('GH_TOKEN: ${{ github.token }}');

    expect(uploadMarker).toContain("needs.beta.result == 'success'");
    expect(uploadMarker.match(/^    steps:$/gm)).toHaveLength(1);
    expect(uploadMarker).toContain('for attempt in $(seq 1 "$RUN_ATTEMPT")');
    expect(uploadMarker).toContain('upload_attempt="$attempt"');
    expect(uploadMarker).toContain(
      'No successful exact TestFlight upload job exists in this run.'
    );
    expect(uploadMarker).toContain('actions/workflows/ios-testflight.yml');
    expect(uploadMarker).toContain('.name == "iOS TestFlight"');
    expect(uploadMarker).toContain('(.workflow_id | tostring) == $workflow_id');
    expect(uploadMarker).toContain(
      '.display_title == ("iOS TestFlight " + $sha)'
    );
    expect(uploadMarker).not.toMatch(
      /\.run_attempt \| tostring\) == \$attempt and\n\s+\.name == "iOS TestFlight"/
    );
    expect(uploadMarker).toContain(
      '.path == ".github/workflows/ios-testflight.yml"'
    );
    expect(uploadMarker).toContain('.name == "Upload Internal TestFlight"');
    expect(uploadMarker).toContain('workflowRun: $workflow_run');
    expect(uploadMarker).toContain('uploadRunAttempt: $upload_attempt');
    expect(uploadMarker).toContain('uploadJob: $upload_job');
    expect(uploadMarker).toContain('name: testflight-upload-verified');
    expect(uploadMarker).toContain('retention-days: 90');

    expect(envValidator).toContain('CLERK_ASSOCIATED_DOMAIN');
    expect(envValidator).not.toContain('CLERK_PUBLISHABLE_KEY');
    expect(fastlane).not.toContain('require_env!("CLERK_PUBLISHABLE_KEY")');
    expect(fastlane).toContain('def verify_release_sha_is_current_main!');
    expect(fastlane).toContain('repos/#{repository}/commits/main');
    const finalMainCheck = fastlane.lastIndexOf(
      'verify_release_sha_is_current_main!'
    );
    expect(fastlane.indexOf('gym(')).toBeLessThan(finalMainCheck);
    expect(finalMainCheck).toBeLessThan(
      fastlane.indexOf('upload_to_testflight(')
    );
    expect(artifactValidator).toContain(
      'still embeds retired ClerkPublishableKey'
    );
  });

  it('fails closed on unprovable stable TestFlight marker history', () => {
    const testflight = readFileSync(iosTestFlightWorkflowPath, 'utf8');
    const authorization = getJobBlock(testflight, 'authorize-release');
    const legacyLookup =
      'actions/workflows/ios-testflight.yml/runs?branch=main&status=completed&per_page=100';
    const gateCall = 'if ! testflight_marker_history_allows_legacy_bootstrap';

    expect(authorization).toContain(
      'marker_candidate_count="$(jq --arg name "$marker_name"'
    );
    expect(authorization).toContain(gateCall);
    expect(authorization.indexOf(gateCall)).toBeLessThan(
      authorization.indexOf(legacyLookup)
    );
    expect(authorization).toContain(
      'Stable TestFlight markers exist, but none fully proves a successful upload.'
    );
    expect(authorization).toContain(
      'Ignoring malformed TestFlight upload marker artifact $artifact_id.'
    );

    const olderValid = runTestFlightMarkerBootstrapGate(
      authorization,
      2,
      'a'.repeat(40)
    );
    expect(olderValid.status).toBe(0);

    const allUnprovable = runTestFlightMarkerBootstrapGate(
      authorization,
      2,
      ''
    );
    expect(allUnprovable.status).not.toBe(0);

    const trueZero = runTestFlightMarkerBootstrapGate(authorization, 0, '');
    expect(trueZero.status).toBe(0);
  });

  it('cross-proves workflow identity instead of comparing run-name to workflow name', () => {
    const fixture = JSON.parse(
      readFileSync(productionControllerRunLiveFixturePath, 'utf8')
    ) as {
      run: {
        name: string;
        display_title: string;
        path: string;
        workflow_id: number;
        head_sha: string;
      };
      workflow: { id: number; name: string; path: string };
    };
    const authorization = getJobBlock(
      readFileSync(iosTestFlightWorkflowPath, 'utf8'),
      'authorize-release'
    );

    expect(fixture.run.name).toBe(fixture.run.display_title);
    expect(fixture.run.name).not.toBe(fixture.workflow.name);
    expect(fixture.run.workflow_id).toBe(fixture.workflow.id);
    expect(fixture.run.path).toBe(fixture.workflow.path);
    expect(fixture.run.display_title).toMatch(
      new RegExp(
        `^Production Controller ${fixture.run.head_sha} from CI [1-9][0-9]* attempt [1-9][0-9]*$`
      )
    );
    expect(authorization).toContain(
      'production_controller_workflow_id="$(jq -r'
    );
    expect(authorization).toContain("'.id | tostring'");
    expect(authorization).toContain(
      '(.workflow_id | tostring) == $workflow_id'
    );
  });

  it('keeps the dependency-free risk classifier off dependency caches', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const classifierJob = getJobBlock(workflow, 'ci-risk-classifier');

    expect(classifierJob).toContain('timeout-minutes: 3');
    expect(classifierJob).toContain(
      'uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'
    );
    expect(classifierJob).toContain("node-version: '22'");
    // biome-ignore format: exact-diff/fail-closed contract stays compact for the integration-train cap
    expect([classifierJob.includes('fetch-depth: 0'), classifierJob.includes('filter: blob:none'), classifierJob.includes('git cat-file -e "${DIFF_BASE}^{commit}"'), classifierJob.includes('git diff --name-only "$DIFF_BASE" "${{ github.event.merge_group.head_sha }}"'), classifierJob.includes('DIFF_BASE="${{ github.event.before }}"'), classifierJob.includes('|| git show')]).toEqual([true, true, true, true, true, false]);
    expect(classifierJob).toContain(
      'node scripts/ci-harness.mjs classify-risk'
    );
    expect(classifierJob).not.toContain(
      'uses: ./.github/actions/setup-node-pnpm'
    );
    expect(classifierJob).not.toMatch(
      /(?:\bpnpm (?:fetch|install)\b|\bcache:)/
    );
  });

  it('routes the direct-main fallback build and layout to one hosted workspace', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const buildJob = getJobBlock(workflow, 'ci-build-layout');

    expect(buildJob).toContain("github.ref == 'refs/heads/main'");
    expect(buildJob).toContain('runs-on: ubuntu-latest');
    expect(buildJob).toContain('Build exact combined head');
    expect(buildJob).toContain('Run deterministic layout behavior guard');
    expect(buildJob).not.toContain('actions/upload-artifact');
    expect(buildJob).not.toContain('actions/download-artifact');
  });

  it('runs every release control job on hosted capacity', () => {
    const workflow = readFileSync(productionReleaseWorkflowPath, 'utf8');

    for (const job of [
      'release-head',
      'deploy-staging',
      'staging-head',
      'alias-staging',
      'production-head',
      'promote-production',
      'release-result',
    ]) {
      expect(getJobBlock(workflow, job)).toContain('runs-on: ubuntu-latest');
    }
    expect(readFileSync(canaryWorkflowPath, 'utf8')).toContain(
      'runs-on: ubuntu-latest'
    );
  });

  it('serializes only the aliased staging OAuth proof', () => {
    const workflow = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const oauthStep = getStepBlock(
      getJobBlock(workflow, 'alias-staging'),
      'Verify aliased staging OAuth redirect URIs'
    );

    expect(oauthStep).toContain(
      'until PLAYWRIGHT_WORKERS=1 CI=true SMOKE_ONLY=1 \\\n'
    );
    expect(oauthStep).toContain(
      'node "$GITHUB_WORKSPACE/.github/scripts/guard-playwright-artifacts.mjs" --run --'
    );
    expect(oauthStep).toContain(
      'pnpm exec playwright test tests/e2e/oauth-providers.spec.ts'
    );
    expect(oauthStep).toContain('--project=chromium --reporter=line');
    expect(oauthStep).toContain('max_attempts=3');
    expect(oauthStep).toContain('sleep "$sleep_seconds"');
    expect(workflow).not.toMatch(/^\s+PLAYWRIGHT_WORKERS:/m);
  });

  it('cross-proves one-shot CI evidence under one dedicated FIFO production lease', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const controller = readFileSync(productionControllerWorkflowPath, 'utf8');
    const controllerHeader = controller.slice(0, controller.indexOf('\njobs:'));
    const provenanceJob = getJobBlock(workflow, 'main-queue-provenance');
    const readinessJob = getJobBlock(workflow, 'main-release-ready');
    const authorization = getJobBlock(controller, 'authorize-production');
    const releaseCaller = getJobBlock(controller, 'production-release');
    const verified = getJobBlock(controller, 'production-verified');
    const reusable = readFileSync(productionReleaseWorkflowPath, 'utf8');

    expect(provenanceJob).toContain(
      'node .github/scripts/verify-main-release-readiness.mjs'
    );
    expect(readinessJob).toContain('QUEUE_PROVEN');
    expect(readinessJob).toContain('Unit Tests (five shards)');
    expect(readinessJob).toContain('Build + Layout');
    expect(readinessJob).toContain('Promptfoo Evals');
    expect(readinessJob).toContain('Golden Eval Set');
    expect(readinessJob).toContain('RUN_PROMPTFOO');
    expect(readinessJob).toContain('RUN_GOLDEN_EVAL');
    expect(readinessJob).toContain(
      'Main fallback $name did not pass (result $result)'
    );
    expect(readinessJob).toContain(
      'Main fallback ran $name without path selection (result $result)'
    );
    expect(readinessJob).toContain('did not pass (result $result)');
    expect(releaseCaller).toContain(
      'uses: ./.github/workflows/production-release.yml'
    );
    expect(controllerHeader).toContain('group: production-mutation');
    expect(controllerHeader).toContain('queue: max');
    expect(controllerHeader).toContain('cancel-in-progress: false');
    expect(authorization).toContain(
      'actions/runs/$TRIGGER_RUN_ID/attempts/$TRIGGER_RUN_ATTEMPT'
    );
    expect(authorization).toContain(
      '(.run_attempt | tostring) == $run_attempt'
    );
    expect(authorization).toContain('.name == "Main Release Ready"');
    expect(authorization).toContain('.head_sha == $sha');
    expect(authorization).toContain('.total_count == (.jobs | length)');
    expect(authorization).not.toContain('gh api --paginate --slurp');
    expect(releaseCaller).not.toContain('concurrency:');
    expect(verified).not.toContain('concurrency:');
    expect(reusable).not.toContain('concurrency:');
  });

  it('passes the exact GitHub SHA into every external Vercel build and source deploy', () => {
    const workflow = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const buildShaEnv = 'VERCEL_GIT_COMMIT_SHA: ${{ inputs.expected_sha }}';
    const stagingJob = getJobBlock(workflow, 'deploy-staging');
    const deployStep = getStepBlock(
      stagingJob,
      'Deploy (staging preview, prebuilt)'
    );
    const deployScript = readFileSync(
      resolve(repoRoot, '.github/scripts/vercel-prebuilt-deploy.sh'),
      'utf8'
    );

    expect(
      getStepBlock(
        stagingJob,
        'Build (preview target for staging verification)'
      )
    ).toContain(buildShaEnv);
    expect(deployStep).toContain(buildShaEnv);
    expect(deployScript).toContain('--build-env VERCEL_GIT_COMMIT_SHA');
    expect(deployScript).toContain('--env VERCEL_GIT_COMMIT_SHA');
    expect(deployScript).not.toMatch(/--(?:build-)?env\s+[^\s]+=/);
    expect(deployScript).not.toContain('--token');
  });

  it('keeps Vercel secrets and runtime values out of every preview and production process argument', () => {
    const previewWorkflow = readFileSync(workflowPath, 'utf8');
    const productionWorkflow = readFileSync(
      productionReleaseWorkflowPath,
      'utf8'
    );
    const helperSources = [
      readFileSync(vercelPrebuiltDeployPath, 'utf8'),
      readFileSync(productionAliasVerifierPath, 'utf8'),
      readFileSync(productionPromotionControllerPath, 'utf8'),
    ];
    const vercelSources = [
      previewWorkflow,
      productionWorkflow,
      ...helperSources,
    ].join('\n');

    expect(vercelSources).not.toMatch(/--token(?:[=\s"']|$)/);
    expect(vercelSources).not.toMatch(
      /--(?:build-)?env\s+["']?[A-Z][A-Z0-9_]*=/
    );

    const previewDeploy = getStepBlock(
      getJobBlock(previewWorkflow, 'ci-pr-vercel-preview'),
      'Deploy (PR preview, fast deployment for UI-only changes)'
    );
    expect(previewDeploy).toContain('export DATABASE_URL="$POOLED_URL"');
    expect(previewDeploy).toContain('export GIT_BRANCH');
    expect(previewDeploy).toContain('--env DATABASE_URL');
    expect(previewDeploy).toContain('--env GIT_BRANCH');

    const packageJson = JSON.parse(
      readFileSync(resolve(repoRoot, 'package.json'), 'utf8')
    ) as { devDependencies: Record<string, string> };
    const vercelEntry = readFileSync(
      resolve(repoRoot, 'node_modules/vercel/dist/index.js'),
      'utf8'
    );
    const vercelDeploy = readFileSync(
      resolve(repoRoot, 'node_modules/vercel/dist/commands/deploy/index.js'),
      'utf8'
    );
    expect(packageJson.devDependencies.vercel).toBe('56.3.2');
    expect(vercelEntry).toContain('else if (process.env.VERCEL_TOKEN)');
    expect(vercelDeploy).toContain('val = process.env[key]');
    expect(vercelDeploy).toContain('Reading ${import_chalk.default.bold(');

    const fixtureRoot = mkdtempSync(
      resolve(tmpdir(), 'jovie-vercel-argv-contract-')
    );
    try {
      const binDirectory = resolve(fixtureRoot, 'bin');
      const fakeVercel = resolve(binDirectory, 'vercel');
      const argvCapture = resolve(fixtureRoot, 'argv.bin');
      const githubOutput = resolve(fixtureRoot, 'github-output');
      mkdirSync(binDirectory);
      writeFileSync(
        fakeVercel,
        `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\0' "$@" > "$ARGV_CAPTURE"
printf 'raw-cli-output:%s\\n' "$VERCEL_TOKEN"
printf 'https://jovie-argv-contract-jovie.vercel.app\\n'
`
      );
      chmodSync(fakeVercel, 0o700);

      const secret = 'argv-contract-token-must-not-appear';
      const runtimeValue = 'argv-contract-sha-value-must-not-appear';
      const result = spawnSync(
        'bash',
        [vercelPrebuiltDeployPath, 'deployment_url', '--yes'],
        {
          cwd: fixtureRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            ARGV_CAPTURE: argvCapture,
            GITHUB_OUTPUT: githubOutput,
            PATH: `${binDirectory}:${process.env.PATH ?? ''}`,
            RUNNER_TEMP: fixtureRoot,
            VERCEL_ENABLE_SOURCE_FALLBACK: 'true',
            VERCEL_FORCE_SOURCE_DEPLOY: 'true',
            VERCEL_GIT_COMMIT_SHA: runtimeValue,
            VERCEL_ORG_ID: 'jovie-team',
            VERCEL_TOKEN: secret,
          },
        }
      );

      expect(result.status, result.stderr).toBe(0);
      const argv = readFileSync(argvCapture, 'utf8').split('\0');
      expect(argv).toContain('--build-env');
      expect(argv).toContain('VERCEL_GIT_COMMIT_SHA');
      expect(argv).toContain('--env');
      expect(argv).not.toContain(secret);
      expect(argv).not.toContain(runtimeValue);
      expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
      expect(`${result.stdout}${result.stderr}`).not.toContain(
        'raw-cli-output:'
      );
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it('maps secrets through step env instead of interpolating them into shell source', () => {
    for (const workflowPath of [
      productionControllerWorkflowPath,
      productionReleaseWorkflowPath,
      canaryWorkflowPath,
    ]) {
      const workflow = readFileSync(workflowPath, 'utf8');
      const runBlocks = getShellRunBlocks(workflow);
      expect(runBlocks.length).toBeGreaterThan(0);
      for (const runBlock of runBlocks) {
        expect(runBlock).not.toContain('${{ secrets.');
      }
    }

    const controller = readFileSync(productionControllerWorkflowPath, 'utf8');
    const credentialCheck = getStepBlock(
      controller,
      'Check for production auth credentials'
    );
    expect(credentialCheck).toContain(
      'E2E_PROD_USER_EMAIL: ${{ secrets.E2E_PROD_USER_EMAIL }}'
    );
    expect(credentialCheck).toContain('[ -n "$E2E_PROD_USER_EMAIL" ]');
    expect(credentialCheck).not.toContain(
      '[ -n "${{ secrets.E2E_PROD_USER_EMAIL }}" ]'
    );
  });

  it('pins Vercel pull and build commands to the configured project', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const productionWorkflow = readFileSync(
      productionReleaseWorkflowPath,
      'utf8'
    );
    const steps = [
      {
        command: 'vercel pull',
        name: 'Pull env (preview)',
      },
      {
        command: 'vercel build',
        name: 'Build (PR preview)',
      },
    ];

    for (const { command, name } of steps) {
      const step = getStepBlock(workflow, name);

      expect(step).toContain('VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}');
      expect(step).toContain(
        'VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}'
      );
      expect(step).toContain('VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}');
      expect(step).toContain(command);
      expect(step).toContain('scope_args=()');
      expect(step).toContain('if [ -n "${VERCEL_ORG_ID:-}" ]; then');
      expect(step).toContain('scope_args=(--scope "$VERCEL_ORG_ID")');
      expect(step).toContain('"${scope_args[@]}"');
      expect(step).not.toContain('--scope ${{ secrets.VERCEL_ORG_ID }}');
    }

    const stagingJob = getJobBlock(productionWorkflow, 'deploy-staging');
    const stagingSteps = [
      {
        command: 'vercel pull',
        name: 'Pull env (staging preview)',
      },
      {
        command: 'vercel build',
        name: 'Build (preview target for staging verification)',
      },
    ];

    expect(stagingJob).not.toContain(
      '- name: Configure staging deployment credentials'
    );
    expect(stagingJob).not.toContain('>> "$GITHUB_ENV"');

    const queueReaperStep = getStepBlock(
      stagingJob,
      'Cancel stale Vercel preview deployments'
    );
    expect(queueReaperStep).toContain(
      'node .github/scripts/cancel-stale-vercel-previews.mjs'
    );

    for (const { command, name } of stagingSteps) {
      const step = getStepBlock(stagingJob, name);
      expect(step).toContain('VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}');
      expect(step).toContain(
        'VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}'
      );
      expect(step).toContain('VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}');
      expect(step).toContain(command);
      expect(step).toContain('scope_args=()');
      expect(step).toContain('scope_args=(--scope "$VERCEL_ORG_ID")');
      expect(step).toContain('"${scope_args[@]}"');
    }
  });

  it('scopes prebuilt Vercel deploys to the configured team', () => {
    const deployScript = readFileSync(
      resolve(repoRoot, '.github/scripts/vercel-prebuilt-deploy.sh'),
      'utf8'
    );

    expect(deployScript).toContain('VERCEL_SCOPE_ARGS=()');
    expect(deployScript).toContain(
      'VERCEL_SCOPE_ARGS=(--scope "$VERCEL_ORG_ID")'
    );
    expect(deployScript).toContain('"${VERCEL_SCOPE_ARGS[@]}"');
    expect(deployScript).toContain('.vercel/jovie-generated-public-files');
    expect(deployScript).toContain('rm -f -- "$generated_file"');
    expect(deployScript).toContain('VERCEL_FORCE_SOURCE_DEPLOY');
  });

  it('builds the staging prebuilt in-job and refuses source-cache substitution', () => {
    const workflow = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const stagingJob = getJobBlock(workflow, 'deploy-staging');
    const buildStep = getStepBlock(
      stagingJob,
      'Build (preview target for staging verification)'
    );
    const deployStep = getStepBlock(
      workflow,
      'Deploy (staging preview, prebuilt)'
    );

    expect(deployStep).not.toContain('VERCEL_FORCE_SOURCE_DEPLOY');
    expect(deployStep).toContain("VERCEL_ENABLE_SOURCE_FALLBACK: 'false'");
    expect(stagingJob).not.toContain('download_vercel_build');
    expect(stagingJob).not.toContain('restore_vercel_build');
    expect(buildStep).toContain('jovie-generated-public-files');
    expect(buildStep).not.toContain('steps.restore_vercel_build');
  });

  it('packages generated public trace files and budgets remote fallback readiness', () => {
    const workflow = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const stagingJob = getJobBlock(workflow, 'deploy-staging');
    const buildStep = getStepBlock(
      stagingJob,
      'Build (preview target for staging verification)'
    );
    const readinessStep = getStepBlock(
      stagingJob,
      'Wait for staging deployment readiness'
    );

    expect(buildStep).toContain(
      'cp apps/web/.next/server/app/robots.txt.body apps/web/public/robots.txt'
    );
    expect(buildStep).toContain('.vercel/jovie-generated-public-files');
    expect(readinessStep).toContain('--timeout 20m');
    expect(readinessStep).toContain('BUILDING|QUEUED|INITIALIZING)');
    expect(readinessStep).toContain('handing off to retrying canary');
  });

  it('passes signup readiness keys into the staging preview runtime', () => {
    const workflow = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const deployStep = getStepBlock(
      workflow,
      'Deploy (staging preview, prebuilt)'
    );
    const runtimeKeys = [
      'VERCEL_AUTOMATION_BYPASS_SECRET',
      'NEXT_PUBLIC_BETTER_AUTH_URL',
      'BETTER_AUTH_SECRET',
      'BETTER_AUTH_URL',
      'AUTH_GOOGLE_CLIENT_ID',
      'AUTH_GOOGLE_CLIENT_SECRET',
      'AUTH_APPLE_CLIENT_ID',
      'AUTH_APPLE_TEAM_ID',
      'AUTH_APPLE_KEY_ID',
      'AUTH_APPLE_PRIVATE_KEY',
      'DATABASE_URL',
      'SESSION_SECRET',
      'AI_GATEWAY_API_KEY',
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
      'TURNSTILE_SECRET_KEY',
    ];

    expect(deployStep).toContain('required_runtime_env=(');
    expect(deployStep).toContain('Missing staging preview runtime env:');

    for (const key of runtimeKeys) {
      expect(deployStep).toContain(key);
      expect(deployStep).toContain(`--env ${key}`);
      expect(deployStep).not.toContain(`--env ${key}=`);
    }

    const deployAllowlist = deployStep
      .split('\n')
      .find(line => line.includes('--only-secrets='));
    for (const key of [
      'AUTH_GOOGLE_CLIENT_ID',
      'AUTH_GOOGLE_CLIENT_SECRET',
      'AUTH_APPLE_CLIENT_ID',
      'AUTH_APPLE_TEAM_ID',
      'AUTH_APPLE_KEY_ID',
      'AUTH_APPLE_PRIVATE_KEY',
    ]) {
      expect(deployAllowlist).toContain(key);
    }

    const buildStep = getStepBlock(
      workflow,
      'Build (preview target for staging verification)'
    );
    for (const key of [
      'AUTH_GOOGLE_CLIENT_ID',
      'AUTH_GOOGLE_CLIENT_SECRET',
      'AUTH_APPLE_CLIENT_ID',
      'AUTH_APPLE_TEAM_ID',
      'AUTH_APPLE_KEY_ID',
      'AUTH_APPLE_PRIVATE_KEY',
    ]) {
      const buildAllowlist = buildStep
        .split('\n')
        .find(line => line.includes('--only-secrets='));
      expect(buildAllowlist).toContain(key);
    }
  });

  it('checks staging signup readiness against the deploy env before building the promotion artifact', () => {
    const workflow = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const readinessStep = getStepBlock(
      workflow,
      'Check signup readiness (staging deploy env)'
    );
    const buildStep = getStepBlock(
      workflow,
      'Build (preview target for staging verification)'
    );
    const readinessIndex = workflow.indexOf(
      '- name: Check signup readiness (staging deploy env)'
    );
    const buildIndex = workflow.indexOf(
      '- name: Build (preview target for staging verification)'
    );

    expect(readinessIndex).toBeGreaterThanOrEqual(0);
    expect(buildIndex).toBeGreaterThan(readinessIndex);
    expect(readinessStep).toContain('--target=stg');
    expect(readinessStep).toContain('--source=env');
    expect(readinessStep).not.toContain('--source=vercel-file');
    expect(buildStep).toContain('vercel build');
  });

  it('loads production runtime config from Doppler without yielding Vercel deployment identity', () => {
    const workflow = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const promoteJob = getJobBlock(workflow, 'promote-production');
    const stageStep = getStepBlock(
      promoteJob,
      'Build and stage production deployment'
    );
    const dopplerIndex = promoteJob.indexOf(
      '- uses: ./.github/actions/setup-doppler'
    );
    const domainGuardIndex = promoteJob.indexOf(
      '- name: Verify production domains are on canonical Vercel project'
    );
    const runtimeKeys = [
      'NEXT_PUBLIC_BETTER_AUTH_URL',
      'BETTER_AUTH_SECRET',
      'DATABASE_URL',
      'SESSION_SECRET',
      'AI_GATEWAY_API_KEY',
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
      'TURNSTILE_SECRET_KEY',
    ];

    expect(dopplerIndex).toBeGreaterThanOrEqual(0);
    expect(domainGuardIndex).toBeGreaterThan(dopplerIndex);
    expect(promoteJob).not.toContain('doppler-token:');
    expect(promoteJob).not.toContain(
      '- name: Configure production deployment credentials'
    );
    expect(promoteJob).not.toContain('>> "$GITHUB_ENV"');
    for (const key of ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID']) {
      expect(stageStep).toContain(`${key}: \${{ secrets.${key} }}`);
    }

    expect(stageStep).toContain(
      'DOPPLER_TOKEN: ${{ secrets.DOPPLER_TOKEN_PRD }}'
    );
    expect(stageStep).toContain('doppler run --project jovie-web --config prd');
    expect(stageStep).toContain(`--only-secrets=${runtimeKeys.join(',')}`);
    expect(stageStep).toContain(
      '--no-fallback -- env -u DOPPLER_TOKEN bash -c production_stage'
    );
    expect(stageStep).toContain('--target=prd --source=env');
    expect(stageStep).not.toContain('--target=prd --source=vercel-file');
    expect(stageStep).toContain('required_runtime_env=(');
    expect(stageStep).toContain('Missing production runtime env:');
    expect(stageStep).toContain('runtime_env_args+=(--env "$key")');
    expect(stageStep).toContain('"${runtime_env_args[@]}"');
    expect(stageStep).not.toMatch(/--env\s+"?[^\s"]+=/);
    expect(stageStep).not.toContain('--token');
    for (const key of runtimeKeys) {
      expect(stageStep).toContain(key);
    }
  });

  it('verifies production promotion through the canonical public alias', () => {
    const workflow = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const promoteJob = getJobBlock(workflow, 'promote-production');
    const domainGuardStep = getStepBlock(
      promoteJob,
      'Verify production domains are on canonical Vercel project'
    );
    const stageStep = getStepBlock(
      promoteJob,
      'Build and stage production deployment'
    );
    const promoteStep = getStepBlock(
      promoteJob,
      'Promote staged production deployment'
    );
    const verifyStep = getStepBlock(
      promoteJob,
      'Verify canonical production deployment'
    );
    const domainGuardIndex = promoteJob.indexOf(
      '- name: Verify production domains are on canonical Vercel project'
    );
    const stageIndex = promoteJob.indexOf(
      '- name: Build and stage production deployment'
    );
    const promoteIndex = promoteJob.indexOf(
      '- name: Promote staged production deployment'
    );
    const verifyIndex = promoteJob.indexOf(
      '- name: Verify canonical production deployment'
    );

    expect(domainGuardIndex).toBeGreaterThanOrEqual(0);
    expect(stageIndex).toBeGreaterThan(domainGuardIndex);
    expect(promoteIndex).toBeGreaterThan(stageIndex);
    expect(verifyIndex).toBeGreaterThan(promoteIndex);
    expect(promoteJob).toContain(
      'steps.stage-production.outputs.failure_subtype || steps.promote.outputs.failure_subtype || steps.verify-production.outputs.failure_subtype'
    );
    expect(domainGuardStep).toContain('id: domain-guard');
    expect(domainGuardStep).toContain(
      'node .github/scripts/verify-vercel-production-domains.mjs'
    );
    expect(domainGuardStep).toContain(
      'VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}'
    );
    expect(domainGuardStep).toContain(
      'failure_subtype=domain_project_mismatch'
    );
    expect(stageStep).toContain('--prod --skip-domain --format=json');
    expect(stageStep).toContain(
      'assert-authorized-origin "$production_deploy_url" "$inspected_url"'
    );
    expect(stageStep).toContain('bootstrap-cookie-jar');
    expect(stageStep).toContain('EXPECTED_VERCEL_ENVIRONMENT=production');
    expect(stageStep).toContain('VERCEL_VERIFY_PUBLIC_SURFACES=true');
    expect(stageStep).toContain('VERCEL_PROBE_TIMEOUT_MS=180000');
    expect(stageStep).not.toContain('fetch_staged');
    expect(stageStep).not.toContain('STAGED_RESPONSE');
    expect(stageStep).not.toContain('curl -sS -L');
    expect(stageStep).not.toContain('bypass_args');
    expect(stageStep).not.toContain('x-vercel-protection-bypass');
    expect(promoteStep).toContain(
      'bash .github/scripts/promote-production-deployment.sh'
    );
    expect(verifyStep).toContain(
      'bash .github/scripts/verify-production-alias.sh'
    );
    expect(verifyStep).toContain('EXPECTED_PRODUCTION_DEPLOYMENT_ID');
  });

  it('settles hosted post-deploy probes before announcing Production Verified', () => {
    const workflow = readFileSync(productionControllerWorkflowPath, 'utf8');
    const verified = getJobBlock(workflow, 'production-verified');
    const lighthouse = getJobBlock(workflow, 'lighthouse-ci');
    const publicSmoke = getJobBlock(workflow, 'ci-public-profile-smoke');
    const authSmoke = getJobBlock(workflow, 'ci-post-deploy-auth-smoke');

    for (const job of [
      'ci-public-profile-smoke',
      'ci-post-deploy-auth-smoke',
      'lighthouse-ci',
    ]) {
      const block = getJobBlock(workflow, job);
      expect(block).toContain('runs-on: ubuntu-latest');
      expect(block).not.toContain('continue-on-error: true');
      expect(block).toContain(
        'needs.production-release.outputs.production_deployment_url_b64'
      );
      expect(block).toContain('base64 --decode');
      expect(block).not.toContain(
        'needs.production-release.outputs.production_deployment_url }}'
      );
      expect(block).not.toContain('verify-production-alias.sh');
    }
    expect(lighthouse).toContain('uses: ./.github/actions/setup-playwright');
    expect(lighthouse).toContain('permissions:\n      contents: read');
    expect(lighthouse).toContain('persist-credentials: false');
    expect(lighthouse).not.toContain('id-token: write');
    expect(lighthouse).not.toContain('attestations: write');
    expect(lighthouse).toContain(
      "require('playwright').chromium.executablePath()"
    );
    expect(lighthouse).toContain('echo "CHROME_PATH=$chrome_path"');
    expect(lighthouse).toContain('lighthouse-production-exact.json');
    expect(lighthouse).toContain('gsub("\\\\."; "\\\\.")');
    expect(lighthouse).not.toContain('gsub("\\\\."; "\\\\\\\\.")');
    expect(lighthouse).toContain(
      '.ci.collect.puppeteerScript = "scripts/lighthouse-vercel-bypass.cjs"'
    );
    expect(lighthouse).toContain(
      '.ci.collect.settings.disableStorageReset = true'
    );
    expect(lighthouse).toContain('.ci.assert.includePassedAssertions = true');
    expect(lighthouse).toContain(
      'VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}'
    );
    expect(lighthouse).toContain('lhci collect');
    expect(lighthouse).toContain('lhci assert');
    expect(lighthouse).toContain('lighthouse-exact-target-guard.ts');
    expect(lighthouse).toContain('LIGHTHOUSE_SENSITIVE_VALUES_FILE');
    expect(lighthouse).toContain('EXPECTED_VERCEL_DEPLOYMENT_ORIGIN=$base_url');
    expect(lighthouse).toContain('--sensitive-values-file');
    expect(lighthouse).toContain('--reports-dir=".lighthouseci"');
    expect(lighthouse).toContain(
      '--assertions=".lighthouseci/assertion-results.json"'
    );
    expect(lighthouse).not.toContain('--reports-dir="apps/web/.lighthouseci"');
    expect(lighthouse).toContain('Remove Lighthouse sensitive probe state');
    expect(lighthouse).toContain('--upload');
    expect(lighthouse).toContain(
      'Validate and upload hash-sealed Lighthouse evidence'
    );
    expect(lighthouse).not.toContain('lhci autorun');
    expect(lighthouse).not.toContain('extraHeaders');
    expect(lighthouse.indexOf('lhci collect')).toBeLessThan(
      lighthouse.indexOf('lhci assert')
    );
    expect(lighthouse.indexOf('lhci assert')).toBeLessThan(
      lighthouse.lastIndexOf('lighthouse-exact-target-guard.ts')
    );
    expect(lighthouse).toContain('EXPECTED_VERCEL_ENVIRONMENT=production');

    expect(publicSmoke).toContain('bootstrap-cookie-jar');
    expect(publicSmoke).toContain('VERCEL_VERIFY_PUBLIC_SURFACES=true');
    expect(publicSmoke).toContain('EXPECTED_VERCEL_ENVIRONMENT=production');
    expect(publicSmoke).toContain('VERCEL_PROBE_TIMEOUT_MS=180000');
    expect(publicSmoke).not.toContain('x-vercel-protection-bypass');
    expect(workflow).not.toContain('  ci-homepage-smoke:');
    expect(workflow).toContain(
      '^https://jovie-[a-z0-9-]+-jovie\\.vercel\\.app$'
    );
    expect(publicSmoke).toContain(
      'VERCEL_PROBE_COOKIE_JAR="$COOKIE_JAR" BASE_URL="$PRODUCTION_BASE_URL"'
    );
    expect(publicSmoke).toContain('BASE_URL="https://jov.ie"');
    expect(publicSmoke.match(/scripts\/seo-ratchet-live\.ts/g)).toHaveLength(2);
    expect(authSmoke).toContain(
      'PLAYWRIGHT_VERCEL_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}'
    );
    expect(authSmoke).toContain(
      'EXPECTED_COMMIT_SHA: ${{ needs.authorize-production.outputs.expected_sha }}'
    );
    expect(authSmoke).toContain(
      'EXPECTED_VERCEL_DEPLOYMENT_ORIGIN="$PRODUCTION_BASE_URL"'
    );
    expect(authSmoke).toContain('EXPECTED_VERCEL_ENVIRONMENT=production');
    expect(authSmoke).toContain('PLAYWRIGHT_DYNAMIC_SECRETS_FILE=');
    expect(authSmoke).toContain('echo "auth_smoke_status=passed"');
    expect(authSmoke).not.toMatch(/^\s+VERCEL_AUTOMATION_BYPASS_SECRET:/m);
    expect(verified).toContain(
      'needs.ci-post-deploy-auth-smoke.outputs.auth_smoke_status'
    );
    expect(verified).toContain('ci-public-profile-smoke');
    expect(verified).toContain('ci-post-deploy-auth-smoke');
    expect(verified).not.toContain('ci-homepage-smoke');
    expect(verified).toContain('lighthouse-ci');
    expect(verified).toContain('authSmoke: $auth_smoke');
    expect(verified).toContain('did not complete successfully');
    expect(verified).not.toContain('concurrency:');
    expect(verified).toContain('repos/${{ github.repository }}/commits/main');
    expect(verified).toContain('verify-production-alias.sh');
    expect(verified).toContain('superseded by $current_sha');
    expect(verified).toContain("steps.current.outputs.is_current == 'true'");
    expect(verified).toContain(
      "always() && steps.current.outputs.is_current == 'true'"
    );
    expect(verified).toContain('Finalize exact current release generation');
    expect(verified).toContain('Notify exact verified production generation');
    expect(verified).toContain('steps.finalize.outputs.verified');
    expect(workflow).not.toContain('  deploy-notify:');
  });

  it('isolates OIDC in a no-checkout attestation job and strips Git credentials from sensitive jobs', () => {
    const controller = readFileSync(productionControllerWorkflowPath, 'utf8');
    const reusable = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const canary = readFileSync(canaryWorkflowPath, 'utf8');
    const health = readFileSync(productionControllerHealthPath, 'utf8');
    const ci = readFileSync(workflowPath, 'utf8');
    const controllerDefaults = controller.slice(
      0,
      controller.indexOf('\njobs:')
    );
    const reusableDefaults = reusable.slice(0, reusable.indexOf('\njobs:'));
    const releaseCaller = getJobBlock(controller, 'production-release');
    const stagingDeploy = getJobBlock(reusable, 'deploy-staging');
    const productionDeploy = getJobBlock(reusable, 'promote-production');
    const attestation = getJobBlock(reusable, 'attest-staging-build');

    expect(controllerDefaults).not.toContain('id-token: write');
    expect(controllerDefaults).not.toContain('attestations: write');
    expect(reusableDefaults).not.toContain('id-token: write');
    expect(reusableDefaults).not.toContain('attestations: write');
    expect(releaseCaller).toContain('id-token: write');
    expect(releaseCaller).toContain('attestations: write');
    expect(attestation).toContain('id-token: write');
    expect(attestation).toContain('attestations: write');
    expect(attestation).toContain('contents: read');
    expect(attestation).toContain('actions/attest-build-provenance@');
    const forbiddenAttestationCapabilities = [
      'actions/checkout@',
      'setup-node-pnpm',
      'setup-doppler',
      'secrets.',
      'drizzle',
      'vercel build',
      'vercel deploy',
      'vercel rollback',
    ];
    const attestationViolations = (job: string) =>
      forbiddenAttestationCapabilities.filter(capability =>
        job.includes(capability)
      );
    expect(attestationViolations(attestation)).toEqual([]);
    for (const forbidden of forbiddenAttestationCapabilities) {
      const mutant = `${attestation}\n      - name: Forbidden mutant\n        run: ${forbidden}`;
      expect(attestationViolations(mutant)).toContain(forbidden);
    }
    for (const deploy of [stagingDeploy, productionDeploy]) {
      expect(deploy).not.toContain('id-token: write');
      expect(deploy).not.toContain('attestations: write');
    }

    for (const [workflow, jobNames] of [
      [
        controller,
        [
          'ci-public-profile-smoke',
          'ci-post-deploy-auth-smoke',
          'lighthouse-ci',
          'production-verified',
        ],
      ],
      [
        reusable,
        [
          'alias-staging',
          'promote-production',
          'production-oauth-gate',
          'rollback-production',
        ],
      ],
    ] as const) {
      for (const jobName of jobNames) {
        const job = getJobBlock(workflow, jobName);
        expect(job, jobName).toContain('permissions:\n      contents: read');
        expect(job, jobName).not.toContain('id-token: write');
        expect(job, jobName).not.toContain('attestations: write');
      }
    }

    for (const workflow of [controller, reusable, canary, health]) {
      for (const checkout of workflow.matchAll(
        /- uses: actions\/checkout@[a-f0-9]+[\s\S]*?(?=\n\s{6}- |\n\s{2}[\w-]+:|$)/g
      )) {
        expect(checkout[0]).toContain('persist-credentials: false');
      }
    }
    const preview = getJobBlock(ci, 'ci-pr-vercel-preview');
    expect(preview).toContain('secrets.VERCEL_TOKEN');
    expect(preview).toContain('persist-credentials: false');
  });
});

describe('unit-test runner capacity', () => {
  it('uses five-way hosted capacity while fixed runners are quarantined', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const routeJob = getJobBlock(workflow, 'ci-unit-runner-route');
    const unitJob = getJobBlock(workflow, 'ci-unit-tests');

    expect(routeJob).toContain('runs-on: ubuntu-latest');
    expect(routeJob).toContain('ref: main');
    expect(routeJob).toContain('continue-on-error: true');
    expect(routeJob).toContain("runner_class='hosted'");
    expect(routeJob).toContain('.github/scripts/query-runner-heartbeat.sh');
    expect(routeJob).toContain('[ "$HEARTBEAT_HEALTH" = \'up\' ]');
    expect(routeJob).toContain('fixed|hosted');
    expect(routeJob).not.toContain('runner: ${{ steps.route.outputs.runner }}');
    expect(routeJob).not.toContain('secrets.');
    expect(unitJob).toContain('runs-on: ubuntu-latest');
    expect(unitJob).not.toContain('runs-on: jovie-runner');
    expect(unitJob).not.toContain('ci-unit-runner-route');
    expect(unitJob).not.toContain('vars.CI_UNIT_RUNNER');
    expect(unitJob).toContain('max-parallel: 120');
    expect(unitJob).toContain(
      'Do not artificially\n      # serialize unit shards'
    );
    expect(unitJob).toContain('all five named');
    expect(unitJob).toContain('warm-canary receipts');
    expect(unitJob).toContain('run: echo "run_full_ci=true"');
    expect(unitJob).not.toContain(
      "github.event_name == 'merge_group' && needs.ci-path-changes.outputs.run_test == 'true'"
    );
    expect(unitJob).not.toContain('&& 5 || 3');
    expect(unitJob).toContain('Each ephemeral runner has 2 CPUs');
    expect(unitJob).toContain('VITEST_CI_FLAGS="--pool=forks --maxWorkers=2"');
    expect(unitJob).not.toContain(
      'VITEST_CI_FLAGS="--pool=forks --maxWorkers=3"'
    );
  });
});

describe('iOS stage contract', () => {
  it('keeps portable checks on source and Xcode on combined/fallback heads', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const iosWorkflow = readFileSync(iosWorkflowPath, 'utf8');
    const fastLanes = readFileSync(ciFastLanesPath, 'utf8');
    const pathChanges = getJobBlock(workflow, 'ci-path-changes');
    const ios = getJobBlock(workflow, 'ci-ios');
    const sourceReady = getJobBlock(workflow, 'ci-pr-ready');
    const mergeReady = getJobBlock(workflow, 'ci-merge-group-ready');
    const mainReady = getJobBlock(workflow, 'main-release-ready');

    expect(iosWorkflow).toMatch(
      /^on:\n(?:  #.*\n)*  workflow_call:\n  workflow_dispatch:/m
    );
    expect(iosWorkflow).not.toMatch(/^  pull_request:/m);
    expect(iosWorkflow).not.toMatch(/^  push:/m);
    expect(iosWorkflow).toContain('runs-on: macos-26');
    expect(pathChanges).toContain(
      "run_ios: ${{ steps.detect.outputs.run_ios || 'false' }}"
    );
    expect(pathChanges).toContain("IOS_PATTERN='^(apps/ios/");
    expect(ios).toContain("needs.ci-path-changes.outputs.run_ios == 'true'");
    expect(ios).toContain("github.event_name == 'merge_group'");
    expect(ios).toContain(
      "github.event_name == 'push' && github.ref == 'refs/heads/main'"
    );
    expect(ios).toContain('uses: ./.github/workflows/ios-ci.yml');
    expect(sourceReady).not.toContain('ci-ios');
    expect(mergeReady).toContain('ci-ios');
    expect(mainReady).toContain('ci-ios');
    expect(fastLanes).toContain("id: 'ios-fast'");
    expect(fastLanes).toContain('pnpm run ios:lint');
    expect(fastLanes).not.toContain('write-configuration.test.mjs');
    expect(iosWorkflow).toContain(
      'node --test apps/ios/scripts/write-configuration.test.mjs'
    );
  });
});

describe('informational CI tail capacity', () => {
  it('keeps the manual evidence summary off the ephemeral unit-test pool', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const summaryJob = getJobBlock(workflow, 'ci-summary');

    expect(summaryJob).toContain('name: Manual Evidence Summary');
    expect(summaryJob).toContain("github.event_name == 'workflow_dispatch'");
    expect(summaryJob).toContain('runs-on: ubuntu-latest');
    expect(summaryJob).not.toContain('runs-on: ${{ vars.CI_FAST_RUNNER }}');
  });
});

describe('canary health gate workflow', () => {
  it('accepts a wildcard block for a raw preview', () => {
    const workflow = readFileSync(canaryWorkflowPath, 'utf8');
    const canaryStep = getStepBlock(workflow, 'Canary health check');

    expect(
      previewRobotsPolicyValid(workflow, 'User-agent: *\nDisallow: /')
    ).toBe(true);
    expect(canaryStep).toContain(
      `! printf '%s\\n' "$robots_body" | preview_robots_policy_valid; then`
    );
    expect(canaryStep).toContain('[ "$robots_code" != "200" ]');
  });

  it('rejects a block that only belongs to an unrelated crawler group', () => {
    const workflow = readFileSync(canaryWorkflowPath, 'utf8');

    expect(
      previewRobotsPolicyValid(
        workflow,
        'User-agent: *\nDisallow:\n\nUser-agent: BadBot\nDisallow: /'
      )
    ).toBe(false);
  });

  it('rejects a wildcard root allow on a raw preview', () => {
    const workflow = readFileSync(canaryWorkflowPath, 'utf8');

    expect(
      previewRobotsPolicyValid(workflow, 'User-agent: *\nDisallow: /\nAllow: /')
    ).toBe(false);
  });

  it('rejects a sitemap advertised by a raw preview', () => {
    const workflow = readFileSync(canaryWorkflowPath, 'utf8');

    expect(
      previewRobotsPolicyValid(
        workflow,
        'User-agent: *\nDisallow: /\nSitemap: https://preview.example/sitemap.xml'
      )
    ).toBe(false);
  });

  it('fails closed when the automation bypass secret is missing', () => {
    const workflow = readFileSync(canaryWorkflowPath, 'utf8');
    const canaryStep = getStepBlock(workflow, 'Canary health check');

    expect(canaryStep).toContain(
      'VERCEL_AUTOMATION_BYPASS_SECRET is required for deterministic staging verification.'
    );
    expect(canaryStep).toContain('canary_status=failed_config');
    expect(canaryStep).not.toContain('Canary INCONCLUSIVE');
    expect(canaryStep).not.toContain(
      'canary_status=verified" >> "$GITHUB_OUTPUT"\n                    exit 0'
    );
  });

  it('binds the exact project deployment before cookie-only canary and auth smoke', () => {
    const workflow = readFileSync(canaryWorkflowPath, 'utf8');
    const canaryStep = getStepBlock(workflow, 'Canary health check');
    const authSmokeStep = getStepBlock(
      workflow,
      'Verify public auth controls are interactive'
    );
    const canaryCurlProbes =
      canaryStep.match(/curl -sS? --max-redirs 0/g) ?? [];

    expect(workflow).toContain('verified_deployment_url:');
    expect(workflow).toContain(
      'value: ${{ jobs.canary-health-gate.outputs.verified_deployment_url }}'
    );
    expect(canaryStep).toContain('resolve-deployment');
    expect(canaryStep).toContain('VERCEL_CANDIDATE_DEPLOYMENT_URL=');
    expect(canaryStep).toContain('VERCEL_CANDIDATE_DEPLOYMENT_ID=');
    expect(canaryStep).toContain('VERCEL_DEPLOYMENT_MAX_PAGES=5');
    expect(canaryStep).toContain('VERCEL_API_TIMEOUT_MS=180000');
    expect(canaryStep).toContain('VERCEL_DEPLOYMENT_POLL_INTERVAL_MS=5000');
    expect(canaryStep.indexOf('sleep "$WAIT_SECONDS"')).toBeLessThan(
      canaryStep.indexOf('resolve-deployment')
    );
    expect(
      workflow.indexOf('uses: ./.github/actions/setup-node-pnpm')
    ).toBeLessThan(
      workflow.indexOf(
        'node apps/web/scripts/vercel-protected-origin.cjs resolve-deployment'
      )
    );
    expect(workflow).toContain('deployment_id:');
    expect(workflow).not.toContain('fallback_health_url');
    expect(canaryStep).toContain(
      'CURL_TIMEOUT_ARGS=(--connect-timeout 5 --max-time 15)'
    );
    expect(canaryStep).toContain('bootstrap-cookie-jar');
    expect(canaryStep).toContain('EXPECTED_VERCEL_ENVIRONMENT=preview');
    expect(canaryStep).toContain('VERCEL_VERIFY_PUBLIC_SURFACES=true');
    expect(canaryStep).toContain('VERCEL_PROBE_TIMEOUT_MS=180000');
    expect(canaryStep).toContain('-b "$COOKIE_JAR"');
    expect(canaryStep).not.toContain('curl -s -L');
    expect(canaryStep).not.toContain('curl -sS -L');
    expect(canaryStep).not.toContain('BYPASS_ARGS');
    expect(canaryStep).not.toContain('x-vercel-protection-bypass');
    expect(canaryStep).toContain('verified_deployment_url=${deployment_url}');
    expect(canaryStep).toContain(
      'Checking onboarding chat reaches the bot gate'
    );
    expect(canaryStep).toContain('"errorCode":"ONBOARDING_CHAT_DISABLED"');
    expect(canaryStep).toContain('"errorCode":"TURNSTILE_REQUIRED"');
    expect(canaryStep).toContain('canary_status=failed_onboarding_chat');
    expect(canaryStep).not.toContain('/api/auth/ok');
    expect(canaryStep).not.toContain('failed_better_auth_handler');
    expect(canaryStep).not.toContain('health_url_fallback');
    expect(canaryStep).not.toContain('max_attempts=8');
    expect(canaryStep).not.toContain('check_route_renders');
    expect(canaryStep).not.toContain('profile_response=');
    expect(authSmokeStep).toContain(
      'DEPLOYMENT_URL: ${{ steps.canary-check.outputs.verified_deployment_url || inputs.deployment_url }}'
    );
    expect(authSmokeStep).toContain(
      'PLAYWRIGHT_VERCEL_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}'
    );
    expect(authSmokeStep).toContain(
      'EXPECTED_COMMIT_SHA: ${{ inputs.commit_sha }}'
    );
    expect(authSmokeStep).toContain(
      'EXPECTED_VERCEL_DEPLOYMENT_ORIGIN: ${{ steps.canary-check.outputs.verified_deployment_url }}'
    );
    expect(authSmokeStep).not.toContain(
      'VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}'
    );
    expect(authSmokeStep).toContain(
      'verifies build identity and host-only cookie'
    );
    expect(authSmokeStep).toContain('auth_smoke_attempt=1');
    expect(authSmokeStep).toContain('auth_smoke_max_attempts=3');
    expect(authSmokeStep).toContain('until CI=true');
    expect(authSmokeStep).toContain('BASE_URL="${DEPLOYMENT_URL}"');
    expect(authSmokeStep).toContain('EXPECTED_VERCEL_ENVIRONMENT=preview');
    expect(authSmokeStep).toContain('PLAYWRIGHT_DYNAMIC_SECRETS_FILE=');
    expect(authSmokeStep).toContain('auth-public-ready.spec.ts');
    expect(authSmokeStep).toContain(
      'Public auth controls failed after ${auth_smoke_max_attempts} attempts.'
    );
    expect(authSmokeStep).toContain(
      'sleep_seconds=$((auth_smoke_attempt * 30))'
    );

    expect(canaryCurlProbes).toHaveLength(3);
  });

  it('never probes the shared staging alias before this release owns it', () => {
    const canary = readFileSync(canaryWorkflowPath, 'utf8');
    const release = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const aliasJob = getJobBlock(release, 'alias-staging');
    const aliasStep = getStepBlock(aliasJob, 'Alias verified deployment');
    const oauthStep = getStepBlock(
      aliasJob,
      'Verify aliased staging OAuth redirect URIs'
    );

    expect(canary).not.toContain('staging.jov.ie');
    expect(aliasStep).toContain(
      'vercel alias set "$deployment_url" staging.jov.ie'
    );
    expect(oauthStep).toContain('BASE_URL: https://staging.jov.ie');
    expect(oauthStep).toContain(
      'EXPECTED_VERCEL_ALIAS_ORIGIN: https://staging.jov.ie'
    );
    expect(oauthStep).toContain('PLAYWRIGHT_VERCEL_BYPASS_SECRET:');
    expect(oauthStep).toContain('oauth-providers.spec.ts');
    expect(aliasJob.indexOf('- name: Alias verified deployment')).toBeLessThan(
      aliasJob.indexOf('- name: Verify aliased staging OAuth redirect URIs')
    );
  });
});

describe('CI E2E smoke workflow', () => {
  it('keeps the real-auth golden path inert in the bypass smoke lane', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const smokeStep = getStepBlock(
      getJobBlock(workflow, 'ci-e2e-smoke'),
      'Run E2E Smoke (Chromium)'
    );
    const goldenPathStep = getStepBlock(
      getJobBlock(workflow, 'ci-golden-path'),
      'Run Golden Path (Chromium, Better Auth)'
    );
    const goldenPathSpec = readFileSync(
      resolve(repoRoot, 'apps/web/tests/e2e/golden-path.spec.ts'),
      'utf8'
    );
    const smokeManifest = readFileSync(
      resolve(repoRoot, 'apps/web/tests/e2e/smoke-manifest.ts'),
      'utf8'
    );

    expect(smokeManifest).toContain("'golden-path.spec.ts'");
    expect(smokeStep).toContain('export E2E_USE_TEST_AUTH_BYPASS=1');
    expect(smokeStep).not.toContain('export E2E_TEST_MODE=1');
    expect(smokeStep).not.toContain('export PUBLIC_NOAUTH_SMOKE=1');
    expect(goldenPathStep).toContain('export E2E_TEST_MODE=1');
    expect(goldenPathStep).toContain('export CHAT_LLM_FAILURE_INJECTION=1');
    expect(goldenPathStep).toContain('export PUBLIC_NOAUTH_SMOKE=1');
    expect(goldenPathStep).not.toContain('E2E_USE_TEST_AUTH_BYPASS');
    expect(goldenPathSpec).toContain(
      "process.env.E2E_USE_TEST_AUTH_BYPASS === '1'"
    );
    expect(goldenPathSpec).toContain(
      'Golden path requires the dedicated real-auth lane'
    );
    expect(goldenPathSpec).toContain(
      "const signInRoute = '**/api/auth/sign-in/email-otp'"
    );
    const routeFetchIndex = goldenPathSpec.indexOf(
      'response = await route.fetch()'
    );
    const approveAppUserIndex = goldenPathSpec.indexOf(
      'await ensureDbUser(betterAuthUserId)'
    );
    const signInFulfillIndex = goldenPathSpec.indexOf(
      'await route.fulfill({ response, body })'
    );
    const navigationArmIndex = goldenPathSpec.indexOf(
      'const automaticStartNavigationPromise = page.waitForURL('
    );
    const claimArmIndex = goldenPathSpec.indexOf(
      'const claimResponsePromise = page.waitForResponse('
    );
    const otpSubmitIndex = goldenPathSpec.indexOf(
      "pressSequentially('424242')"
    );
    const authPreparationIndex = goldenPathSpec.indexOf(
      'const authPreparationError = await Promise.race(['
    );
    const unrouteIndex = goldenPathSpec.indexOf(
      'await page.unroute(signInRoute)'
    );
    expect(routeFetchIndex).toBeGreaterThan(-1);
    expect(approveAppUserIndex).toBeGreaterThan(routeFetchIndex);
    expect(signInFulfillIndex).toBeGreaterThan(approveAppUserIndex);
    expect(navigationArmIndex).toBeGreaterThan(-1);
    expect(navigationArmIndex).toBeLessThan(otpSubmitIndex);
    expect(claimArmIndex).toBeGreaterThan(navigationArmIndex);
    expect(claimArmIndex).toBeLessThan(otpSubmitIndex);
    expect(authPreparationIndex).toBeGreaterThan(otpSubmitIndex);
    expect(unrouteIndex).toBeGreaterThan(authPreparationIndex);
    expect(goldenPathSpec).toContain('authPreparationResult,');
    expect(goldenPathSpec).toContain(
      'without racing the start-route auth gate'
    );
    expect(goldenPathSpec).toContain(
      'Better Auth email-OTP request did not reach the preparation barrier'
    );
    expect(goldenPathSpec).not.toContain('heldClaimResponsePromise');
    expect(goldenPathSpec).not.toContain('await page.reload({');
    expect(goldenPathSpec).not.toContain(
      "const claimRoute = '**/api/onboarding/claim'"
    );
    expect(goldenPathSpec).not.toContain(
      'body: JSON.stringify({ claimed: 0 })'
    );
    expect(goldenPathSpec).not.toContain(
      'const sessionHandle = await page.waitForFunction('
    );
    expect(goldenPathSpec).toContain(
      'resetAuthStatePreservingOnboardingSession(page.context())'
    );
  });

  it('seeds public QA fixtures on ephemeral Neon before PR smoke runs', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const smokeJob = getJobBlock(workflow, 'ci-e2e-smoke');
    const migrateStep = getStepBlock(
      smokeJob,
      'Run migrations (ephemeral Neon)'
    );
    const seedStep = getStepBlock(smokeJob, 'Seed public QA fixtures');

    expect(migrateStep).toContain(
      "if: steps.check_changes.outputs.run_full_ci == 'true'"
    );
    expect(seedStep).toContain(
      "if: steps.check_changes.outputs.run_full_ci == 'true'"
    );
    expect(seedStep).toContain('run seed:test-data');
    const packageJson = JSON.parse(
      readFileSync(resolve(repoRoot, 'apps/web/package.json'), 'utf8')
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts['seed:test-data']).toContain(
      'tests/seed-test-data.ts'
    );
    expect(smokeJob).not.toContain('Export DATABASE_URL (main');
  });

  it('pins Better Auth to the local standalone origin for smoke and golden-path jobs', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    // Shared build artifact feeds multiple lanes on one self-hosted machine, so
    // each lane serves on its own loopback port; the baked-in public build URL
    // stays on the legacy default and is overridden by lane runtime exports.
    const sharedOrigin = 'http://localhost:3100';
    const e2eSmokeOrigin = 'http://localhost:3240';
    const goldenPathOrigin = 'http://localhost:3250';
    const extendedSmokeOrigin = 'http://localhost:3260';
    const sharedBuild = getStepBlock(
      getJobBlock(workflow, 'ci-build-public'),
      'Build app (public routes only — no secrets needed)'
    );
    const goldenPathJob = getJobBlock(workflow, 'ci-golden-path');
    const extendedSmokeJob = getJobBlock(workflow, 'ci-smoke-required');

    expect(sharedBuild).toContain(
      `NEXT_PUBLIC_BETTER_AUTH_URL: ${sharedOrigin}`
    );
    expect(sharedBuild).toContain(`NEXT_PUBLIC_APP_URL: ${sharedOrigin}`);
    expect(sharedBuild).toContain("NEXT_PUBLIC_E2E_MODE: '1'");
    const goldenBuild = getStepBlock(
      goldenPathJob,
      'Build real-Clerk golden-path artifact'
    );
    expect(goldenBuild).toContain(
      `NEXT_PUBLIC_BETTER_AUTH_URL: ${goldenPathOrigin}`
    );
    expect(goldenBuild).toContain(`NEXT_PUBLIC_APP_URL: ${goldenPathOrigin}`);
    const extendedBuild = getStepBlock(
      extendedSmokeJob,
      'Extract or rebuild for smoke tests'
    );
    expect(extendedBuild).toContain(
      `NEXT_PUBLIC_BETTER_AUTH_URL: ${extendedSmokeOrigin}`
    );
    expect(extendedBuild).toContain(
      `NEXT_PUBLIC_APP_URL: ${extendedSmokeOrigin}`
    );
    expect(extendedBuild).toContain("NEXT_PUBLIC_E2E_MODE: '1'");

    const standaloneSteps = [
      {
        origin: e2eSmokeOrigin,
        step: getStepBlock(
          getJobBlock(workflow, 'ci-e2e-smoke'),
          'Run E2E Smoke (Chromium)'
        ),
      },
      {
        origin: goldenPathOrigin,
        step: getStepBlock(
          goldenPathJob,
          'Run Golden Path (Chromium, Better Auth)'
        ),
      },
      {
        origin: extendedSmokeOrigin,
        step: getStepBlock(extendedSmokeJob, 'Run Required Smoke Tests'),
      },
    ];

    for (const { origin, step } of standaloneSteps) {
      expect(step).toContain(`export BETTER_AUTH_URL=${origin}`);
      expect(step).toContain(`export NEXT_PUBLIC_BETTER_AUTH_URL=${origin}`);
      expect(step).toContain('export HOSTNAME=localhost');
      expect(step).toContain(`export NEXT_PUBLIC_APP_URL=${origin}`);
      expect(step).toContain(`BETTER_AUTH_URL: ${origin}`);
      expect(step).toContain(`NEXT_PUBLIC_BETTER_AUTH_URL: ${origin}`);
      expect(step).toContain('SESSION_SECRET: ${{ secrets.SESSION_SECRET }}');
    }

    for (const { step } of [standaloneSteps[0], standaloneSteps[2]]) {
      expect(step).toContain(
        'export UPSTASH_REDIS_REST_URL="${{ secrets.UPSTASH_REDIS_REST_URL }}"'
      );
      expect(step).toContain(
        'export UPSTASH_REDIS_REST_TOKEN="${{ secrets.UPSTASH_REDIS_REST_TOKEN }}"'
      );
    }
  });
});

describe('CI Golden Path Neon workflow', () => {
  it('prefers pooled endpoints and verifies connectivity before migrations', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const goldenPathJob = getJobBlock(workflow, 'ci-golden-path');
    const sharedResolver = getStepBlock(
      goldenPathJob,
      'Resolve DATABASE_URL from Neon artifact'
    );
    const fallbackResolver = getStepBlock(
      goldenPathJob,
      'Resolve DATABASE_URL (fallback Neon ephemeral)'
    );

    expect(sharedResolver).toContain('candidate_json_key: db_url_pooled');
    expect(sharedResolver).toContain('fallback_json_key: db_url');
    expect(fallbackResolver).toContain(
      'candidate_url: ${{ steps.neon-branch.outputs.db_url_pooled }}'
    );
    expect(fallbackResolver).toContain(
      'fallback_candidate_url: ${{ steps.neon-branch.outputs.db_url }}'
    );

    const failClosedStep = getStepBlock(
      goldenPathJob,
      'Fail if Neon DB URL is missing (Golden Path)'
    );
    const verifyDbStep = getStepBlock(
      goldenPathJob,
      'Verify Neon DB connectivity (fail-fast)'
    );
    const failClosedIndex = goldenPathJob.indexOf(
      '- name: Fail if Neon DB URL is missing (Golden Path)'
    );
    const verifyIndex = goldenPathJob.indexOf(
      '- name: Verify Neon DB connectivity (fail-fast)'
    );
    const migrateIndex = goldenPathJob.indexOf(
      '- name: Run migrations (ephemeral Neon)'
    );

    expect(failClosedStep).toContain(
      'Refusing to run Golden Path against staging/production DBs'
    );
    expect(failClosedStep).toContain('if [[ -z "$DATABASE_URL" ]]; then');
    expect(failClosedStep).toContain('exit 1');
    expect(verifyDbStep).toContain('tests/e2e/verify-neon-db-connectivity.ts');
    expect(failClosedIndex).toBeGreaterThanOrEqual(0);
    expect(verifyIndex).toBeGreaterThan(failClosedIndex);
    expect(migrateIndex).toBeGreaterThan(verifyIndex);
  });
});

describe('CI public lighthouse workflow', () => {
  it('pins the standalone server and browser to one loopback origin', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const lighthouseJob = getJobBlock(workflow, 'ci-lighthouse-pr');
    const runStep = getStepBlock(
      lighthouseJob,
      'Run Lighthouse CI (public launch thresholds)'
    );
    const localOrigin = 'http://localhost:3000';

    expect(runStep).toContain('export HOSTNAME=localhost');
    expect(runStep).toContain(`export NEXT_PUBLIC_APP_URL=${localOrigin}`);
    expect(runStep).toContain(`export BETTER_AUTH_URL=${localOrigin}`);
    expect(runStep).toContain(
      `export NEXT_PUBLIC_BETTER_AUTH_URL=${localOrigin}`
    );
    expect(runStep).toContain(`BASE_URL: ${localOrigin}`);
    expect(runStep).not.toContain('http://127.0.0.1:3000');
  });

  it('pins CHROME_PATH to the baked Playwright Chromium before running lhci', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const lighthouseJob = getJobBlock(workflow, 'ci-lighthouse-pr');
    const pinStep = getStepBlock(lighthouseJob, 'Pin Chrome for Lighthouse CI');

    // chrome-launcher only resolves system Chrome via PATH/CHROME_PATH, so the
    // job must point lhci at the baked Playwright Chromium explicitly.
    expect(pinStep).toContain('PLAYWRIGHT_BROWSERS_PATH');
    expect(pinStep).toContain('/opt/ms-playwright');
    expect(pinStep).toContain("-path '*/chrome-linux*/chrome'");
    expect(pinStep).toContain(
      'echo "CHROME_PATH=$CHROME_BIN" >> "$GITHUB_ENV"'
    );
    // Guard: when no glob matches, CHROME_PATH must stay unset — never export
    // a literal unmatched glob path for chrome-launcher to choke on.
    expect(pinStep).toContain('if [ -n "$CHROME_BIN" ]');
    expect(pinStep).not.toContain('CHROME_PATH=$(ls');

    // The pin must land before the lhci-invoking step.
    const pinIndex = lighthouseJob.indexOf(
      '- name: Pin Chrome for Lighthouse CI'
    );
    const runIndex = lighthouseJob.indexOf(
      '- name: Run Lighthouse CI (public launch thresholds)'
    );
    expect(pinIndex).toBeGreaterThanOrEqual(0);
    expect(runIndex).toBeGreaterThan(pinIndex);
  });

  it('uses seeded isolated Neon fixtures instead of the stable main DB', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const lighthouseJob = getJobBlock(workflow, 'ci-lighthouse-pr');
    const downloadArtifactStep = getStepBlock(
      lighthouseJob,
      'Download Neon DB connection artifact'
    );
    const resolveDbStep = getStepBlock(
      lighthouseJob,
      'Resolve DATABASE_URL from Neon artifact'
    );
    const exportStep = getStepBlock(
      lighthouseJob,
      'Export DATABASE_URL (ephemeral branch)'
    );
    const failClosedStep = getStepBlock(
      lighthouseJob,
      'Fail if Neon DB URL is missing (Lighthouse)'
    );
    const verifyDbStep = getStepBlock(
      lighthouseJob,
      'Verify Neon DB connectivity (fail-fast)'
    );
    const migrateStep = getStepBlock(
      lighthouseJob,
      'Run migrations (ephemeral Neon)'
    );
    const seedStep = getStepBlock(lighthouseJob, 'Seed public QA fixtures');
    const waitStep = getStepBlock(
      lighthouseJob,
      'Wait for shared Neon seed (lighthouse shard > 0)'
    );

    expect(downloadArtifactStep).toContain(
      'name: neon-db-connection-${{ github.run_id }}-${{ github.run_attempt }}'
    );
    expect(resolveDbStep).toContain(
      'connection_file: ${{ runner.temp }}/neon-db-connection/connection.json'
    );
    // credential_source only fills missing username/password; ephemeral host
    // still comes from the neon-db artifact (see resolve-neon-database-url).
    expect(resolveDbStep).toContain('credential_source_url:');
    expect(resolveDbStep).toContain('secrets.DATABASE_URL_MAIN');
    expect(verifyDbStep).toContain('tests/e2e/verify-neon-db-connectivity.ts');
    expect(failClosedStep).toContain(
      'Refusing to run public Lighthouse against staging/production DBs'
    );
    expect(migrateStep).toContain('matrix.shard == 0');
    expect(seedStep).toContain('matrix.shard == 0');
    expect(waitStep).toContain('matrix.shard != 0');
    expect(waitStep).toContain('tests/wait-for-public-qa-seed.ts');
    expect(seedStep).toContain('run seed:test-data');
    expect(exportStep).toContain(
      'steps.resolve-lighthouse-neon-db-url.outputs.database_url'
    );
    expect(lighthouseJob).not.toContain('Export DATABASE_URL (main');
    expect(lighthouseJob).not.toContain(
      '- name: Create ephemeral Neon database branch (with retry)'
    );
    expect(lighthouseJob).toContain('matrix.shard }}" = "1"');
    expect(lighthouseJob).toContain(
      'tests/e2e/profile-mobile-viewport-stability.spec.ts'
    );

    const failureArtifactStep = getStepBlock(
      lighthouseJob,
      'Upload public Lighthouse mobile artifacts on failure'
    );
    expect(failureArtifactStep).toContain(
      "if: ${{ failure() && matrix.shard == 1 && hashFiles('apps/web/test-results/**') != '' }}"
    );
    expect(failureArtifactStep).not.toContain('apps/web/playwright-report/');
    expect(failureArtifactStep).toContain('apps/web/test-results/');
  });

  it('public launch Lighthouse config includes CI Chrome stability flags', () => {
    const configPath = resolve(
      repoRoot,
      'apps/web/.lighthouserc.public-launch.json'
    );
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      ci: {
        collect: {
          settings?: {
            chromeFlags?: string;
            skipAudits?: string[];
          };
        };
      };
    };

    expect(config.ci.collect.settings?.chromeFlags).toContain('--no-sandbox');
    expect(config.ci.collect.settings?.chromeFlags).toContain(
      '--disable-setuid-sandbox'
    );
    expect(config.ci.collect.settings?.chromeFlags).toContain(
      '--disable-dev-shm-usage'
    );
    expect(config.ci.collect.settings?.skipAudits).toContain('font-size');
  });
});

describe('CI mobile overflow workflow', () => {
  it('uses seeded isolated Neon fixtures instead of the stable main DB', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const mobileOverflowJob = getJobBlock(workflow, 'ci-mobile-overflow');
    const downloadArtifactStep = getStepBlock(
      mobileOverflowJob,
      'Download Neon DB connection artifact'
    );
    const resolveDbStep = getStepBlock(
      mobileOverflowJob,
      'Resolve DATABASE_URL from Neon artifact'
    );
    const exportStep = getStepBlock(
      mobileOverflowJob,
      'Export DATABASE_URL (ephemeral branch)'
    );
    const failClosedStep = getStepBlock(
      mobileOverflowJob,
      'Fail if Neon DB URL is missing (Mobile Overflow)'
    );
    const verifyDbStep = getStepBlock(
      mobileOverflowJob,
      'Verify Neon DB connectivity (fail-fast)'
    );
    const migrateStep = getStepBlock(
      mobileOverflowJob,
      'Run migrations (ephemeral Neon)'
    );
    const seedStep = getStepBlock(
      mobileOverflowJob,
      'Seed mobile overflow fixtures'
    );
    const waitStep = getStepBlock(
      mobileOverflowJob,
      'Wait for shared Neon seed (mobile overflow width > 320)'
    );

    expect(downloadArtifactStep).toContain(
      'name: neon-db-connection-${{ github.run_id }}-${{ github.run_attempt }}'
    );
    expect(resolveDbStep).toContain(
      'connection_file: ${{ runner.temp }}/neon-db-connection/connection.json'
    );
    expect(resolveDbStep).not.toContain('credential_source_url');
    expect(verifyDbStep).toContain('tests/e2e/verify-neon-db-connectivity.ts');
    expect(failClosedStep).toContain(
      'Refusing to run mobile overflow against staging/production DBs'
    );
    expect(migrateStep).toContain('matrix.width == 320');
    expect(seedStep).toContain('matrix.width == 320');
    expect(waitStep).toContain('matrix.width != 320');
    expect(waitStep).toContain('tests/wait-for-public-qa-seed.ts');
    expect(seedStep).toContain('run seed:test-data');
    expect(exportStep).toContain(
      'steps.resolve-mobile-overflow-neon-db-url.outputs.database_url'
    );
    expect(mobileOverflowJob).not.toContain('Export DATABASE_URL (main');
    expect(mobileOverflowJob).not.toContain(
      '- name: Create ephemeral Neon database branch (with retry)'
    );
  });
});

describe('CI required smoke materialization', () => {
  it('requires the shared manual Neon producer without a racing fallback', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const smokeJob = getJobBlock(workflow, 'ci-e2e-smoke');

    expect(smokeJob).toContain("github.event_name == 'workflow_dispatch'");
    expect(smokeJob).not.toContain("github.event_name == 'pull_request'");
    expect(smokeJob).not.toContain(
      "needs.ci-risk-classifier.outputs.requires_smoke == 'true'"
    );
    expect(smokeJob).toContain(
      'run: echo "run_full_ci=${{ needs.ci-path-changes.outputs.run_e2e }}"'
    );
    expect(smokeJob).toContain("needs.neon-db.result == 'success'");
    expect(smokeJob).not.toContain('fallback Neon ephemeral');
    expect(smokeJob).not.toContain('steps.neon-branch');
  });
});

describe('CI bounded evidence parallelism', () => {
  it('isolates public Lighthouse below the observed server exhaustion horizon', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const lighthouse = getJobBlock(workflow, 'ci-lighthouse-pr');

    expect(lighthouse).toContain('max-parallel: 4');
    expect(lighthouse).toContain('shard: [0, 1, 2, 3]');
    expect(lighthouse).toContain("PUBLIC_LIGHTHOUSE_TOTAL_SHARDS: '4'");
  });

  it('runs all three mobile widths in parallel under expanded job headroom', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const mobile = getJobBlock(workflow, 'ci-mobile-overflow');

    expect(mobile).toContain('max-parallel: 3');
    expect(mobile).toContain('width: [320, 390, 430]');
  });
});

describe('CI Neon endpoint pool concurrency (JOV-2497)', () => {
  const neonBranchCreateJobs = {
    'neon-db': 'neon-endpoint-pool-neon-db-',
    'ci-lighthouse-dashboard-pr':
      'neon-endpoint-pool-ci-lighthouse-dashboard-pr-',
    'ci-e2e-smoke': 'neon-endpoint-pool-ci-e2e-smoke-',
    'ci-admin-smoke': 'neon-endpoint-pool-ci-admin-smoke-',
  } as const;

  const neonArtifactConsumerJobs = [
    'ci-lighthouse-pr',
    'ci-lighthouse-onboarding-pr',
    'ci-lighthouse-admin-pr',
    'ci-lighthouse-chat-pr',
    'ci-a11y',
    'ci-mobile-overflow',
  ] as const;

  it('caps cross-PR Neon branch creation with a four-slot queue', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    for (const [jobKey, expectedGroupPrefix] of Object.entries(
      neonBranchCreateJobs
    )) {
      const job = getJobBlock(workflow, jobKey);
      expect(job).toContain('concurrency:');
      expect(job).toContain(`group: ${expectedGroupPrefix}`);
      expect(job).not.toContain('group: neon-endpoint-pool-${{ github.job }}-');
      expect(job).toContain('cancel-in-progress: false');

      // Preserve the four-slot hash: decimal endings 0/4/8 -> 0,
      // 1/5/9 -> 1, 2/6 -> 2, and 3/7 -> the fallback slot 3.
      for (const suffix of ['0', '4', '8', '1', '5', '9', '2', '6']) {
        expect(job).toContain(`, '${suffix}')`);
      }
      expect(job).toContain("&& '0'");
      expect(job).toContain("&& '1'");
      expect(job).toContain("&& '2'");
      expect(job).toContain("|| '3'");
    }

    expect(new Set(Object.values(neonBranchCreateJobs)).size).toBe(4);
  });

  it('scopes golden-path pending replacement to one PR', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const goldenPathJob = getJobBlock(workflow, 'ci-golden-path');

    expect(goldenPathJob).toContain(
      'group: neon-endpoint-pool-ci-golden-path-${{ github.event.pull_request.number || github.run_id }}'
    );
    expect(goldenPathJob).toContain('cancel-in-progress: false');
    expect(goldenPathJob).not.toContain(
      '\n      group: neon-endpoint-pool-ci-golden-path\n'
    );
  });

  it('uses literal job prefixes because github.job is unavailable before a runner starts', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const poolGroups =
      workflow.match(/group: neon-endpoint-pool-[^\n]+/g) ?? [];

    expect(poolGroups.length).toBeGreaterThan(0);
    for (const group of poolGroups) {
      expect(group).not.toContain('${{ github.job }}');
      expect(group).not.toMatch(/neon-endpoint-pool--[0-3]/);
    }
  });

  it('keeps artifact consumers out of the branch-creation pool', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    for (const jobKey of neonArtifactConsumerJobs) {
      const job = getJobBlock(workflow, jobKey);
      expect(job).not.toContain('group: neon-endpoint-pool-');
    }
  });

  it('shortens shared neon-db branch TTL to release endpoint slots faster', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const neonDbJob = getJobBlock(workflow, 'neon-db');
    const createBranchStep = getStepBlock(
      neonDbJob,
      'Create or reuse Neon branch (with retry)'
    );

    expect(createBranchStep).toContain("expires_in_hours: '2'");
  });

  it('admits the shared Neon endpoint before publishing its connection artifact', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const neonDbJob = getJobBlock(workflow, 'neon-db');
    const prepareIndex = neonDbJob.indexOf(
      '- name: Prepare shared Neon admission probe'
    );
    const admissionIndex = neonDbJob.indexOf(
      '- name: Verify shared Neon branch admission before publish'
    );
    const persistIndex = neonDbJob.indexOf(
      '- name: Persist Neon DB connection artifact'
    );
    const uploadIndex = neonDbJob.indexOf(
      '- name: Upload Neon DB connection artifact'
    );

    expect(prepareIndex).toBeGreaterThanOrEqual(0);
    expect(admissionIndex).toBeGreaterThan(prepareIndex);
    expect(persistIndex).toBeGreaterThan(admissionIndex);
    expect(uploadIndex).toBeGreaterThan(persistIndex);
    expect(neonDbJob).toContain(
      'run: bash scripts/ci/verify-neon-branch-admission.sh'
    );
  });
});

describe('Neon ephemeral cleanup workflows (JOV-2497)', () => {
  it('deletes prefixed CI branches when a PR closes', () => {
    const cleanupWorkflow = readFileSync(
      resolve(repoRoot, '.github/workflows/neon-ephemeral-branch-cleanup.yml'),
      'utf8'
    );

    expect(cleanupWorkflow).toContain('List and delete matching Neon branches');
    expect(cleanupWorkflow).toContain('startswith($base + "-")');
  });

  it('keeps consolidated agent tick manual-only while retaining cleanup controls', () => {
    const agentTickWorkflow = readFileSync(agentTickWorkflowPath, 'utf8');
    const cleanupJob = getJobBlock(agentTickWorkflow, 'neon-cleanup');

    expect(agentTickWorkflow).toContain('workflow_dispatch:');
    expect(agentTickWorkflow).not.toContain('schedule:');
    expect(agentTickWorkflow).not.toContain('vercel rollback');
    expect(cleanupJob).toContain('uses: ./.github/actions/neon-branch-cleanup');
    expect(cleanupJob).toContain("minimum_branch_age_minutes: '45'");
    expect(cleanupJob).toContain(
      "protected_branches: 'main,development,preview,br-main,br-production'"
    );
  });

  it('recognizes only exact creator prefixes for ephemeral branches', () => {
    const cleanupAction = readFileSync(
      resolve(repoRoot, '.github/actions/neon-branch-cleanup/action.yml'),
      'utf8'
    );

    expect(cleanupAction).toContain('dashboard-lighthouse-[0-9]+-[0-9]+');
    expect(cleanupAction).toContain('admin-smoke-[0-9]+-[0-9]+');
    expect(cleanupAction).toContain('visual-regression-[0-9]+');
    expect(cleanupAction).toContain('ci-neon-run-[0-9]+-[0-9]+');
    expect(cleanupAction).not.toContain('[a-z0-9._-]+-[0-9]+-[0-9]+)$');
  });
});

describe('ci-fast critical deploy contract', () => {
  it('targets the web test directly so a zero-task Turbo run cannot pass', () => {
    const ciFastLanes = readFileSync(ciFastLanesPath, 'utf8');
    const command =
      'pnpm --filter @jovie/web exec vitest run --config=vitest.config.mts tests/unit/ci/deploy-workflow.test.ts';

    expect(ciFastLanes).toContain(command);
    expect(command).not.toContain('turbo');
    expect(command).not.toContain('--affected');
    expect(command).not.toContain('--passWithNoTests');
  });
});

describe('CI public a11y workflow', () => {
  it('uses seeded isolated Neon fixtures instead of the stable main DB', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const a11yJob = getJobBlock(workflow, 'ci-a11y');
    const downloadArtifactStep = getStepBlock(
      a11yJob,
      'Download Neon DB connection artifact'
    );
    const resolveDbStep = getStepBlock(
      a11yJob,
      'Resolve DATABASE_URL from Neon artifact'
    );
    const exportStep = getStepBlock(
      a11yJob,
      'Export DATABASE_URL (ephemeral branch)'
    );
    const failClosedStep = getStepBlock(
      a11yJob,
      'Fail if Neon DB URL is missing (A11y)'
    );
    const migrateStep = getStepBlock(
      a11yJob,
      'Run migrations (ephemeral Neon)'
    );
    const seedStep = getStepBlock(a11yJob, 'Seed public QA fixtures');

    expect(a11yJob).toContain(
      'needs: [ci-build-public, ci-path-changes, neon-db]'
    );
    expect(downloadArtifactStep).toContain(
      "if: steps.check_changes.outputs.run_full_ci == 'true'"
    );
    expect(downloadArtifactStep).toContain(
      'name: neon-db-connection-${{ github.run_id }}-${{ github.run_attempt }}'
    );
    expect(resolveDbStep).toContain(
      "if: steps.check_changes.outputs.run_full_ci == 'true'"
    );
    expect(resolveDbStep).toContain(
      'connection_file: ${{ runner.temp }}/neon-db-connection/connection.json'
    );
    expect(exportStep).toContain(
      "if: steps.check_changes.outputs.run_full_ci == 'true'"
    );
    expect(failClosedStep).toContain(
      'Refusing to run a11y against staging/production DBs'
    );
    expect(migrateStep).toContain(
      "if: steps.check_changes.outputs.run_full_ci == 'true'"
    );
    expect(seedStep).toContain(
      "if: steps.check_changes.outputs.run_full_ci == 'true'"
    );

    expect(a11yJob).not.toContain('Export DATABASE_URL (main');
    expect(a11yJob).not.toContain(
      '- name: Create ephemeral Neon database branch (with retry)'
    );
  });
});

describe('CI PR neon migrate workflow', () => {
  it('uses seeded isolated Neon fixtures instead of the stable main DB', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const migrateJob = getJobBlock(workflow, 'ci-pr-neon-migrate');
    const downloadArtifactStep = getStepBlock(
      migrateJob,
      'Download Neon DB connection artifact'
    );
    const resolveDbStep = getStepBlock(
      migrateJob,
      'Resolve DATABASE_URL from Neon artifact'
    );
    const exportStep = getStepBlock(
      migrateJob,
      'Export DATABASE_URL (ephemeral branch)'
    );
    const failClosedStep = getStepBlock(
      migrateJob,
      'Fail if Neon DB URL is missing (PR migrate)'
    );
    const verifyDbStep = getStepBlock(
      migrateJob,
      'Verify Neon DB connectivity (fail-fast)'
    );
    const migrateStep = getStepBlock(
      migrateJob,
      'Run migrations (ephemeral Neon)'
    );

    expect(downloadArtifactStep).toContain(
      'name: neon-db-connection-${{ github.run_id }}-${{ github.run_attempt }}'
    );
    expect(resolveDbStep).toContain(
      'connection_file: ${{ runner.temp }}/neon-db-connection/connection.json'
    );
    expect(resolveDbStep).toContain('candidate_json_key: db_url');
    expect(resolveDbStep).not.toContain('credential_source_url');
    expect(verifyDbStep).toContain('tests/e2e/verify-neon-db-connectivity.ts');
    expect(failClosedStep).toContain(
      'Refusing to run PR migrate against staging/production DBs'
    );
    expect(exportStep).toContain(
      'steps.resolve-pr-neon-db-url.outputs.database_url'
    );
    expect(migrateStep).toContain('drizzle:migrate:ci');
    expect(migrateJob).not.toContain('credential_source_url');
  });
});

describe('production promotion exact-artifact contract', () => {
  it('deploys the in-job staging prebuilt without a source fallback', () => {
    const workflow = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const deployStep = getStepBlock(
      workflow,
      'Deploy (staging preview, prebuilt)'
    );
    const deployHelper = readFileSync(vercelPrebuiltDeployPath, 'utf8');

    expect(deployStep).not.toContain('VERCEL_FORCE_SOURCE_DEPLOY');
    expect(deployStep).toContain("VERCEL_ENABLE_SOURCE_FALLBACK: 'false'");
    expect(deployHelper).toContain(
      'source_fallback_requested="${VERCEL_ENABLE_SOURCE_FALLBACK:-true}"'
    );
    expect(deployHelper).toContain('[ "$source_fallback_requested" = "true" ]');
  });

  it('builds and canaries a Production-target prebuilt before promotion', () => {
    const workflow = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const promoteJob = getJobBlock(workflow, 'promote-production');
    const stageStep = getStepBlock(
      promoteJob,
      'Build and stage production deployment'
    );
    const promoteStep = getStepBlock(
      promoteJob,
      'Promote staged production deployment'
    );
    const finalCurrentStep = getStepBlock(
      promoteJob,
      'Recheck main immediately before production promotion'
    );
    const verifyStep = getStepBlock(
      promoteJob,
      'Verify canonical production deployment'
    );

    const pullIndex = stageStep.indexOf('--environment=production');
    const buildIndex = stageStep.indexOf('vercel build --prod');
    const deployIndex = stageStep.indexOf(
      '--prebuilt --archive=tgz --prod --skip-domain --format=json'
    );
    const inspectIndex = stageStep.indexOf(
      'vercel inspect "$production_deploy_id"'
    );
    const canaryIndex = stageStep.indexOf(
      'VERCEL_PROBE_URL="$production_deploy_url"'
    );

    expect(pullIndex).toBeGreaterThanOrEqual(0);
    expect(buildIndex).toBeGreaterThan(pullIndex);
    expect(deployIndex).toBeGreaterThan(buildIndex);
    expect(inspectIndex).toBeGreaterThan(deployIndex);
    expect(canaryIndex).toBeGreaterThan(inspectIndex);
    expect(stageStep).toContain('--target=prd --source=env');
    expect(stageStep).not.toContain('--target=prd --source=vercel-file');
    expect(stageStep).toContain('VERCEL_GIT_COMMIT_SHA="$EXPECTED_SHA"');
    expect(stageStep).toContain('NEXT_PUBLIC_BUILD_SHA="$expected"');
    expect(stageStep).toContain('--meta "githubCommitSha=${EXPECTED_SHA}"');
    expect(stageStep).toContain('[ "$production_deploy_state" != "READY" ]');
    expect(stageStep).toContain(
      '[ "$production_deploy_target" != "production" ]'
    );
    expect(stageStep).toContain('VERCEL_VERIFY_PUBLIC_SURFACES=true');
    expect(stageStep).not.toContain('fetch_staged');
    expect(stageStep).toContain('production_deployment_url_b64=');
    expect(stageStep).not.toContain(
      'echo "production_deployment_url=$production_deploy_url"'
    );
    expect(promoteStep).toContain(
      'bash .github/scripts/promote-production-deployment.sh'
    );
    const resolveMainIndex = finalCurrentStep.indexOf(
      'current_main_sha="$(gh api "repos/${{ github.repository }}/commits/main"'
    );
    const compareMainIndex = finalCurrentStep.indexOf(
      'if [[ "$current_main_sha" != "$EXPECTED_MAIN_SHA" ]]'
    );
    expect(finalCurrentStep).toContain(
      'EXPECTED_MAIN_SHA: ${{ inputs.expected_sha }}'
    );
    expect(resolveMainIndex).toBeGreaterThanOrEqual(0);
    expect(compareMainIndex).toBeGreaterThan(resolveMainIndex);
    expect(finalCurrentStep).toContain('echo "is_current=false"');
    expect(finalCurrentStep).toContain('exit 0');
    expect(finalCurrentStep).not.toContain(
      'Refusing stale production promotion'
    );
    expect(promoteStep).toContain(
      "if: ${{ steps.final-current.outputs.is_current == 'true' }}"
    );
    expect(promoteJob).toContain(
      'promotion_sha: ${{ steps.promote.outputs.promotion_sha || steps.final-current.outputs.superseded_sha || steps.mutation-head.outputs.superseded_sha }}'
    );
    expect(verifyStep).toContain(
      'steps.promote.outputs.promotion_sha == inputs.expected_sha'
    );
    expect(verifyStep).toContain(
      'bash .github/scripts/verify-production-alias.sh'
    );
    expect(promoteJob).toContain('timeout-minutes: 60');
    expect(promoteJob).not.toContain('timeout-minutes: 360');
    expect(promoteJob).not.toContain('vercel promote "$deploy_url"');
  });

  it('transports production evidence without Doppler-maskable job outputs', () => {
    const reusable = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const controller = readFileSync(productionControllerWorkflowPath, 'utf8');
    const promotionScript = readFileSync(
      productionPromotionControllerPath,
      'utf8'
    );
    const promoteJob = getJobBlock(reusable, 'promote-production');
    const mutationHead = getStepBlock(
      promoteJob,
      'Recheck main immediately before production mutation'
    );
    const result = getJobBlock(reusable, 'release-result');
    const verified = getJobBlock(controller, 'production-verified');

    expect(promoteJob).toContain(
      'production_deployment_url_b64: ${{ steps.stage-production.outputs.production_deployment_url_b64 }}'
    );
    expect(promoteJob).toContain(
      'promotion_sha: ${{ steps.promote.outputs.promotion_sha || steps.final-current.outputs.superseded_sha || steps.mutation-head.outputs.superseded_sha }}'
    );
    expect(mutationHead).toContain(
      'echo "superseded_sha=$current_sha" >> "$GITHUB_OUTPUT"'
    );
    expect(promoteJob).toContain(
      'echo "superseded_sha=$current_main_sha" >> "$GITHUB_OUTPUT"'
    );
    expect(promoteJob).not.toMatch(/^      production_deployment_url:/m);
    expect(promoteJob).not.toContain(
      'is_current: ${{ steps.promote.outputs.is_current }}'
    );
    expect(reusable).not.toMatch(/^      previous_production_deployment_url:/m);
    expect(promotionScript.match(/printf 'promotion_sha=%s\\n'/g)).toHaveLength(
      2
    );
    expect(promotionScript).not.toContain("printf 'is_current=");
    expect(promotionScript).not.toContain(
      "printf 'previous_production_deployment_url="
    );

    expect(result).toContain(
      'PROMOTION_SHA: ${{ needs.promote-production.outputs.promotion_sha }}'
    );
    expect(result).toContain(
      'PRODUCTION_DEPLOYMENT_URL_B64: ${{ needs.promote-production.outputs.production_deployment_url_b64 }}'
    );
    expect(result).toContain('base64 --decode');
    expect(result).toContain('^https://jovie-[a-z0-9-]+-jovie\\.vercel\\.app$');
    expect(result).toContain(
      'Successful production promotion omitted exact observed main SHA evidence.'
    );
    expect(reusable).toContain('production_deployment_url_b64:');
    expect(reusable).not.toMatch(/^      production_deployment_url:/m);

    for (const jobName of [
      'ci-public-profile-smoke',
      'ci-post-deploy-auth-smoke',
      'lighthouse-ci',
    ]) {
      const job = getJobBlock(controller, jobName);
      expect(job).toContain(
        'needs.production-release.outputs.production_deployment_url_b64'
      );
      expect(job).toContain('base64 --decode');
    }
    expect(verified).toContain(
      'PRODUCTION_DEPLOYMENT_URL_B64: ${{ needs.production-release.outputs.production_deployment_url_b64 }}'
    );
    expect(verified).toContain('base64 --decode');
    expect(controller).not.toContain(
      'needs.production-release.outputs.production_deployment_url }}'
    );
  });

  it('neutralizes rapid main advance after staging while API uncertainty fails closed', () => {
    const reusable = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const promoteJob = getJobBlock(reusable, 'promote-production');
    const finalCurrent = getStepBlock(
      promoteJob,
      'Recheck main immediately before production promotion'
    );
    const result = getJobBlock(reusable, 'release-result');

    expect(finalCurrent).toContain(
      'if [[ ! "$current_main_sha" =~ ^[0-9a-f]{40}$ ]]'
    );
    expect(finalCurrent).toContain('exit 1');
    expect(finalCurrent).toContain('echo "is_current=false"');
    expect(finalCurrent).toContain('exit 0');
    expect(result).toContain(
      'PROMOTION_SHA: ${{ needs.promote-production.outputs.promotion_sha }}'
    );
    expect(result).toContain('[[ "$PROMOTION_SHA" =~ ^[0-9a-f]{40}$ ]]');
    expect(result).toContain('[ "$PROMOTION_SHA" != "$EXPECTED_SHA" ]');
    expect(result).toContain('Superseded at production mutation by');
    expect(result).toContain(
      'Successful production promotion omitted exact observed main SHA evidence.'
    );
  });

  it('serializes initial runs and reruns in the same bounded FIFO lease', () => {
    const workflow = readFileSync(productionControllerWorkflowPath, 'utf8');
    const workflowHeader = workflow.slice(0, workflow.indexOf('\njobs:'));
    const reusable = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const releaseCaller = getJobBlock(workflow, 'production-release');
    const verified = getJobBlock(workflow, 'production-verified');

    expect(workflowHeader).toContain('group: production-mutation');
    expect(workflowHeader).toContain('queue: max');
    expect(workflowHeader).toContain('cancel-in-progress: false');
    expect(workflowHeader).not.toContain('github.run_attempt');
    expect(workflowHeader).not.toContain('github.sha');
    expect(releaseCaller).not.toContain('concurrency:');
    expect(verified).not.toContain('concurrency:');
    expect(reusable).not.toContain('concurrency:');
    expect(verified).toContain('canonical_verified=true');
    expect(verified).toContain('neutral with no notification');
    expect(verified).toContain('Finalize exact current release generation');
    expect(verified).toContain('Notify exact verified production generation');
    expect(verified.match(/commits\/main/g)).toHaveLength(3);
  });

  it('requires canonical deployment ID and SHA convergence only in the leased final tail', () => {
    const workflow = readFileSync(productionControllerWorkflowPath, 'utf8');
    const verifier = readFileSync(productionAliasVerifierPath, 'utf8');
    const smokeJob = getJobBlock(workflow, 'ci-public-profile-smoke');
    const verifiedJob = getJobBlock(workflow, 'production-verified');
    const exactGate = getStepBlock(
      verifiedJob,
      'Require exact deployment and every post-deploy probe'
    );

    expect(verifier).toContain('vercel inspect "$canonical_domain"');
    expect(verifier).toContain('EXPECTED_PRODUCTION_DEPLOYMENT_ID');
    expect(verifier).toContain('vcrrForceStable=true');
    expect(verifier).toContain('vcrrForceCanary=true');
    expect(verifier).toContain('Cache-Control: no-cache, no-store');
    expect(verifier).toContain('[ "$environment" != "production" ]');
    expect(verifier).not.toContain('x-vercel-protection-bypass');
    expect(exactGate).toContain(
      'EXPECTED_PRODUCTION_DEPLOYMENT_ID: ${{ needs.production-release.outputs.production_deployment_id }}'
    );
    expect(exactGate).toContain("PRODUCTION_ALIAS_REQUIRED_ROUNDS: '1'");
    expect(exactGate).toContain('verify-production-alias.sh');
    expect(verifiedJob).not.toContain('concurrency:');
    expect(smokeJob).not.toContain('verify-production-alias.sh');
    expect(smokeJob).toContain(
      'needs.production-release.outputs.production_deployment_url_b64'
    );
    expect(smokeJob).toContain('base64 --decode');
    expect(smokeJob).not.toContain('Wait for CDN propagation');
  });

  it('keeps promotion ownership and live rollout horizon hard-bounded', () => {
    const workflow = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const controller = readFileSync(productionPromotionControllerPath, 'utf8');
    const promotionJob = getJobBlock(workflow, 'promote-production');
    const promotionStep = getStepBlock(
      promotionJob,
      'Promote staged production deployment'
    );
    const defaultPollSeconds = Number(
      controller.match(/PRODUCTION_PROMOTION_POLL_SECONDS:-([0-9]+)}/)?.[1]
    );
    const defaultSettleAttempts = Number(
      controller.match(/PRODUCTION_PROMOTION_SETTLE_ATTEMPTS:-([0-9]+)}/)?.[1]
    );
    const defaultPromoteTimeoutMinutes = Number(
      controller.match(/PRODUCTION_PROMOTION_CLI_TIMEOUT:-([0-9]+)m}/)?.[1]
    );
    const promotionStepTimeoutMinutes = Number(
      promotionStep.match(/timeout-minutes:\s*([0-9]+)/)?.[1]
    );
    // Vercel durations are minutes; production holds 10% traffic for 5 minutes.
    const liveAutomaticStageSeconds = 5 * 60;
    const apiConvergenceBufferSeconds = 3 * 60;
    const shellAndApiBufferSeconds = 60;

    expect(defaultPollSeconds).toBe(5);
    expect(defaultSettleAttempts).toBe(96);
    expect(defaultPollSeconds * defaultSettleAttempts).toBeGreaterThanOrEqual(
      liveAutomaticStageSeconds + apiConvergenceBufferSeconds
    );
    expect(defaultPromoteTimeoutMinutes).toBe(3);
    expect(promotionStepTimeoutMinutes).toBe(15);
    expect(promotionStepTimeoutMinutes * 60).toBeGreaterThanOrEqual(
      defaultPromoteTimeoutMinutes * 60 +
        defaultPollSeconds * defaultSettleAttempts +
        shellAndApiBufferSeconds
    );
    expect(controller).toContain('PRODUCTION_PROMOTION_CLEANUP_ATTEMPTS:-12');
    expect(controller).toContain('rolling-release fetch');
    expect(controller).toContain('rollout_target_id');
    expect(controller).toContain('observing owned automatic rollout');
    expect(
      controller
        .split('\n')
        .filter(line => !line.trimStart().startsWith('#'))
        .join('\n')
    ).not.toContain('rolling-release complete');
    expect(controller).toContain('rolling-release abort --dpl "$deploy_id"');
    expect(controller).toContain('without resubmitting');
    expect(controller).not.toContain('while true');
    expect(controller).not.toContain('vercel rollback');
    expect(controller.match(/vercel promote/g)).toHaveLength(1);
  });

  it('preserves production failure subtypes through the reusable result', () => {
    const workflow = readFileSync(productionControllerWorkflowPath, 'utf8');
    const reusable = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const verifier = readFileSync(productionAliasVerifierPath, 'utf8');
    const result = getJobBlock(reusable, 'release-result');
    const verified = getJobBlock(workflow, 'production-verified');

    expect(reusable).toContain('staged_production_canary_failed');
    expect(verifier).toContain('production_alias_not_updated');
    expect(reusable).toContain('failure_subtype:');
    expect(result).toContain(
      'needs.promote-production.outputs.failure_subtype'
    );
    expect(verified).toContain(
      'Release generation lacks exact passing gate, canonical deployment, or SHA evidence'
    );
    expect(reusable).toContain('production_deployment_url_b64:');
    expect(result).toContain(
      'needs.promote-production.outputs.production_deployment_url_b64'
    );
  });

  it('checks out the exact authorized SHA with direct needs wiring', () => {
    const controller = readFileSync(productionControllerWorkflowPath, 'utf8');
    const reusable = readFileSync(productionReleaseWorkflowPath, 'utf8');

    for (const jobName of [
      'ci-public-profile-smoke',
      'ci-post-deploy-auth-smoke',
      'lighthouse-ci',
      'production-verified',
    ]) {
      const job = getJobBlock(controller, jobName);
      expect(job).toContain('authorize-production');
      expect(job).toContain(
        'ref: ${{ needs.authorize-production.outputs.expected_sha }}'
      );
    }
    expect(reusable.match(/actions\/checkout/g)).toHaveLength(6);
    expect(
      reusable.match(/ref: \$\{\{ inputs\.expected_sha \}\}/g)
    ).toHaveLength(6);
  });

  it('keeps rollback centralized behind confirmed structured gate failures', () => {
    const reusable = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const sentry = readFileSync(sentryGateWorkflowPath, 'utf8');
    const cost = readFileSync(costAnomalyWorkflowPath, 'utf8');
    const tick = readFileSync(agentTickWorkflowPath, 'utf8');

    expect(reusable.match(/vercel rollback/g)).toHaveLength(1);
    expect(`${sentry}\n${cost}\n${tick}`).not.toContain('vercel rollback');
    expect(reusable).toContain("gate_status == 'failed'");
    expect(reusable).toContain('gate_status=error');
    expect(reusable).toContain('PLAYWRIGHT_JSON_OUTPUT_NAME');
    expect(reusable).toContain('CONFIRMED_OAUTH_RUNTIME_CONTRACT');
    expect(reusable).toContain('/api/auth/sign-in/social');
    expect(reusable).not.toContain('/api/auth/ok');
    expect(reusable).toContain('no confirmed regression flag emitted');
    expect(reusable).toContain(
      'An uncertain production gate result must never trigger rollback'
    );
  });

  it('keeps leased canonical rollback valid when source main advances during soak', () => {
    const reusable = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const rollbackJob = getJobBlock(reusable, 'rollback-production');
    const rollbackStep = getStepBlock(
      rollbackJob,
      'Roll back explicitly to recorded previous deployment'
    );

    expect(rollbackStep).not.toContain('/commits/main');
    expect(rollbackStep).not.toContain('EXPECTED_COMMIT_SHA');
    expect(rollbackStep).toContain(
      '[ "$PREVIOUS_PRODUCTION_DEPLOYMENT_ID" = "$CURRENT_PRODUCTION_DEPLOYMENT_ID" ]'
    );
    expect(rollbackStep).toContain(
      '[ "$canonical_id" != "$CURRENT_PRODUCTION_DEPLOYMENT_ID" ]'
    );
    expect(rollbackStep).toContain(
      'vercel rollback "$PREVIOUS_PRODUCTION_DEPLOYMENT_ID"'
    );
  });

  it('uses non-overlapping normalized Sentry windows from Production secrets', () => {
    const reusable = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const sentryJob = getJobBlock(reusable, 'sentry-error-gate');
    const sentryAction = readFileSync(sentryGateActionPath, 'utf8');

    expect(sentryJob).toContain('runs-on: ubuntu-latest');
    expect(sentryJob).toContain('name: Production – jovie');
    expect(sentryJob).toContain('ref: ${{ inputs.expected_sha }}');
    expect(sentryJob).toContain('uses: ./.github/actions/sentry-error-gate');
    expect(sentryJob).toContain(
      'sentry-auth-token: ${{ secrets.SENTRY_AUTH_TOKEN }}'
    );
    expect(sentryJob).not.toContain(
      'uses: ./.github/workflows/sentry-error-gate.yml'
    );
    expect(sentryJob.indexOf('name: Production – jovie')).toBeLessThan(
      sentryJob.indexOf('sentry-auth-token:')
    );
    expect(sentryAction).toContain(
      "SENTRY_AUTH_TOKEN: ${{ inputs['sentry-auth-token'] }}"
    );
    expect(sentryAction).not.toContain('secrets.');
    expect(sentryAction).toContain(
      'https://sentry.io/api/0/projects/$SENTRY_ORG/$SENTRY_PROJECT/'
    );
    expect(sentryAction).toContain('project_id="$(jq -r');
    expect(sentryAction).toContain('START_EPOCH=$GATE_START_EPOCH');
    expect(sentryAction).toContain(
      'START_EPOCH=$((END_EPOCH - WINDOW_MINUTES * 60))'
    );
    expect(sentryAction).toContain(
      'POST_RATE_SCALED=$((POST_DEPLOY * BASELINE_MINUTES))'
    );
    expect(sentryAction).toContain(
      'BASELINE_RATE_LIMIT_SCALED=$((BASELINE * THRESHOLD * POST_MINUTES))'
    );
    expect(sentryAction).not.toContain('SENTRY_ORG:\n        required: true');
  });

  it('keeps cost and main-health observers strict, deduplicated, and bounded', () => {
    const cost = readFileSync(costAnomalyWorkflowPath, 'utf8');
    const monitor = readFileSync(mainHealthWorkflowPath, 'utf8');
    const evaluator = readFileSync(mainHealthActionPath, 'utf8');

    expect(cost).toContain("cron: '*/15 * * * *'");
    expect(cost).toContain('name: Production – jovie');
    expect(cost).toContain('curl --fail --silent --show-error');
    expect(cost).toContain('gh label create cost-monitoring --force');
    expect(cost).toContain('GH_REPO: ${{ github.repository }}');
    expect(cost).toContain('INCIDENT_TITLE="[Cost Anomaly]');
    expect(cost).toContain('should_notify=false');
    expect(cost).not.toContain('DRY_RUN');
    expect(monitor).toContain('group: main-ci-health-monitor');
    expect(monitor).toContain('main-ci-health-alert-$ALERT_KEY');
    expect(monitor).toContain('main-ci-rerun-request-${FAILED_RUN_ID}');
    expect(monitor).toContain('gh run rerun "$FAILED_RUN_ID" --failed');
    expect(evaluator).toContain("default: '5'");
    expect(evaluator).toContain('failingRunAttempt === 1');
    expect(evaluator).toContain('failingRunAttempt < 2');
    expect(evaluator).toContain('repair_state_unavailable');
  });

  it('recovers one payload-bound interrupted marker with a full leased rerun', () => {
    const health = readFileSync(productionControllerHealthPath, 'utf8');
    const healthEvaluation = getStepBlock(
      health,
      'Evaluate exact current production controller'
    );
    const reusable = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const controller = readFileSync(productionControllerWorkflowPath, 'utf8');
    const markerState = readFileSync(productionMarkerStatePath, 'utf8');
    const liveFixture = JSON.parse(
      readFileSync(productionControllerRunLiveFixturePath, 'utf8')
    );

    expect(health).toContain("cron: '*/15 * * * *'");
    expect(controller).toContain(
      'run-name: Production Controller ${{ github.event.workflow_run.head_sha }} from CI'
    );
    expect(controller).toContain('actions/workflows/production-controller.yml');
    expect(health).toContain('actions/workflows/production-controller.yml');
    expect(health).toContain(
      'event=workflow_run&head_sha=$current_sha&per_page=100'
    );
    expect(controller).toContain('actions/workflows/ci.yml');
    expect(health).toContain('actions/workflows/ci.yml');
    expect(controller.match(/\.name == "Production Controller"/g)).toHaveLength(
      1
    );
    expect(health.match(/\.name == "Production Controller"/g)).toHaveLength(1);
    expect(controller.match(/\.name == "CI"/g)).toHaveLength(1);
    expect(health.match(/\.name == "CI"/g)).toHaveLength(1);
    expect(controller).toContain('.workflow_id == $workflow_id');
    expect(health).toContain('.workflow_id == $workflow_id');
    expect(health).toContain('.display_title == $title');
    expect(health.match(/GH_REPO: \${{ github\.repository }}/g)).toHaveLength(
      2
    );
    expect(health).toContain('15-minute delivery grace');
    expect(health).toContain('[ "$source_ci_attempt" -ne 1 ]');
    expect(health).toContain('.id == $id and .run_attempt == 1');
    expect(health).toContain('gh run rerun "$source_ci_id"');
    expect(health).toContain('gh run rerun "$run_id"');
    expect(health).not.toContain('gh run rerun "$run_id" --failed');
    expect(health).toContain('needs_manual=true');
    expect(health).toContain('runs/$run_id/attempts/1/jobs?per_page=100');
    expect(health).toContain('endswith("Centralized production rollback")');
    expect(health).toContain('.status == "completed"');
    expect(health).toContain('.conclusion == "skipped"');
    expect(health).toContain('actions/runs/$run_id/attempts/1');
    expect(health).toContain('actions/runs/$run_id")');
    expect(health).toContain(
      '(.conclusion | IN("cancelled", "failure", "startup_failure", "timed_out"))'
    );
    expect(health).toContain('recovery_lease_already_exists');
    expect(health).toContain(
      "always() && steps.evaluate.outputs.needs_manual == 'true'"
    );
    expect(health).not.toContain('exit 1');
    expect(health.indexOf('exact_attempt="$(gh api')).toBeLessThan(
      health.indexOf('gh run rerun "$run_id"')
    );
    expect(health.indexOf('exact_jobs="$(gh api')).toBeLessThan(
      health.indexOf('gh run rerun "$run_id"')
    );
    expect(health.indexOf('latest_run="$(gh api')).toBeLessThan(
      health.indexOf('gh run rerun "$run_id"')
    );
    expect(health.indexOf('lease_listing="$(gh api')).toBeLessThan(
      health.indexOf('gh run rerun "$run_id"')
    );
    expect(health).toContain('incident duplicate_controller_generation');
    expect(healthEvaluation).toContain(
      'policy_state="$(policy_generation_state "$checked_out_sha" "$current_sha")"'
    );
    expect(healthEvaluation).toContain(
      'invalid)\n              incident invalid_checked_out_policy'
    );
    expect(healthEvaluation).toContain(
      'recovery_reason=policy_generation_superseded'
    );
    expect(
      healthEvaluation.indexOf('checked_out_sha="$(git rev-parse')
    ).toBeLessThan(healthEvaluation.indexOf('production-marker-state.mjs'));
    const policyFunctionMatch =
      / {10}(policy_generation_state\(\) \{[\s\S]*?\n {10}\})/.exec(
        healthEvaluation
      );
    expect(policyFunctionMatch).not.toBeNull();
    const policyFunction = (policyFunctionMatch?.[1] ?? '').replace(
      /^ {10}/gm,
      ''
    );
    const exactPolicySha = 'a'.repeat(40);
    for (const [checkedOut, current, expectedState] of [
      [exactPolicySha, exactPolicySha, 'current'],
      ['b'.repeat(40), exactPolicySha, 'superseded'],
      [exactPolicySha, 'c'.repeat(40), 'superseded'],
      ['not-a-sha', exactPolicySha, 'invalid'],
      ['', exactPolicySha, 'invalid'],
    ]) {
      const classification = spawnSync(
        'bash',
        [
          '-c',
          `${policyFunction}\npolicy_generation_state "$1" "$2"`,
          'policy-version-test',
          checkedOut,
          current,
        ],
        { encoding: 'utf8' }
      );
      expect(classification.status).toBe(0);
      expect(classification.stdout.trim()).toBe(expectedState);
    }

    const listingFilterMatch =
      /controller_runs="\$\(gh api[\s\S]*?jq -e '\n([\s\S]*?)\n\s+' >\/dev\/null <<<"\$controller_runs"/.exec(
        health
      );
    expect(listingFilterMatch).not.toBeNull();
    const listingFilter = listingFilterMatch?.[1] ?? 'false';
    const validListing = {
      total_count: 1,
      workflow_runs: [liveFixture.run],
    };
    expect(
      spawnSync('jq', ['-e', listingFilter], {
        encoding: 'utf8',
        input: JSON.stringify(validListing),
      }).status
    ).toBe(0);
    for (const missingField of [
      'id',
      'display_title',
      'status',
      'created_at',
    ]) {
      const malformedRun = structuredClone(liveFixture.run);
      delete malformedRun[missingField];
      expect(
        spawnSync('jq', ['-e', listingFilter], {
          encoding: 'utf8',
          input: JSON.stringify({
            total_count: 1,
            workflow_runs: [malformedRun],
          }),
        }).status,
        `controller listing must reject a run missing ${missingField}`
      ).not.toBe(0);
    }
    expect(reusable).toContain(
      'Could not resolve exact main at the release-result boundary'
    );
    expect(reusable).toContain('before post-deploy fanout; neutral');
    expect(controller).toContain('production-marker-state.mjs');
    expect(health).toContain('production-marker-state.mjs');
    expect(markerState).toContain('controllerAttempt');
    expect(markerState).toContain('/attempts/${controllerAttempt}');
    expect(markerState).toContain('Download every marker payload');
    expect(controller).toContain(
      'production-generation-recovery-${{ steps.authorize.outputs.expected_sha }}'
    );
    expect(controller).toContain('controllerAttempt: $controller_attempt');
    expect(controller).toContain(
      "format('production-generation-verified-recovery-{0}'"
    );
    expect(controller).not.toContain('overwrite: true');
    expect(
      controller.indexOf(
        'Consume the one-shot production marker recovery lease'
      )
    ).toBeLessThan(controller.indexOf('\n  production-release:'));
    expect(controller).toContain('.head_sha == $sha');
    expect(health).toContain('.head_sha == $sha');
    expect(controller).toContain('.head_repository.full_name == $repo');
    expect(health).toContain('.head_repository.full_name == $repo');
    expect(markerState).toContain('actions/artifacts/${artifactId}/zip');
    expect(controller).toContain(
      'Authenticated smoke was skipped because no complete credential pair is configured'
    );
    expect(controller).toContain('credentials_configured=false');
  });

  it('fails closed on expired, duplicate, foreign, or unpaired marker evidence', () => {
    const markerState = readFileSync(productionMarkerStatePath, 'utf8');

    expect(markerState).toContain("manual('expired_marker')");
    expect(markerState).toContain("manual('duplicate_marker_name')");
    expect(markerState).toContain("manual('recovery_marker_without_primary')");
    expect(markerState).toContain("manual('recovery_lease_without_marker')");
    expect(markerState).toContain('artifact.workflowRunId');
    expect(markerState).toContain('payload.controllerRun');
    expect(markerState).toContain('payload.controllerAttempt');
    expect(markerState).toContain(
      '`production-generation-verified-recovery-${sha}`'
    );
  });
});
