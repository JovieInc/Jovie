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

  it('publishes through an app-authored draft PR after coverage, without a main push', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const publishStep = getStepBlock(workflow, 'Open coverage report PR');
    const tokenStep = getStepBlock(
      workflow,
      'Generate report publication token'
    );

    expect(publishStep).toContain('publishCoverageReport');
    expect(publishStep).toContain('steps.report-token.outputs.token');
    expect(tokenStep).toContain('vars.JOVIE_BOT_APP_ID');
    expect(tokenStep).toContain('permission-pull-requests: write');
    expect(
      workflow.indexOf('- name: Generate report publication token')
    ).toBeGreaterThan(workflow.indexOf('- name: Generate heatmap'));
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('contents: read');
    expect(workflow).not.toContain('git push');
    expect(workflow).not.toContain('git pull --rebase');
  });

  it('gates RED-surface decay against the committed snapshot before rewriting it', () => {
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
