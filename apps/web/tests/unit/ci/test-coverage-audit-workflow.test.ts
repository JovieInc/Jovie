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

  it('reports failures and cancellations with a provisioned label', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const notifyStep = getStepBlock(workflow, 'Notify on failure');

    expect(notifyStep).toContain('if: failure() || cancelled()');
    expect(notifyStep).toContain(
      'gh label create "test-coverage-audit-failure"'
    );
    expect(notifyStep).toContain('--force');
    expect(notifyStep).toContain('--label "test-coverage-audit-failure"');
  });
});
