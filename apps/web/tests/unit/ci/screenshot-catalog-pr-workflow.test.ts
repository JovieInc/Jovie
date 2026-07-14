import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const workflowPath = resolve(repoRoot, '.github/workflows/pr-size-guard.yml');

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

describe('PR screenshot catalog integrity enforcement', () => {
  it('detects every source of catalog or public export drift on pull requests', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const detection = getStepBlock(
      workflow,
      'Detect screenshot integrity changes'
    );

    expect(workflow).toContain('pull_request:');
    expect(detection).toContain(
      'git diff --quiet "${{ github.event.pull_request.base.sha }}" HEAD'
    );
    expect(detection).toContain('apps/web/lib/screenshots/');
    expect(detection).toContain('apps/web/screenshot-catalog/current/');
    expect(detection).toContain('apps/web/public/product-screenshots/');
    expect(detection).toContain(
      "'apps/web/scripts/check-screenshot-catalog*.ts'"
    );
    expect(detection).toContain('echo "required=true" >> "$GITHUB_OUTPUT"');
  });

  it('installs checker dependencies and fails the PR path when integrity fails', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const setup = getStepBlock(
      workflow,
      'Set up Node and pnpm for screenshot integrity'
    );
    const enforcement = getStepBlock(
      workflow,
      'Enforce screenshot catalog integrity'
    );
    const requiredCondition =
      "if: steps.screenshot-integrity.outputs.required == 'true'";

    expect(setup).toContain(requiredCondition);
    expect(setup).toContain('uses: ./.github/actions/setup-node-pnpm');
    expect(enforcement).toContain(requiredCondition);
    expect(enforcement).toContain('working-directory: apps/web');
    expect(enforcement).toContain(
      'run: pnpm exec tsx scripts/check-screenshot-catalog.ts'
    );
    expect(enforcement).not.toContain('continue-on-error');
  });
});
