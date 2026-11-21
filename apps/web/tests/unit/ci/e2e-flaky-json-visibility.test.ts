import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJobBlock, getStepBlock } from './deploy-workflow-yaml';

const repoRoot = resolve(import.meta.dirname, '../../../../../');
const workflowsRoot = resolve(repoRoot, '.github/workflows');

function workflow(name: string): string {
  return readFileSync(resolve(workflowsRoot, name), 'utf8');
}

/**
 * JOV-12621 slice 6: green-run E2E retries were invisible because lanes overrode
 * reporters with `--reporter=line` and uploaded Playwright artifacts only on
 * failure. The flakiness report needs the JSON reporter's `flaky` status on
 * every completed run, including green ones.
 */
describe('E2E flaky JSON visibility (JOV-12621)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('always emits the Playwright JSON reporter in CI even under producer stage', async () => {
    process.env.CI = 'true';
    process.env.BASE_URL = 'http://localhost:3100';
    process.env.E2E_SKIP_WEB_SERVER = '1';
    process.env.PLAYWRIGHT_ARTIFACT_REQUIRE_PRODUCER_STAGE = 'true';
    delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    delete process.env.JOURNEY_EVIDENCE_REPORT;
    delete process.env.SENTRY_E2E_REPORTING;

    vi.resetModules();
    const { default: config } = await import('../../../playwright.config');
    const reporters = config.reporter;
    expect(Array.isArray(reporters)).toBe(true);
    const json = (reporters as unknown[]).find(
      entry => Array.isArray(entry) && entry[0] === 'json'
    ) as [string, { outputFile?: string }] | undefined;
    expect(json?.[1]?.outputFile).toBe('test-results/results.json');
  });

  it('full browser matrix keeps the config JSON reporter and uploads it on green', () => {
    const source = workflow('e2e-full-matrix.yml');
    const job = getJobBlock(source, 'e2e-full-matrix');
    const run = getStepBlock(job, 'Run E2E tests (${{ matrix.browser }})');
    // Bare `--reporter=line` replaces config reporters and drops JSON flaky status.
    expect(run).not.toMatch(/--reporter=line(?:\s|$|")/);
    expect(run).not.toMatch(/--reporter=line,/);

    const upload = getStepBlock(job, 'Upload Playwright flaky JSON status');
    expect(upload).toMatch(/if:\s*\$\{\{\s*always\(\)/);
    expect(upload).toContain('apps/web/test-results/results.json');
    expect(upload).toContain('playwright-e2e-flaky-json-');
    expect(upload).toContain(
      './.github/actions/upload-safe-playwright-artifact'
    );
  });

  it('changed-evidence nightly uploads Playwright JSON on green runs', () => {
    const source = workflow('nightly-tests.yml');
    const job = getJobBlock(source, 'e2e-tests');
    const upload = getStepBlock(job, 'Upload Playwright flaky JSON status');
    expect(upload).toMatch(/if:\s*\$\{\{\s*always\(\)/);
    expect(upload).toContain("steps.nightly-e2e.outcome != 'skipped'");
    expect(upload).toContain('apps/web/test-results/nightly-results.json');
    expect(upload).toContain('playwright-e2e-flaky-json-nightly-');
    // Failure-only upload must not be the only JSON path.
    expect(upload).not.toContain("outcome == 'failure'");
  });

  it('CI full E2E uploads Playwright JSON on green runs', () => {
    const source = workflow('ci.yml');
    const job = getJobBlock(source, 'ci-e2e-tests');
    const upload = getStepBlock(job, 'Upload Playwright flaky JSON status');
    expect(upload).toMatch(/if:\s*\$\{\{\s*always\(\)/);
    expect(upload).toContain('apps/web/test-results/results.json');
    expect(upload).toContain('playwright-e2e-flaky-json-');
    expect(upload).toContain(
      './.github/actions/upload-safe-playwright-artifact'
    );
  });
});
