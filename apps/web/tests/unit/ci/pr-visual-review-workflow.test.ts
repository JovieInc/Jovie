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
});
