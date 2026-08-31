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

  // JOV-5459 (Tim lock 2026-08-30): Visual ENOENT is FAIL, not advisory.
  it('fails the capture job closed when visual evidence is missing (JOV-5459)', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const capture = jobBlock(workflow, 'capture', 'review');
    const review = jobBlock(workflow, 'review');

    expect(capture).toContain('name: Capture changed UI (desktop + mobile)');
    // The capture JOB must not swallow its own failure. Individual stages keep
    // continue-on-error so the single fail-closed gate step is the enforcement
    // point after evidence is recorded.
    expect(capture).not.toMatch(/^    continue-on-error: true/m);
    expect(capture).toContain('name: Enforce visual evidence (fail-closed)');
    expect(capture).toContain(
      'run: node .github/scripts/pr-visual-evidence-gate.mjs'
    );
    // The old warning-and-continue advisory outcome is banned.
    expect(capture).not.toContain('Record advisory capture outcome');
    expect(capture).not.toContain('does not block merging');
    expect(capture).toContain('name: Upload visual evidence');
    expect(capture).toMatch(
      /id: upload\n        if: always\(\)\n        continue-on-error: true/
    );
    // A failed evidence upload is missing evidence, so it must exit non-zero.
    expect(capture).toContain('name: Fail on missing evidence upload');
    expect(capture).toContain('exit 1');
    // The AI product-findings review stays advisory; the evidence gate above
    // is the fail-closed surface.
    expect(review).toContain('continue-on-error: true');
  });

  it('fails the baseline refresh on self-healed missing baselines (JOV-5459)', () => {
    const refreshWorkflow = readFileSync(
      resolve(repoRoot, '.github/workflows/visual-regression.yml'),
      'utf8'
    );

    const guardStart = refreshWorkflow.indexOf(
      'name: Fail on self-healed missing baselines (ENOENT is FAIL)'
    );
    expect(guardStart, 'missing ENOENT guard step').toBeGreaterThanOrEqual(0);
    const prCreationStart = refreshWorkflow.indexOf(
      'name: Create or update baseline PR (refresh only)'
    );
    expect(
      guardStart,
      'ENOENT guard must run before the baseline auto-PR'
    ).toBeLessThan(prCreationStart);

    const guardBlock = refreshWorkflow.slice(guardStart, prCreationStart);
    expect(guardBlock).toContain(
      'git ls-files --others --exclude-standard "$SNAPSHOT_DIR"'
    );
    expect(guardBlock).toContain('exit 1');
    expect(guardBlock).toContain(
      'Visual ENOENT is FAIL, not advisory (JOV-5459)'
    );
  });
});
