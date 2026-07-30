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

function jobBlock(workflow: string, jobId: string, nextJobId?: string) {
  const start = workflow.indexOf(`  ${jobId}:`);
  expect(start, `missing ${jobId} job`).toBeGreaterThanOrEqual(0);
  const end = nextJobId
    ? workflow.indexOf(`\n  ${nextJobId}:`, start)
    : workflow.length;
  expect(end, `missing ${jobId} job boundary`).toBeGreaterThan(start);
  return workflow.slice(start, end);
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

  it('checks exact prior review markers with standalone jq after paginating', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('--paginate --slurp');
    expect(workflow).toContain('| jq -r --arg marker "$MARKER"');
    expect(workflow).toContain('contains($marker)');
    expect(workflow).not.toContain('--jq --arg marker');
  });

  it('keeps capture and screenshot review visibly advisory without terminal queue failures', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const capture = jobBlock(workflow, 'capture', 'review');
    const review = jobBlock(workflow, 'review');

    expect(capture).toContain(
      'name: Capture changed UI (desktop + mobile) (advisory)'
    );
    expect(capture).toContain('continue-on-error: true');
    expect(capture).toMatch(
      /id: build\n        if: steps\.route\.outputs\.should_review == 'true'\n        continue-on-error: true/
    );
    expect(capture).toMatch(
      /id: server\n        if: steps\.route\.outputs\.should_review == 'true' && steps\.build\.outcome == 'success'\n        continue-on-error: true/
    );
    expect(capture).toMatch(
      /id: routed_capture\n        if: steps\.route\.outputs\.should_review == 'true' && steps\.build\.outcome == 'success' && steps\.server\.outcome == 'success'\n        continue-on-error: true/
    );
    expect(capture).toContain('name: Record advisory capture outcome');
    expect(capture).toContain('advisory-outcome.json');
    expect(capture).toContain(
      "status: failedStages.length ? 'unavailable' : 'completed'"
    );
    expect(capture).toContain('name: Upload visual evidence');
    expect(capture).toMatch(
      /id: upload\n        if: always\(\)\n        continue-on-error: true/
    );
    expect(capture).toContain('name: Report artifact upload advisory outcome');
    expect(capture).toContain('if: always()');
    expect(review).toContain('continue-on-error: true');
  });
});
