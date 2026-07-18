import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const workflowPath = resolve(repoRoot, '.github/workflows/ci.yml');
const visualRegressionWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/visual-regression.yml'
);

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

describe('CI accessibility and visual gate contracts (JOV-4060)', () => {
  it('fans path-gated axe and layout results into PR Ready', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const prReadyJob = getJobBlock(workflow, 'ci-pr-ready');

    expect(prReadyJob).toContain('ci-a11y,');
    expect(prReadyJob).toContain('ci-layout-guard,');
    expect(prReadyJob).toContain('A11Y_RESULT="${{ needs.ci-a11y.result }}"');
    expect(prReadyJob).toContain(
      'LAYOUT_GUARD_RESULT="${{ needs.ci-layout-guard.result }}"'
    );
    expect(prReadyJob).toContain(
      '"$A11Y_RESULT" != "success" && "$A11Y_RESULT" != "skipped"'
    );
    expect(prReadyJob).toContain(
      '"$LAYOUT_GUARD_RESULT" != "success" && "$LAYOUT_GUARD_RESULT" != "skipped"'
    );
  });

  it('keeps visual compare informational while refresh remains self-healing', () => {
    const workflow = readFileSync(visualRegressionWorkflowPath, 'utf8');
    const visualJob = getJobBlock(workflow, 'visual-regression');

    expect(visualJob).toContain(
      "continue-on-error: ${{ github.event_name == 'pull_request' }}"
    );
    expect(visualJob).toContain('--update-snapshots');
    expect(visualJob).toContain('BRANCH="visual-baselines/auto-update"');
    expect(visualJob).toContain('gh pr create');
    expect(visualJob).toContain('- name: Cleanup Neon branch');
    expect(visualJob).toContain('if: always()');
  });

  it('preserves authenticated axe diagnostics when Playwright fails', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const authenticatedA11yJob = getJobBlock(workflow, 'ci-a11y-authed');

    expect(authenticatedA11yJob).not.toContain('--reporter=line');
    expect(authenticatedA11yJob).toContain(
      'uses: ./.github/actions/upload-safe-playwright-artifact'
    );
    expect(authenticatedA11yJob).toContain('path: |');
    // HTML playwright-report can embed webServer.env secrets — upload
    // only sanitized test-results via the safe artifact action.
    expect(authenticatedA11yJob).not.toContain('apps/web/playwright-report/');
    expect(authenticatedA11yJob).toContain('apps/web/test-results/');
    expect(authenticatedA11yJob).toContain('if-no-files-found: error');
  });
});
