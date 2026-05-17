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
      'Pull env (preview)',
      'Build (PR preview)',
      'Pull env (production)',
      'Build (preview target for staging verification)',
    ];

    for (const stepName of steps) {
      const step = getStepBlock(workflow, stepName);

      expect(step).toContain('VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}');
      expect(step).toContain(
        'VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}'
      );
    }
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
