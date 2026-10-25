import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const webRoot = resolve(import.meta.dirname, '../../..');
const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');

function listJourney(config: string) {
  return spawnSync(
    process.execPath,
    [
      playwrightCli,
      'test',
      '--list',
      `--config=${config}`,
      '--project=chromium',
      '--reporter=json',
      'blocking-journey',
    ],
    {
      cwd: webRoot,
      env: { ...process.env, BASE_URL: 'http://localhost:3100' },
      encoding: 'utf8',
      timeout: 20_000,
    }
  );
}

describe('blocking journey configuration', () => {
  beforeAll(() => vi.stubEnv('BASE_URL', 'http://localhost:3100'));
  afterAll(() => vi.unstubAllEnvs());

  it('enables the guarded deterministic chat fallback on its local server', async () => {
    const { default: journeyConfig } = await import(
      '../../../playwright.config.journey'
    );
    expect(journeyConfig.webServer).toMatchObject({
      env: { CHAT_LLM_FAILURE_INJECTION: '1' },
    });
    expect(journeyConfig.retries).toBe(0);
  });

  it('discovers the isolated journey only in its dedicated Playwright suite', () => {
    const dedicated = listJourney('playwright.config.journey.ts');
    expect(dedicated.status, dedicated.stderr).toBe(0);
    const report = JSON.parse(dedicated.stdout);
    expect(report.suites).toHaveLength(1);
    expect(report.suites[0].specs).toHaveLength(1);
    expect(report.suites[0].specs[0].tests).toHaveLength(1);

    const general = listJourney('playwright.config.ts');
    expect(general.status, general.stderr).toBe(1);
    const generalReport = JSON.parse(general.stdout);
    expect(generalReport.suites).toEqual([]);
    expect(generalReport.errors).toEqual([
      expect.objectContaining({
        message: expect.stringContaining('No tests found'),
      }),
    ]);
  }, 45_000);
});
