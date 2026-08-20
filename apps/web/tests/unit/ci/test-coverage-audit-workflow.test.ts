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
  it('leaves enough time for coverage plus baseline publication', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const timeout = Number(
      workflow.match(/^\s+timeout-minutes:\s+(\d+)$/m)?.[1]
    );

    expect(timeout).toBeGreaterThanOrEqual(45);
  });

  it('keeps generated commit message lines within commitlint limits', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const commitStep = getStepBlock(workflow, 'Commit if changed');
    const messageLines = Array.from(
      commitStep.matchAll(/-m "([^"]+)"/g),
      match => match[1]!
    );

    expect(messageLines.length).toBeGreaterThanOrEqual(2);
    for (const line of messageLines) {
      expect(line.length).toBeLessThanOrEqual(100);
    }
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

  it('does not put coverage collection on the merge-queue unit path', () => {
    const ciWorkflow = readFileSync(
      resolve(repoRoot, '.github/workflows/ci.yml'),
      'utf8'
    );

    expect(ciWorkflow).not.toContain('test:coverage:diff');
    expect(ciWorkflow).not.toContain('test:coverage');
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
