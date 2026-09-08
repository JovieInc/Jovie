import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const workflowPath = resolve(repoRoot, '.github/workflows/screenshots.yml');

function getStepBlock(workflow: string, stepName: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line.trim() === `- name: ${stepName}`);

  expect(start, `Missing workflow step: ${stepName}`).toBeGreaterThanOrEqual(0);

  const end = lines.findIndex(
    (line, index) =>
      index > start &&
      (line.trim().startsWith('- name:') || line.trim().startsWith('- uses:'))
  );

  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

function stepIndex(workflow: string, stepName: string): number {
  const index = workflow.indexOf(`- name: ${stepName}`);
  expect(index, `Missing workflow step: ${stepName}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe('Product Screenshots provenance cleanliness', () => {
  it('restores a clean source tree after the server starts and before capture', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const restore = getStepBlock(
      workflow,
      'Restore clean source tree for provenance'
    );

    expect(stepIndex(workflow, 'Start production server')).toBeLessThan(
      stepIndex(workflow, 'Restore clean source tree for provenance')
    );
    expect(
      stepIndex(workflow, 'Restore clean source tree for provenance')
    ).toBeLessThan(stepIndex(workflow, 'Capture exact marketing routes'));
    expect(
      stepIndex(workflow, 'Restore clean source tree for provenance')
    ).toBeLessThan(stepIndex(workflow, 'Capture screenshot catalog'));

    expect(restore).toContain('working-directory: .');
    expect(restore).toContain('git status --porcelain --untracked-files=all');
    expect(restore).toContain('git checkout -- .');
    expect(restore).toContain('git clean -fd');
    expect(restore).not.toContain('git clean -fdx');
    expect(restore).not.toContain('git clean -ffdx');
    expect(restore).not.toMatch(/kill .*SCREENSHOT_SERVER/);
    expect(restore).toContain('exit 1');
  });
});
