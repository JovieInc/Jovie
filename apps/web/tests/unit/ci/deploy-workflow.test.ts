import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
      'ci-storybook-a11y',
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
      'for t in run_build run_test run_test_performance run_storybook_a11y run_public_lighthouse'
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
  it('classifies relevant paths but runs only by manual dispatch', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const pathJob = getJobBlock(workflow, 'ci-path-changes');
    const detectStep = getStepBlock(
      pathJob,
      'Detect path changes for all job types'
    );
    const storybookJob = getJobBlock(workflow, 'ci-storybook-a11y');

    expect(pathJob).toContain(
      "run_storybook_a11y: ${{ steps.detect.outputs.run_storybook_a11y || 'false' }}"
    );
    expect(storybookJob).toContain("github.event_name == 'workflow_dispatch'");
    expect(storybookJob).not.toContain("github.event_name == 'pull_request'");
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
  const end = step.indexOf('\n\n          if ! printf', start);
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
    expect(authorization).toContain('.name == "Production Controller"');
    expect(authorization).toContain('.name == "Production Verified"');
    expect(authorization).toContain('.head_sha == $sha');
    expect(authorization).toContain('.conclusion == "success"');
    expect(authorization).toContain('commits/main');
    expect(authorization).toContain('status=success');
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
      'actions/runs/$run_id/attempts/$run_attempt/jobs?per_page=100'
    );
    expect(authorization).toContain('.name == "Upload Internal TestFlight"');
    expect(authorization).toContain(
      'actions/artifacts?name=$marker_name&per_page=100'
    );
    expect(
      authorization.indexOf('marker_name="testflight-upload-verified"')
    ).toBeLessThan(
      authorization.indexOf(
        'actions/workflows/ios-testflight.yml/runs?branch=main&status=success&per_page=100'
      )
    );
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
    expect(uploadMarker).toContain('for attempt in $(seq 1 "$RUN_ATTEMPT")');
    expect(uploadMarker).toContain('upload_attempt="$attempt"');
    expect(uploadMarker).toContain(
      'No successful exact TestFlight upload job exists in this run.'
    );
    expect(uploadMarker).toContain('.name == "iOS TestFlight"');
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

  it('keeps the dependency-free risk classifier off dependency caches', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const classifierJob = getJobBlock(workflow, 'ci-risk-classifier');

    expect(classifierJob).toContain('timeout-minutes: 3');
    expect(classifierJob).toContain(
      'uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e'
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
    expect(authorization).toContain('gh api --paginate --slurp');
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
    expect(deployScript).toContain(
      '--build-env "VERCEL_GIT_COMMIT_SHA=${VERCEL_GIT_COMMIT_SHA}"'
    );
    expect(deployScript).toContain(
      '--env "VERCEL_GIT_COMMIT_SHA=${VERCEL_GIT_COMMIT_SHA}"'
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
    const configureStep = getStepBlock(
      stagingJob,
      'Configure staging deployment credentials'
    );
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

    expect(configureStep).toContain(
      'VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}'
    );
    expect(configureStep).toContain(
      'VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}'
    );
    expect(configureStep).toContain(
      'VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}'
    );
    expect(configureStep).toContain('>> "$GITHUB_ENV"');

    const queueReaperStep = getStepBlock(
      stagingJob,
      'Cancel stale Vercel preview deployments'
    );
    expect(queueReaperStep).toContain(
      'node .github/scripts/cancel-stale-vercel-previews.mjs'
    );

    for (const { command, name } of stagingSteps) {
      const step = getStepBlock(stagingJob, name);
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
      expect(deployStep).toContain(`--env ${key}="\${${key}}"`);
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
    const configureStep = getStepBlock(
      promoteJob,
      'Configure production deployment credentials'
    );
    const stageStep = getStepBlock(
      promoteJob,
      'Build and stage production deployment'
    );
    const dopplerIndex = promoteJob.indexOf(
      '- uses: ./.github/actions/setup-doppler'
    );
    const configureIndex = promoteJob.indexOf(
      '- name: Configure production deployment credentials'
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
    expect(configureIndex).toBeGreaterThan(dopplerIndex);
    expect(domainGuardIndex).toBeGreaterThan(configureIndex);
    expect(promoteJob).toContain(
      'doppler-token: ${{ secrets.DOPPLER_TOKEN_PRD }}'
    );
    expect(configureStep).toContain(
      'Missing required production deployment credentials:'
    );
    for (const key of ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID']) {
      expect(configureStep).toContain(`${key}: \${{ secrets.${key} }}`);
      expect(configureStep).toContain(`printf '${key}=%s\\n'`);
    }

    expect(stageStep).toContain('--target=prd --source=env');
    expect(stageStep).not.toContain('--target=prd --source=vercel-file');
    expect(stageStep).toContain('required_runtime_env=(');
    expect(stageStep).toContain('Missing production runtime env:');
    expect(stageStep).toContain('runtime_env_args+=(--env "${key}=${!key}")');
    expect(stageStep).toContain('"${runtime_env_args[@]}"');
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
      '${production_deploy_url}/api/health/build-info'
    );
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

    for (const job of [
      'ci-public-profile-smoke',
      'ci-post-deploy-auth-smoke',
      'ci-homepage-smoke',
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
    expect(lighthouse).toContain(
      "require('playwright').chromium.executablePath()"
    );
    expect(lighthouse).toContain('echo "CHROME_PATH=$chrome_path"');
    expect(lighthouse).toContain('lighthouse-production-exact.json');
    expect(verified).toContain('ci-public-profile-smoke');
    expect(verified).toContain('ci-post-deploy-auth-smoke');
    expect(verified).toContain('ci-homepage-smoke');
    expect(verified).toContain('lighthouse-ci');
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
});

describe('unit-test runner capacity', () => {
  it('fills the pool without exceeding each ephemeral runner CPU quota', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const routeJob = getJobBlock(workflow, 'ci-unit-runner-route');
    const unitJob = getJobBlock(workflow, 'ci-unit-tests');

    expect(routeJob).toContain('runs-on: ubuntu-latest');
    expect(routeJob).toContain('ref: main');
    expect(routeJob).toContain('continue-on-error: true');
    expect(routeJob).toContain("runner='ubuntu-latest'");
    expect(routeJob).toContain('.github/scripts/query-runner-heartbeat.sh');
    expect(routeJob).toContain('[ "$HEARTBEAT_HEALTH" = \'up\' ]');
    expect(routeJob).toContain('jovie-runner|ubuntu-latest');
    expect(routeJob).not.toContain('secrets.');
    expect(unitJob).toContain(
      "runs-on: ${{ needs.ci-unit-runner-route.outputs.runner || 'ubuntu-latest' }}"
    );
    expect(unitJob).not.toContain('vars.CI_UNIT_RUNNER');
    expect(unitJob).toContain('max-parallel: 2');
    expect(unitJob).toContain(
      'Five logical shards, at most two concurrent per queue candidate'
    );
    expect(unitJob).toContain('anti-slam headroom');
    expect(unitJob).toContain('Runner Heartbeat');
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
      `if ! printf '%s\\n' "$robots_body" | preview_robots_policy_valid; then`
    );
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

  it('waits for the public alias to serve the target build before auth smoke', () => {
    const workflow = readFileSync(canaryWorkflowPath, 'utf8');
    const canaryStep = getStepBlock(workflow, 'Canary health check');
    const authSmokeStep = getStepBlock(
      workflow,
      'Verify public auth controls are interactive'
    );
    const directFallbackStart = canaryStep.indexOf(
      'Retrying commit deployment URL'
    );
    const directFallbackEnd = canaryStep.indexOf(
      'if [ "$response_code" != "200" ]; then',
      directFallbackStart
    );
    const directFallbackBlock = canaryStep.slice(
      directFallbackStart,
      directFallbackEnd
    );
    const canaryCurlProbes =
      canaryStep.match(
        /curl -sS? -L[\s\S]*?(?:\|\| printf '\\n000'|\|\| echo "")/g
      ) ?? [];

    expect(directFallbackStart).toBeGreaterThanOrEqual(0);
    expect(directFallbackEnd).toBeGreaterThan(directFallbackStart);
    expect(workflow).toContain('verified_deployment_url:');
    expect(workflow).toContain(
      'value: ${{ jobs.canary-health-gate.outputs.verified_deployment_url }}'
    );
    expect(canaryStep).toContain('/api/health/build-info');
    expect(canaryStep).toContain('local max_attempts=15');
    expect(canaryStep).toContain(
      'CURL_TIMEOUT_ARGS=(--connect-timeout 5 --max-time 15)'
    );
    expect(canaryStep).toContain('public_deployment_url="${deployment_url%/}"');
    expect(directFallbackBlock).toContain(
      'diagnostic_deployment_url="$resolved_commit_deployment_url"'
    );
    expect(directFallbackBlock).not.toMatch(
      /^\s*deployment_url="\$resolved_commit_deployment_url"/m
    );
    expect(canaryStep).toContain(
      'verify_build_info_serves_commit "$public_deployment_url"'
    );
    expect(canaryStep).toContain('canary_status=failed_build_info');
    expect(canaryStep).toContain(
      'verified_deployment_url=${public_deployment_url}'
    );
    expect(canaryStep).toContain(
      'Checking onboarding chat reaches the bot gate'
    );
    expect(canaryStep).toContain('"errorCode":"ONBOARDING_CHAT_DISABLED"');
    expect(canaryStep).toContain('"errorCode":"TURNSTILE_REQUIRED"');
    expect(canaryStep).toContain('canary_status=failed_onboarding_chat');
    expect(authSmokeStep).toContain(
      'DEPLOYMENT_URL: ${{ steps.canary-check.outputs.verified_deployment_url || inputs.deployment_url }}'
    );
    expect(authSmokeStep).toContain(
      'PLAYWRIGHT_VERCEL_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}'
    );
    expect(authSmokeStep).not.toContain(
      'VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}'
    );
    expect(authSmokeStep).toContain(
      "primes Vercel's bypass cookie by URL query instead of headers"
    );
    expect(authSmokeStep).toContain('auth_smoke_attempt=1');
    expect(authSmokeStep).toContain('auth_smoke_max_attempts=3');
    expect(authSmokeStep).toContain(
      'until CI=true SMOKE_ONLY=1 BASE_URL="${DEPLOYMENT_URL}" node "$GITHUB_WORKSPACE/.github/scripts/guard-playwright-artifacts.mjs" --run -- pnpm exec playwright test tests/e2e/auth-public-ready.spec.ts --project=chromium --reporter=line; do'
    );
    expect(authSmokeStep).toContain(
      'Public auth controls failed after ${auth_smoke_max_attempts} attempts.'
    );
    expect(authSmokeStep).toContain(
      'sleep_seconds=$((auth_smoke_attempt * 30))'
    );

    expect(canaryCurlProbes.length).toBeGreaterThanOrEqual(9);
    for (const probe of canaryCurlProbes) {
      expect(probe).toMatch(
        /("\$\{CURL_TIMEOUT_ARGS\[@\]\}"|--connect-timeout 5[\s\S]*--max-time (10|15))/
      );
    }
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

  it('runs two mobile widths while retaining the three-width evidence set', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const mobile = getJobBlock(workflow, 'ci-mobile-overflow');

    expect(mobile).toContain('max-parallel: 2');
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
      '${production_deploy_url}/api/health/build-info'
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
    expect(stageStep).toContain('${production_deploy_url}/api/health');
    expect(stageStep).toContain('${production_deploy_url}/"');
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
      'promotion_sha: ${{ steps.promote.outputs.promotion_sha || steps.final-current.outputs.superseded_sha }}'
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
    const result = getJobBlock(reusable, 'release-result');
    const verified = getJobBlock(controller, 'production-verified');

    expect(promoteJob).toContain(
      'production_deployment_url_b64: ${{ steps.stage-production.outputs.production_deployment_url_b64 }}'
    );
    expect(promoteJob).toContain(
      'promotion_sha: ${{ steps.promote.outputs.promotion_sha || steps.final-current.outputs.superseded_sha }}'
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
    expect(result).toContain('^https://[A-Za-z0-9.-]+\\.vercel\\.app$');
    expect(result).toContain(
      'Successful production promotion omitted exact observed main SHA evidence.'
    );
    expect(reusable).toContain('production_deployment_url_b64:');
    expect(reusable).not.toMatch(/^      production_deployment_url:/m);

    for (const jobName of [
      'ci-public-profile-smoke',
      'ci-post-deploy-auth-smoke',
      'ci-homepage-smoke',
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
    expect(reusable.match(/actions\/checkout/g)).toHaveLength(5);
    expect(
      reusable.match(/ref: \$\{\{ inputs\.expected_sha \}\}/g)
    ).toHaveLength(5);
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
    expect(reusable).toContain(
      'Google rejected redirect_uri|Apple rejected return URL'
    );
    expect(reusable).toContain('application/json {ok:true}');
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
    const sentry = readFileSync(sentryGateWorkflowPath, 'utf8');

    expect(sentry).toContain('name: Production – jovie');
    expect(sentry).toContain(
      'SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}'
    );
    expect(sentry).toContain(
      'https://sentry.io/api/0/projects/$SENTRY_ORG/$SENTRY_PROJECT/'
    );
    expect(sentry).toContain('project_id="$(jq -r');
    expect(sentry).toContain('START_EPOCH=$GATE_START_EPOCH');
    expect(sentry).toContain(
      'START_EPOCH=$((END_EPOCH - WINDOW_MINUTES * 60))'
    );
    expect(sentry).toContain(
      'POST_RATE_SCALED=$((POST_DEPLOY * BASELINE_MINUTES))'
    );
    expect(sentry).toContain(
      'BASELINE_RATE_LIMIT_SCALED=$((BASELINE * THRESHOLD * POST_MINUTES))'
    );
    expect(sentry).not.toContain('SENTRY_ORG:\n        required: true');
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

  it('recovers a failed controller only once and skips obsolete fanout', () => {
    const health = readFileSync(productionControllerHealthPath, 'utf8');
    const reusable = readFileSync(productionReleaseWorkflowPath, 'utf8');
    const controller = readFileSync(productionControllerWorkflowPath, 'utf8');

    expect(health).toContain("cron: '*/15 * * * *'");
    expect(controller).toContain(
      'run-name: Production Controller ${{ github.event.workflow_run.head_sha }} from CI'
    );
    expect(health).toContain('.display_title == $title');
    expect(health.match(/GH_REPO: \${{ github\.repository }}/g)).toHaveLength(
      2
    );
    expect(health).toContain('event-delivery grace');
    expect(health).toContain('[ "$source_ci_attempt" -ge 2 ]');
    expect(health).toContain('.id == $id and .run_attempt == 1');
    expect(health).toContain('gh run rerun "$source_ci_id"');
    expect(health).toContain(
      'Could not resolve exact main at the CI event-replay boundary'
    );
    expect(health).toContain('[ "$run_attempt" -ge 2 ]');
    expect(health).toContain('gh run rerun "$run_id" --failed');
    expect(health).toContain('gh run rerun "$run_id"');
    expect(health).toContain('needs_manual=true');
    expect(health).toContain(
      'runs/$run_id/attempts/$run_attempt/jobs?per_page=100'
    );
    expect(health).toContain('endswith("Centralized production rollback")');
    expect(health).toContain('(.status == "completed")');
    expect(health).toContain('(.conclusion == "skipped")');
    expect(health).toContain('recovery_reason=terminal_rollback');
    expect(health).toContain('this controller attempt is terminal');
    expect(health).toContain('It must not be rerun');
    expect(health.indexOf('rollback_jobs="$(jq -c')).toBeLessThan(
      health.indexOf('gh run rerun "$run_id" --failed')
    );
    expect(reusable).toContain(
      'Could not resolve exact main at the release-result boundary'
    );
    expect(reusable).toContain('before post-deploy fanout; neutral');
    expect(controller).toContain(
      'Ignoring marker from incomplete or unsuccessful controller run'
    );
    expect(controller).toContain(
      'Ignoring marker with invalid exact-generation content'
    );
    expect(controller).toContain('actions/artifacts/$marker_artifact_id/zip');
    expect(controller).toContain(
      'Authenticated smoke was skipped because no complete credential pair is configured'
    );
    expect(controller).toContain('credentials_configured=false');
  });
});
