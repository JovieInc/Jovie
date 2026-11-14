import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const workflowPath = resolve(
  repoRoot,
  '.github/workflows/test-coverage-audit.yml'
);

function getStepBlock(workflow: string, stepName: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line.trim() === `- name: ${stepName}`);

  expect(start, `Missing workflow step: ${stepName}`).toBeGreaterThanOrEqual(0);

  const block: string[] = [];
  for (let index = start; index < lines.length; index++) {
    const line = lines[index]!;
    if (index > start && line.startsWith('      - name: ')) break;
    block.push(line);
  }

  return block.join('\n');
}

describe('test coverage audit workflow', () => {
  it('runs daily and manually without publishing report PRs', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const triggers = workflow.split('\non:\n')[1]!.split('\npermissions:')[0]!;

    expect(triggers).toContain(
      '  repository_dispatch:\n    types: [clock_test_coverage_audit]'
    );
    expect(triggers).toContain('  workflow_dispatch:');
    expect(triggers).not.toMatch(/^  (push|schedule):/m);
    expect(workflow).not.toContain('Open coverage report PR');
  });

  it('leaves measured time for full coverage plus baseline publication', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const timeout = Number(
      workflow.match(/^\s+timeout-minutes:\s+(\d+)$/m)?.[1]
    );

    expect(timeout).toBeGreaterThanOrEqual(90);
  });

  it('preserves the single non-cancelling coverage producer', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toMatch(
      /concurrency:\n(?:\s+#.*\n)*\s+group: test-coverage-audit\n\s+cancel-in-progress: false/
    );
  });

  it('restores the successful main-run artifact using only read permissions', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const restoreStep = getStepBlock(
      workflow,
      'Restore artifact coverage baseline'
    );

    expect(restoreStep).toContain('restoreCoverageBaseline');
    expect(restoreStep).toContain('GH_TOKEN: ${{ github.token }}');
    expect(
      workflow.indexOf('- name: Restore artifact coverage baseline')
    ).toBeLessThan(workflow.indexOf('- name: Run coverage'));
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('actions: read');
    expect(workflow).not.toContain('create-github-app-token');
    expect(workflow).not.toContain('git push');
    expect(workflow).not.toContain('permission-pull-requests: write');
    const artifacts = getStepBlock(workflow, 'Upload artifacts');
    expect(artifacts).toContain('if: always()');
    expect(artifacts).toContain('name: coverage-audit-${{ github.run_id }}');
    expect(artifacts).toContain('retention-days: 14');
    expect(artifacts).toContain('apps/web/reports/test-coverage-snapshot.json');
    expect(artifacts).toContain('docs/TEST_COVERAGE_HEATMAP.md');
  });

  it('gates RED-surface decay against the restored artifact snapshot before rewriting it', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const checkStep = getStepBlock(
      workflow,
      'Check RED-surface coverage drift'
    );
    const generateIndex = workflow.indexOf('- name: Generate heatmap');
    const checkIndex = workflow.indexOf(
      '- name: Check RED-surface coverage drift'
    );

    expect(checkStep).toContain('pnpm run test:coverage:diff');
    expect(checkIndex).toBeGreaterThan(-1);
    expect(generateIndex).toBeGreaterThan(checkIndex);
  });

  it('keeps standard unit shards coverage-off while the exact-head lane collects', () => {
    const ciWorkflow = readFileSync(
      resolve(repoRoot, '.github/workflows/ci.yml'),
      'utf8'
    );
    // Exact-head V8 collection runs in the ci-exact-head-coverage-shard
    // matrix, which ci-exact-head-coverage merges and ratchets.
    const unitJob = ciWorkflow.slice(
      ciWorkflow.indexOf('  ci-unit-tests:'),
      ciWorkflow.indexOf('  ci-exact-head-coverage-shard:')
    );
    const coverageJob = ciWorkflow.slice(
      ciWorkflow.indexOf('  ci-exact-head-coverage-shard:'),
      ciWorkflow.indexOf('  ci-exact-head-coverage:')
    );

    expect(unitJob).not.toContain('test:coverage');
    expect(coverageJob).toContain('pnpm --filter @jovie/web test:coverage');
    expect(coverageJob).not.toContain('test:coverage:diff');
  });

  it('alerts Slack on failure and does not file GitHub issues', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const notifyStep = getStepBlock(workflow, 'Slack alert on failure');

    expect(notifyStep).toContain('SLACK_WEBHOOK_URL');
    expect(notifyStep).toContain('failure()');
    expect(notifyStep).toContain('curl -sS -X POST');
    expect(workflow).not.toContain('issues: write');
    expect(workflow).not.toContain('gh issue create');
    expect(workflow).not.toContain('__retired_linear_only__');
  });
});
