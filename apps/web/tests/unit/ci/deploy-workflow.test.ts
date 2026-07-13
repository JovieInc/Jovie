import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const workflowPath = resolve(repoRoot, '.github/workflows/ci.yml');
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

describe('deploy workflow Vercel env resolution', () => {
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

  it('uses the Vercel source cache while prebuilt runtime closure is unhealthy', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const deployStep = getStepBlock(
      workflow,
      'Deploy (staging preview, prebuilt)'
    );

    expect(deployStep).toContain("VERCEL_FORCE_SOURCE_DEPLOY: 'true'");
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
    expect(readinessStep).toContain('--timeout 12m');
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
    const promoteStep = getStepBlock(
      promoteJob,
      'Promote specific deployment for this SHA'
    );
    const domainGuardIndex = promoteJob.indexOf(
      '- name: Verify production domains are on canonical Vercel project'
    );
    const promoteIndex = promoteJob.indexOf(
      '- name: Promote specific deployment for this SHA'
    );

    expect(domainGuardIndex).toBeGreaterThanOrEqual(0);
    expect(promoteIndex).toBeGreaterThan(domainGuardIndex);
    expect(promoteJob).toContain(
      'failure_subtype: ${{ steps.domain-guard.outputs.failure_subtype || steps.promote.outputs.failure_subtype }}'
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
    expect(promoteStep).toContain('"https://jov.ie/api/health/build-info"');
    expect(promoteStep).toContain('probe_labels=(');
    expect(promoteStep).toContain('"production-alias"');
    expect(promoteStep).toContain('max_attempts=15');
    expect(promoteStep).toContain('URLs can return 401');
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

describe('canary health gate workflow', () => {
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
});

describe('CI public lighthouse workflow', () => {
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
      'name: neon-db-connection-${{ github.run_id }}'
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
      'name: neon-db-connection-${{ github.run_id }}'
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

describe('CI Neon endpoint pool concurrency (JOV-2497)', () => {
  const neonBranchCreateJobs = [
    'neon-db',
    'ci-lighthouse-dashboard-pr',
    'ci-e2e-smoke',
    'ci-admin-smoke',
  ] as const;

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

    for (const jobKey of neonBranchCreateJobs) {
      const job = getJobBlock(workflow, jobKey);
      expect(job).toContain('concurrency:');
      expect(job).toContain('group: neon-endpoint-pool-${{ github.job }}-');
      expect(job).toContain('cancel-in-progress: false');
    }
  });

  // ci-golden-path deliberately uses ONE constant repo-wide group: it must
  // serialize the Clerk dev instance (purgeStaleClerkTestUsers deletes ALL
  // gp-* users, so two concurrent runs would delete each other's sessions)
  // as well as the Neon pool. See the concurrency comment on the
  // ci-golden-path job in ci.yml — do not parameterize that group. Every
  // other pool group must stay per-job scoped per JOV-2497.
  const intentionallySerializedPoolGroups = [
    'group: neon-endpoint-pool-ci-golden-path',
  ] as const;

  it('scopes branch-creation pool per job so siblings in one workflow are not cancelled', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const poolGroups =
      workflow.match(/group: neon-endpoint-pool-[^\n]+/g) ?? [];

    expect(poolGroups.length).toBeGreaterThan(0);
    for (const group of poolGroups) {
      if (
        intentionallySerializedPoolGroups.includes(
          group.trim() as (typeof intentionallySerializedPoolGroups)[number]
        )
      ) {
        continue;
      }
      expect(group).toContain('${{ github.job }}');
    }
  });

  it('keeps the serialized-group allowlist accurate against the workflow', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    for (const group of intentionallySerializedPoolGroups) {
      expect(workflow).toContain(group);
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

  it('recognizes lighthouse and smoke ephemeral branch name patterns', () => {
    const cleanupAction = readFileSync(
      resolve(repoRoot, '.github/actions/neon-branch-cleanup/action.yml'),
      'utf8'
    );

    expect(cleanupAction).toContain(
      'dashboard|onboarding|admin|chat)-lighthouse-'
    );
    expect(cleanupAction).toContain('admin-smoke-[0-9]+-[0-9]+');
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
      'name: neon-db-connection-${{ github.run_id }}'
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
      'name: neon-db-connection-${{ github.run_id }}'
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
