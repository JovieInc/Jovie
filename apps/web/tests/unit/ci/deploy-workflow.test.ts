import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const workflowPath = resolve(repoRoot, '.github/workflows/ci.yml');
const canaryWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/canary-health-gate.yml'
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
      {
        command: 'vercel pull',
        name: 'Pull env (production)',
      },
      {
        command: 'vercel build',
        name: 'Build (preview target for staging verification)',
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
  });

  it('passes signup readiness keys into the staging preview runtime', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const deployStep = getStepBlock(
      workflow,
      'Deploy (staging preview, prebuilt)'
    );
    const runtimeKeys = [
      'VERCEL_AUTOMATION_BYPASS_SECRET',
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
      'DATABASE_URL',
      'SESSION_SECRET',
      'AI_GATEWAY_API_KEY',
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
      'TURNSTILE_SECRET_KEY',
      'CLERK_PUBLISHABLE_KEY_STAGING',
      'CLERK_SECRET_KEY_STAGING',
    ];

    expect(deployStep).toContain('required_runtime_env=(');
    expect(deployStep).toContain('Missing staging preview runtime env:');

    for (const key of runtimeKeys) {
      expect(deployStep).toContain(key);
      expect(deployStep).toContain(`--env ${key}="\${${key}}"`);
      expect(deployStep).toContain(`${key}: \${{ secrets.${key} }}`);
    }
  });

  it('syncs required signup readiness keys into the configured production Vercel project before pulling env', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const syncStep = getStepBlock(
      workflow,
      'Sync required production env to Vercel project'
    );
    const pullStep = getStepBlock(workflow, 'Pull env (production)');
    const syncIndex = workflow.indexOf(
      '- name: Sync required production env to Vercel project'
    );
    const pullIndex = workflow.indexOf('- name: Pull env (production)');
    const requiredKeys = [
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'CLERK_SECRET_KEY',
      'DATABASE_URL',
      'SESSION_SECRET',
      'AI_GATEWAY_API_KEY',
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
      'TURNSTILE_SECRET_KEY',
    ];

    expect(syncIndex).toBeGreaterThanOrEqual(0);
    expect(pullIndex).toBeGreaterThan(syncIndex);
    expect(syncStep).toContain('required_vercel_env=(');
    expect(syncStep).toContain('vercel env rm "$key" production');
    expect(syncStep).toContain('vercel env add "$key" production');
    expect(syncStep).toContain('--value "${!key}"');
    expect(syncStep).toContain('>/dev/null');
    expect(syncStep).toContain('>/dev/null 2>&1 || true');
    expect(syncStep).toContain('set +x');
    expect(syncStep).toContain(
      'VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}'
    );
    expect(pullStep).toContain(
      'VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}'
    );

    for (const key of requiredKeys) {
      expect(syncStep).toContain(key);
      expect(syncStep).toContain(`${key}: \${{ secrets.${key} }}`);
    }
  });

  it('checks production signup readiness against the deploy env instead of the pulled Vercel file', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const readinessStep = getStepBlock(
      workflow,
      'Check signup readiness (production deploy env)'
    );

    expect(readinessStep).toContain('--target=prd');
    expect(readinessStep).toContain('--source=env');
    expect(readinessStep).not.toContain('--source=vercel-file');
    expect(readinessStep).not.toContain('.vercel/.env.production.local');
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
    expect(promoteStep).toContain('max_attempts=30');
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
    expect(canaryStep).toContain('local max_attempts=30');
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

describe('CI public a11y workflow', () => {
  it('uses seeded isolated Neon fixtures instead of the stable main DB', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const a11yJob = getJobBlock(workflow, 'ci-a11y');
    const createBranchStep = getStepBlock(
      a11yJob,
      'Create ephemeral Neon database branch (with retry)'
    );
    const exportStep = getStepBlock(
      a11yJob,
      'Export DATABASE_URL (ephemeral branch)'
    );
    const migrateStep = getStepBlock(
      a11yJob,
      'Run migrations (ephemeral Neon)'
    );
    const seedStep = getStepBlock(a11yJob, 'Seed public QA fixtures');

    expect(createBranchStep).toContain(
      "if: steps.check_changes.outputs.run_full_ci == 'true'"
    );
    expect(exportStep).toContain(
      "if: steps.check_changes.outputs.run_full_ci == 'true'"
    );
    expect(migrateStep).toContain(
      "if: steps.check_changes.outputs.run_full_ci == 'true'"
    );
    expect(seedStep).toContain(
      "if: steps.check_changes.outputs.run_full_ci == 'true'"
    );

    expect(createBranchStep).not.toContain('run_neon');
    expect(seedStep).not.toContain('run_neon');
    expect(a11yJob).not.toContain('Export DATABASE_URL (main');
  });
});
