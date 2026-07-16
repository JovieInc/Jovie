import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const workflowPath = resolve(
  repoRoot,
  '.github/workflows/synthetic-monitoring.yml'
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

describe('synthetic monitoring workflow parser', () => {
  it('uses the shared parser module instead of inline skip-as-failure logic', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const parseStep = getStepBlock(workflow, 'Parse test results');

    expect(parseStep).toContain(
      "require('./.github/scripts/parse-synthetic-test-results.js')"
    );
    expect(parseStep).toContain('parseSyntheticTestResults');
    expect(parseStep).toContain('formatGithubOutput');
    expect(parseStep).not.toContain('failed.length > 0 || skipped.length > 0');
  });

  it('uploads public-profile screenshots only through the bounded test-results artifact', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const uploadStep = getStepBlock(workflow, 'Upload test results');

    expect(workflow).not.toContain('Upload Public Profile Smoke Screenshots');
    expect(workflow).not.toContain('public-profile-smoke-screenshots');
    expect(uploadStep).toContain('apps/web/test-results/');
    expect(uploadStep).toContain('retention-days: 30');
  });

  it('runs the required Better Auth account suite behind explicit production gates', () => {
    for (const path of [workflowPath, agentTickWorkflowPath]) {
      const workflow = readFileSync(path, 'utf8');
      const canaryStep = getStepBlock(
        workflow,
        'Run Better Auth Production Account Canary'
      );

      expect(canaryStep).toContain("E2E_SYNTHETIC_MODE: 'true'");
      expect(canaryStep).toContain("E2E_PROD_ACCOUNT_CANARY_ENABLED: 'true'");
      expect(canaryStep).toContain('VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}');
      expect(canaryStep).toContain(
        'tests/e2e/synthetic-better-auth-account.spec.ts'
      );
      expect(workflow).toContain(
        'SYNTHETIC_PLAYWRIGHT_JSON_OUTPUT_FILE: test-results/synthetic-better-auth-account-results.json'
      );
    }
  });
});
