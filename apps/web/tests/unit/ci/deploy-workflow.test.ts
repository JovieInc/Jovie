import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const workflowPath = resolve(repoRoot, '.github/workflows/ci.yml');
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
const ciFastLanesPath = resolve(repoRoot, 'scripts/ci-fast-lanes.mjs');
const canaryWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/canary-health-gate.yml'
);
const agentTickWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/agent-tick.yml'
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
  it('runs the budget job only for its exact internal-PR inputs or main', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const pathJob = getJobBlock(workflow, 'ci-path-changes');
    const detectStep = getStepBlock(
      pathJob,
      'Detect path changes for all job types'
    );
    const graphiteSkip = getStepBlock(pathJob, 'Resolve exact-head CI policy');
    const performanceJob = getJobBlock(workflow, 'ci-test-performance');

    expect(pathJob).toContain(
      "run_test_performance: ${{ steps.detect.outputs.run_test_performance || steps.graphite_skip.outputs.run_test_performance || 'false' }}"
    );
    expect(graphiteSkip).toContain('run_test_performance');
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

    const testingStart = detectStep.indexOf(
      'if [[ "$FULL_CI_LABEL" == "true" ]]'
    );
    const testingEnd = detectStep.indexOf('\n          fi', testingStart);
    expect(testingStart).toBeGreaterThan(0);
    expect(testingEnd).toBeGreaterThan(testingStart);
    expect(detectStep.slice(testingStart, testingEnd)).not.toContain(
      'run_test_performance'
    );
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
      "if: ${{ (github.event_name == 'push' && github.ref == 'refs/heads/main') || (needs.ci-path-changes.outputs.skip == 'false' && github.event_name == 'pull_request' && github.event.pull_request.head.repo.fork == false && needs.ci-path-changes.outputs.run_test_performance == 'true') }}"
    );
    expect(performanceJob).not.toContain(
      "if: ${{ needs.ci-path-changes.outputs.skip == 'false' && ((github.event_name == 'push'"
    );
    expect(performanceJob).toContain(
      "run_full_ci=${{ needs.ci-path-changes.outputs.run_test == 'true' || needs.ci-path-changes.outputs.run_test_performance == 'true' }}"
    );
  });
});

describe('CI Storybook accessibility path gate', () => {
  it('runs for relevant paths and every full-CI request', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const pathJob = getJobBlock(workflow, 'ci-path-changes');
    const detectStep = getStepBlock(
      pathJob,
      'Detect path changes for all job types'
    );
    const graphiteSkip = getStepBlock(pathJob, 'Resolve exact-head CI policy');

    expect(pathJob).toContain(
      "run_storybook_a11y: ${{ steps.detect.outputs.run_storybook_a11y || steps.graphite_skip.outputs.run_storybook_a11y || 'false' }}"
    );
    expect(graphiteSkip).toContain('run_storybook_a11y');

    const testingStart = detectStep.indexOf(
      'if [[ "$FULL_CI_LABEL" == "true" ]]'
    );
    const testingEnd = detectStep.indexOf('\n          fi', testingStart);
    expect(testingStart).toBeGreaterThan(0);
    expect(testingEnd).toBeGreaterThan(testingStart);
    expect(detectStep.slice(testingStart, testingEnd)).toContain(
      'run_storybook_a11y'
    );

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
    const visualPathJob = getJobBlock(visualWorkflow, 'ci-visual-path-changes');
    const visualDetectStep = getStepBlock(
      visualPathJob,
      'Detect visual-relevant changes'
    );
    expect(visualDetectStep).toContain(
      'if [ "${{ github.event_name }}" == "workflow_dispatch" ]; then'
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
  it('keeps the dependency-free risk classifier off dependency caches', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const classifierJob = getJobBlock(workflow, 'ci-risk-classifier');

    expect(classifierJob).toContain('timeout-minutes: 3');
    expect(classifierJob).toContain(
      'uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e'
    );
    expect(classifierJob).toContain("node-version: '22'");
    // biome-ignore format: merge-group checkout contract stays compact for the integration-train cap
    expect([classifierJob.includes('fetch-depth: 2'), classifierJob.includes('git fetch --no-tags --depth=1 origin "$DIFF_BASE"'), classifierJob.includes('git diff --name-only "$DIFF_BASE" "${{ github.event.merge_group.head_sha }}"'), classifierJob.includes('$DIFF_BASE...${{ github.event.merge_group.head_sha }}')]).toEqual([true, true, true, false]);
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

  it('routes main deploy artifact builds to hosted capacity', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const buildJob = getJobBlock(workflow, 'ci-build-public');

    expect(buildJob).toContain("github.ref == 'refs/heads/main'");
    expect(buildJob).toContain("&& 'ubuntu-latest'");
    expect(buildJob).toContain('|| vars.CI_FAST_RUNNER');
  });

  it('runs main deploy control jobs on hosted capacity', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(getJobBlock(workflow, 'deploy-gate')).toContain(
      'runs-on: ubuntu-latest'
    );
    expect(getJobBlock(workflow, 'deploy-staging')).toContain(
      'runs-on: ubuntu-latest'
    );
    expect(getJobBlock(workflow, 'alias-staging')).toContain(
      'runs-on: ubuntu-latest'
    );
    expect(getJobBlock(workflow, 'promote-production')).toContain(
      'runs-on: ubuntu-latest'
    );
    expect(readFileSync(canaryWorkflowPath, 'utf8')).toContain(
      'runs-on: ubuntu-latest'
    );
  });

  it('passes the exact GitHub SHA into every external Vercel build and source deploy', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const buildShaEnv = 'VERCEL_GIT_COMMIT_SHA: ${{ github.sha }}';
    const buildJob = getJobBlock(workflow, 'ci-build-public');
    const stagingJob = getJobBlock(workflow, 'deploy-staging');
    const deployStep = getStepBlock(
      stagingJob,
      'Deploy (staging preview, prebuilt)'
    );
    const deployScript = readFileSync(
      resolve(repoRoot, '.github/scripts/vercel-prebuilt-deploy.sh'),
      'utf8'
    );

    expect(getStepBlock(buildJob, 'Vercel build (deploy artifact)')).toContain(
      buildShaEnv
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

    const stagingJob = getJobBlock(workflow, 'deploy-staging');
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

  it('uses the restored prebuilt and refuses source-cache substitution', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const deployStep = getStepBlock(
      workflow,
      'Deploy (staging preview, prebuilt)'
    );

    expect(deployStep).not.toContain('VERCEL_FORCE_SOURCE_DEPLOY');
    expect(deployStep).toContain("VERCEL_ENABLE_SOURCE_FALLBACK: 'false'");
  });

  it('packages generated public trace files and budgets remote fallback readiness', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const buildJob = getJobBlock(workflow, 'ci-build-public');
    const stagingJob = getJobBlock(workflow, 'deploy-staging');
    const readinessStep = getStepBlock(
      stagingJob,
      'Wait for staging deployment readiness'
    );

    expect(buildJob).toContain(
      'cp apps/web/.next/server/app/robots.txt.body apps/web/public/robots.txt'
    );
    expect(buildJob).toContain('.vercel/jovie-generated-public-files');
    expect(readinessStep).toContain('--timeout 20m');
    expect(readinessStep).toContain('BUILDING|QUEUED|INITIALIZING)');
    expect(readinessStep).toContain('handing off to retrying canary');
  });

  it('passes signup readiness keys into the staging preview runtime', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
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
    const workflow = readFileSync(workflowPath, 'utf8');
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

  it('verifies production promotion through the canonical public alias', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
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

  it('alerts specifically when production domains drift off the canonical Vercel project', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const classifyStep = getStepBlock(workflow, 'Classify failure type');
    const generalSlackStep = getStepBlock(
      workflow,
      'Slack notify (general deploy failure)'
    );

    expect(classifyStep).toContain('domain_project_mismatch');
    expect(classifyStep).toContain(
      'Production domains are on the wrong Vercel project'
    );
    expect(classifyStep).toContain(
      'Production promotion was blocked before deploy.'
    );
    expect(generalSlackStep).toContain('promote_domain_project_mismatch');
  });
});

describe('unit-test runner capacity', () => {
  it('fills the pool without exceeding each ephemeral runner CPU quota', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const unitJob = getJobBlock(workflow, 'ci-unit-tests');

    expect(unitJob).toContain(
      "runs-on: ${{ vars.CI_UNIT_RUNNER || 'ubuntu-latest' }}"
    );
    expect(unitJob).toContain(
      "max-parallel: ${{ vars.CI_UNIT_RUNNER == 'jovie-ephemeral' && 5 || 3 }}"
    );
    expect(unitJob).toContain('10-slot autoscaled ephemeral pool');
    expect(unitJob).toContain('two PRs use all 10');
    expect(unitJob).toContain(
      'hosted fallback retains the original 3-shard cap'
    );
    expect(unitJob).toContain('Each ephemeral runner has 2 CPUs');
    expect(unitJob).toContain('VITEST_CI_FLAGS="--pool=forks --maxWorkers=2"');
    expect(unitJob).not.toContain(
      'VITEST_CI_FLAGS="--pool=forks --maxWorkers=3"'
    );
  });
});

describe('informational CI tail capacity', () => {
  it('keeps PR Summary off the ephemeral unit-test pool', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const summaryJob = getJobBlock(workflow, 'ci-summary');

    expect(summaryJob).toContain('Informational only (posts a PR comment)');
    expect(summaryJob).toContain(
      "runs-on: ${{ vars.CI_GATE_RUNNER || 'ubuntu-latest' }}"
    );
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
      'until CI=true SMOKE_ONLY=1 BASE_URL="${DEPLOYMENT_URL}" pnpm exec playwright test tests/e2e/auth-public-ready.spec.ts --project=chromium --reporter=line; do'
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
    const localOrigin = 'http://localhost:3100';
    const sharedBuild = getStepBlock(
      getJobBlock(workflow, 'ci-build-public'),
      'Build app (public routes only — no secrets needed)'
    );
    const goldenPathJob = getJobBlock(workflow, 'ci-golden-path');
    const extendedSmokeJob = getJobBlock(workflow, 'ci-smoke-required');

    expect(sharedBuild).toContain(
      `NEXT_PUBLIC_BETTER_AUTH_URL: ${localOrigin}`
    );
    expect(sharedBuild).toContain(`NEXT_PUBLIC_APP_URL: ${localOrigin}`);
    expect(sharedBuild).toContain("NEXT_PUBLIC_E2E_MODE: '1'");
    const goldenBuild = getStepBlock(
      goldenPathJob,
      'Build real-Clerk golden-path artifact'
    );
    expect(goldenBuild).toContain(
      `NEXT_PUBLIC_BETTER_AUTH_URL: ${localOrigin}`
    );
    expect(goldenBuild).toContain(`NEXT_PUBLIC_APP_URL: ${localOrigin}`);
    const extendedBuild = getStepBlock(
      extendedSmokeJob,
      'Extract or rebuild for smoke tests'
    );
    expect(extendedBuild).toContain(
      `NEXT_PUBLIC_BETTER_AUTH_URL: ${localOrigin}`
    );
    expect(extendedBuild).toContain(`NEXT_PUBLIC_APP_URL: ${localOrigin}`);
    expect(extendedBuild).toContain("NEXT_PUBLIC_E2E_MODE: '1'");

    const standaloneSteps = [
      getStepBlock(
        getJobBlock(workflow, 'ci-e2e-smoke'),
        'Run E2E Smoke (Chromium)'
      ),
      getStepBlock(goldenPathJob, 'Run Golden Path (Chromium, Better Auth)'),
      getStepBlock(extendedSmokeJob, 'Run Required Smoke Tests'),
    ];

    for (const step of standaloneSteps) {
      expect(step).toContain(`export BETTER_AUTH_URL=${localOrigin}`);
      expect(step).toContain(
        `export NEXT_PUBLIC_BETTER_AUTH_URL=${localOrigin}`
      );
      expect(step).toContain('export HOSTNAME=localhost');
      expect(step).toContain(`export NEXT_PUBLIC_APP_URL=${localOrigin}`);
      expect(step).toContain(`BETTER_AUTH_URL: ${localOrigin}`);
      expect(step).toContain(`NEXT_PUBLIC_BETTER_AUTH_URL: ${localOrigin}`);
      expect(step).toContain('SESSION_SECRET: ${{ secrets.SESSION_SECRET }}');
    }

    for (const step of [standaloneSteps[0], standaloneSteps[2]]) {
      expect(step).toContain(
        'export UPSTASH_REDIS_REST_URL="${{ secrets.UPSTASH_REDIS_REST_URL }}"'
      );
      expect(step).toContain(
        'export UPSTASH_REDIS_REST_TOKEN="${{ secrets.UPSTASH_REDIS_REST_TOKEN }}"'
      );
    }
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
      'connection_file: /tmp/neon-db-connection/connection.json'
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
      'if: ${{ failure() && matrix.shard == 1 }}'
    );
    expect(failureArtifactStep).toContain('apps/web/playwright-report/');
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
      'connection_file: /tmp/neon-db-connection/connection.json'
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
  it('evaluates the smoke condition when the shared Neon prerequisite is path-skipped', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const smokeJob = getJobBlock(workflow, 'ci-e2e-smoke');

    expect(smokeJob).toContain('if: ${{ always() &&');
    expect(smokeJob).toContain(
      "needs.ci-risk-classifier.outputs.requires_smoke == 'true'"
    );
    expect(smokeJob).toContain(
      "needs.neon-db.result == 'success' || needs.neon-db.result == 'skipped'"
    );
    expect(smokeJob).toContain(
      "if: steps.check_changes.outputs.run_full_ci == 'true' && needs.neon-db.result != 'success'"
    );
    expect(smokeJob).toContain(
      "if: always() && steps.check_changes.outputs.run_full_ci == 'true' && needs.neon-db.result != 'success'"
    );
  });
});

describe('CI bounded evidence parallelism', () => {
  it('uses both Lighthouse shards without unbounded future fan-out', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const lighthouse = getJobBlock(workflow, 'ci-lighthouse-pr');

    expect(lighthouse).toContain('max-parallel: 2');
    expect(lighthouse).toContain('shard: [0, 1]');
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

  it('runs Neon branch cleanup from the consolidated ten-minute agent tick', () => {
    const agentTickWorkflow = readFileSync(agentTickWorkflowPath, 'utf8');
    const cleanupJob = getJobBlock(agentTickWorkflow, 'neon-cleanup');

    expect(agentTickWorkflow).toContain("cron: '*/10 * * * *'");
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
      'connection_file: /tmp/neon-db-connection/connection.json'
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
      'connection_file: /tmp/neon-db-connection/connection.json'
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
  it('deploys the restored staging prebuilt without a source fallback', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
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
    const workflow = readFileSync(workflowPath, 'utf8');
    const promoteJob = getJobBlock(workflow, 'promote-production');
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
    expect(stageStep).toContain('--target=prd --source=vercel-file');
    expect(stageStep).toContain('VERCEL_GIT_COMMIT_SHA="$GITHUB_SHA"');
    expect(stageStep).toContain('NEXT_PUBLIC_BUILD_SHA="$expected"');
    expect(stageStep).toContain('--meta "githubCommitSha=${GITHUB_SHA}"');
    expect(stageStep).toContain('[ "$production_deploy_state" != "READY" ]');
    expect(stageStep).toContain(
      '[ "$production_deploy_target" != "production" ]'
    );
    expect(stageStep).toContain('${production_deploy_url}/api/health');
    expect(stageStep).toContain('${production_deploy_url}/"');
    expect(promoteStep).toContain(
      'bash .github/scripts/promote-production-deployment.sh'
    );
    expect(verifyStep).toContain(
      'bash .github/scripts/verify-production-alias.sh'
    );
    expect(promoteJob).toContain('timeout-minutes: 60');
    expect(promoteJob).not.toContain('timeout-minutes: 360');
    expect(promoteJob).not.toContain('vercel promote "$deploy_url"');
  });

  it('requires canonical deployment ID and SHA convergence before smoke', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const verifier = readFileSync(productionAliasVerifierPath, 'utf8');
    const smokeJob = getJobBlock(workflow, 'ci-public-profile-smoke');
    const exactGate = getStepBlock(
      smokeJob,
      'Verify exact production deployment before smoke'
    );
    const genericSmokeIndex = smokeJob.indexOf(
      '- name: Verify production endpoints are healthy'
    );
    const exactGateIndex = smokeJob.indexOf(
      '- name: Verify exact production deployment before smoke'
    );

    expect(verifier).toContain('vercel inspect "$canonical_domain"');
    expect(verifier).toContain('EXPECTED_PRODUCTION_DEPLOYMENT_ID');
    expect(verifier).toContain('vcrrForceStable=true');
    expect(verifier).toContain('vcrrForceCanary=true');
    expect(verifier).toContain('Cache-Control: no-cache, no-store');
    expect(verifier).toContain('[ "$environment" != "production" ]');
    expect(verifier).not.toContain('x-vercel-protection-bypass');
    expect(exactGate).toContain(
      'EXPECTED_PRODUCTION_DEPLOYMENT_ID: ${{ needs.promote-production.outputs.production_deployment_id }}'
    );
    expect(exactGate).toContain("PRODUCTION_ALIAS_REQUIRED_ROUNDS: '1'");
    expect(exactGateIndex).toBeGreaterThanOrEqual(0);
    expect(genericSmokeIndex).toBeGreaterThan(exactGateIndex);
    expect(smokeJob).not.toContain('Wait for CDN propagation');
  });

  it('keeps promotion ownership checks and cleanup hard-bounded', () => {
    const controller = readFileSync(productionPromotionControllerPath, 'utf8');

    expect(controller).toContain('PRODUCTION_PROMOTION_SETTLE_ATTEMPTS:-36');
    expect(controller).toContain('PRODUCTION_PROMOTION_CLEANUP_ATTEMPTS:-12');
    expect(controller).toContain('rolling-release fetch');
    expect(controller).toContain('rollout_target_id');
    expect(controller).toContain('rolling-release complete --dpl "$deploy_id"');
    expect(controller).toContain('rolling-release abort --dpl "$deploy_id"');
    expect(controller).toContain('without resubmitting');
    expect(controller).not.toContain('while true');
    expect(controller).not.toContain('vercel rollback');
    expect(controller.match(/vercel promote/g)).toHaveLength(1);
  });

  it('routes new production failure subtypes to actionable notifications', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const classifyStep = getStepBlock(workflow, 'Classify failure type');
    const generalSlackStep = getStepBlock(
      workflow,
      'Slack notify (general deploy failure)'
    );

    expect(classifyStep).toContain('staged_production_canary_failed');
    expect(classifyStep).toContain('production_alias_not_updated');
    expect(classifyStep).toContain('^production_promotion_');
    expect(generalSlackStep).toContain('promote_staged_production_failed');
    expect(generalSlackStep).toContain('promote_production_alias_not_updated');
    expect(generalSlackStep).toContain('promote_production_state_blocked');
  });
});
