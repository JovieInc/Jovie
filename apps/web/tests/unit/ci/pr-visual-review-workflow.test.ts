import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const workflowPath = resolve(
  repoRoot,
  '.github/workflows/pr-visual-review.yml'
);

function jobBlock(workflow: string, jobId: string) {
  const start = workflow.indexOf(`  ${jobId}:`);
  expect(start, `missing ${jobId} job`).toBeGreaterThanOrEqual(0);
  return workflow.slice(start);
}

describe('PR visual review workflow', () => {
  it("uses Playwright's default absolute browser cache after installing Chromium", () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain(
      'pnpm --filter @jovie/web exec playwright install --with-deps chromium'
    );
    expect(workflow).not.toMatch(
      /PLAYWRIGHT_BROWSERS_PATH:\s*~\/\.cache\/ms-playwright/
    );
  });

  it('retires automatic paid model review and keeps capture plus uploads (JOV-6232)', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain(
      'JOV-6232: automatic paid model review is retired. Keep capture and uploads.'
    );
    expect(workflow).not.toContain('--paginate --slurp');
    expect(workflow).not.toContain('Call Grok');
    expect(workflow).not.toContain('Codex fallback');
    expect(workflow).not.toContain('pull-requests: write');
    expect(workflow).not.toMatch(
      /secrets\.|API_KEY|api\.x\.ai|api\.openai\.com/
    );
    expect(workflow).not.toMatch(
      /pr-visual-review\.mjs review|reviewWithConfiguredBackends|reviewWithBackend/
    );
    expect(workflow.match(/^  [a-z][a-z_-]*:$/gm)).toEqual([
      '  pull_request_target:',
      '  capture:',
    ]);
    expect(workflow).toContain('pr-visual-review-capture.mjs');
    expect(workflow).toContain('actions/upload-artifact@');
    expect(workflow).toContain('name: Upload visual evidence');
    expect(workflow).toContain('if-no-files-found: error');
  });

  it('fails capture closed on missing visual evidence (JOV-5459)', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const capture = jobBlock(workflow, 'capture');

    expect(capture).toContain('name: Capture changed UI (desktop + mobile)');
    expect(capture).not.toMatch(/^    continue-on-error: true/m);
    expect(capture).toContain(
      'run: node .github/scripts/pr-visual-evidence-gate.mjs'
    );
    expect(capture).toContain('name: Enforce visual evidence (fail-closed)');
    expect(capture).not.toContain('does not block merging');
    expect(capture).toMatch(
      /id: build\n        if: steps\.route\.outputs\.should_review == 'true'\n        continue-on-error: true/
    );
    expect(capture).toMatch(
      /id: server\n        if: steps\.route\.outputs\.should_review == 'true' && steps\.build\.outcome == 'success'\n        continue-on-error: true/
    );
    expect(capture).toMatch(
      /id: routed_capture\n        if: steps\.route\.outputs\.should_review == 'true' && steps\.build\.outcome == 'success' && steps\.server\.outcome == 'success'\n        continue-on-error: true/
    );
    expect(capture).toContain('name: Upload visual evidence');
    expect(capture).toMatch(
      /id: upload\n        if: always\(\)\n        continue-on-error: true/
    );
    expect(capture).toContain('name: Fail on missing evidence upload');
    expect(capture).toContain('if: always()');
    expect(capture).toContain('JOV-5459');
  });

  it('captures homepage stills when locked homepage copy changes (JOV-5960)', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain("- 'apps/web/data/homepage*.ts'");
  });
});
