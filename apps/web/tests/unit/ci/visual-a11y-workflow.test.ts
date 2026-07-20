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
  it('keeps source PR Ready fast and moves layout integration to merge_group', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const prReadyJob = getJobBlock(workflow, 'ci-pr-ready');
    const mergeReadyJob = getJobBlock(workflow, 'ci-merge-group-ready');
    const buildLayoutJob = getJobBlock(workflow, 'ci-build-layout');

    expect(prReadyJob).not.toMatch(/ci-a11y|ci-layout-guard|ci-build-layout/);
    expect(mergeReadyJob).toContain('ci-build-layout');
    expect(mergeReadyJob).toContain(
      'BUILD_LAYOUT_RESULT="${{ needs.ci-build-layout.result }}"'
    );
    expect(buildLayoutJob).toContain('runs-on: ubuntu-latest');
    expect(buildLayoutJob).toContain('Build exact combined head');
    expect(buildLayoutJob).toContain('Run deterministic layout behavior guard');
  });

  it('keeps visual compare informational while refresh remains self-healing', () => {
    const workflow = readFileSync(visualRegressionWorkflowPath, 'utf8');
    const visualJob = getJobBlock(workflow, 'visual-regression');

    expect(workflow).not.toMatch(/^\s*pull_request:/m);
    expect(workflow).not.toMatch(/^\s*merge_group:/m);
    expect(workflow).toMatch(/^\s*schedule:/m);
    expect(workflow).toMatch(/^\s*workflow_dispatch:/m);
    expect(workflow).toContain('Scheduled/manual deep evidence only');
    expect(workflow).not.toContain('Informational on PRs');
    expect(visualJob).not.toContain('continue-on-error:');
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

  it('stages only structured public axe diagnostics without masking failures', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const publicA11yJob = getJobBlock(workflow, 'ci-a11y');

    expect(publicA11yJob).toContain(
      'PLAYWRIGHT_ARTIFACT_PATHS: apps/web/test-results/**/*.json'
    );
    expect(publicA11yJob).toContain(
      'PLAYWRIGHT_JSON_OUTPUT_FILE: test-results/axe-a11y-results.json'
    );
    expect(publicA11yJob).toContain(
      'guard-playwright-artifacts.mjs" --run -- pnpm exec playwright test'
    );
    expect(publicA11yJob).toContain('--reporter=line,json');
    expect(publicA11yJob).toContain('path: apps/web/test-results/**/*.json');
    expect(publicA11yJob).not.toContain('continue-on-error');
    expect(publicA11yJob).not.toContain('.md');
    expect(publicA11yJob).not.toContain('.png');
    expect(publicA11yJob).not.toContain('PLAYWRIGHT_ARTIFACT_ALLOW_MARKDOWN');
    expect(publicA11yJob).not.toContain('PLAYWRIGHT_ARTIFACT_ALLOW_IMAGES');
  });
});
